import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { FieldValue, getFirestore, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import {
  formAppliesTo,
  formRunsOn,
  localDateIn,
  localMinutesIn,
  minutesOf,
  NO_ZONE,
  paths,
  projectSchema,
  taskTemplateSchema,
  userSchema,
  zonedTimeToUtc,
  zoneSchema,
  type Project,
  type Task,
  type TaskTemplate,
  type UserDoc,
} from '@site-streak/shared';
import { cleanupExpiredDemos } from './demo.js';

// One hourly job does all the scheduled work, so the project uses a single Cloud Scheduler
// job (three are free per billing account). Each run, for every project in every real company:
//  1. after local midnight, creates the day's tasks from every form that runs that day:
//     one per due time, per person in the form's role. Foremen and site managers get one per
//     zone they cover in the project; other roles one per project. Once per project per day.
//  2. once a streak form's due time has passed, judges each person's day: any missed one
//     uses a streak freeze if they have one, otherwise the streak resets to 0.
// It also deletes expired demo sandboxes.

/** Recurring task ids are predictable, so the streak check can find them and re-runs are harmless. */
export const recurringTaskId = (date: string, templateId: string, dueTime: string | null, zoneId: string | null, uid: string) =>
  `${date}_${templateId}_${dueTime ? dueTime.replace(':', '') : 'day'}_${zoneId ?? NO_ZONE}_${uid}`;

type Person = UserDoc & { id: string };
type Form = TaskTemplate & { id: string };

/** Roles that work zone by zone; everyone else works at project level. */
const ZONE_ROLES = new Set(['foreman', 'siteManager']);

/** The places (zones, or the whole project) a person does a form in. */
function placesFor(p: Person, projectZoneIds: string[]): (string | null)[] {
  if (!ZONE_ROLES.has(p.role)) return [null];
  const mine = p.zoneIds.filter((z) => projectZoneIds.includes(z));
  return mine.length ? mine : [null];
}

function newTask(f: Form, assigneeId: string, projectId: string, zoneId: string | null, date: string, dueTime: string | null, project: Project, order: number) {
  const task: Omit<Task, 'createdAt'> & { createdAt: FieldValue } = {
    kind: 'recurring',
    title: f.name,
    templateId: f.id,
    assigneeId,
    assignedById: null,
    zoneId,
    projectId,
    date,
    dueAt: dueTime ? Timestamp.fromMillis(zonedTimeToUtc(date, dueTime, project.timezone)) : null,
    status: 'open',
    dependsOn: [],
    parentTaskId: null,
    order,
    xp: f.xp,
    submissionId: null,
    createdAt: FieldValue.serverTimestamp(),
  };
  return task;
}

/** A missed day: a freeze covers it if there's one, otherwise the streak resets. Every missed task is marked. */
async function judgeDay(orgId: string, userId: string, date: string, taskRefs: DocumentReference[]) {
  const db = getFirestore();
  const userRef = db.doc(`${paths.users(orgId)}/${userId}`);
  await db.runTransaction(async (tx) => {
    const [userSnap, ...taskSnaps] = await Promise.all([tx.get(userRef), ...taskRefs.map((r) => tx.get(r))]);
    const user = userSchema.parse(userSnap.data());
    if (user.streakCheckedOn === date) return;
    const missed = taskSnaps.filter((s) => ['open', 'late'].includes(s.get('status') as string));
    if (missed.length && user.streakFreezes > 0) {
      tx.update(userRef, { streakFreezes: user.streakFreezes - 1, streakCheckedOn: date });
      for (const m of missed) tx.update(m.ref, { status: 'excused' });
    } else if (missed.length) {
      tx.update(userRef, { streak: 0, streakCheckedOn: date });
      for (const m of missed) tx.update(m.ref, { status: 'late' });
    } else {
      tx.update(userRef, { streakCheckedOn: date });
    }
  });
}

/** One pass of the scheduled work. `now` is a parameter so tests can pick the moment. */
export async function runHourlyTick(now: Date = new Date()) {
  const db = getFirestore();
  const removedSandboxes = await cleanupExpiredDemos(now);
  let created = 0;
  let judged = 0;

  const orgs = await db.collection('orgs').where('demo', '==', false).get();
  for (const org of orgs.docs) {
    const [projectsSnap, zonesSnap, formsSnap, usersSnap] = await Promise.all([
      db.collection(paths.projects(org.id)).get(),
      db.collection(paths.zones(org.id)).get(),
      db.collection(paths.taskTemplates(org.id)).where('active', '==', true).get(),
      db.collection(paths.users(org.id)).get(),
    ]);
    const zones = zonesSnap.docs.map((d) => ({ ...zoneSchema.parse(d.data()), id: d.id }));
    const forms = formsSnap.docs.flatMap((d) => {
      const parsed = taskTemplateSchema.safeParse(d.data());
      if (!parsed.success) logger.warn('Skipping malformed form', { orgId: org.id, formId: d.id });
      return parsed.success ? [{ ...parsed.data, id: d.id }] : [];
    });
    const people = usersSnap.docs.map((d) => ({ ...userSchema.parse(d.data()), id: d.id }));
    /** person|date → that day's streak-form tasks whose due time has passed. */
    const days = new Map<string, { userId: string; date: string; refs: DocumentReference[] }>();

    for (const projectDoc of projectsSnap.docs) {
      const project = projectSchema.parse(projectDoc.data());
      const date = localDateIn(project.timezone, now);
      const minutesNow = localMinutesIn(project.timezone, now);
      const projectZoneIds = zones.filter((z) => z.projectId === projectDoc.id).map((z) => z.id);
      const todays = forms.filter((f) => formAppliesTo(f, projectDoc.id) && formRunsOn(f, date));
      const onProject = people.filter((p) => p.projectIds.includes(projectDoc.id));
      const generate = project.tasksGeneratedFor !== date;
      const batch = db.batch();

      todays.forEach((f, i) => {
        const slots = f.dueTimes.length ? f.dueTimes : [null];
        for (const p of onProject.filter((p) => p.role === f.role)) {
          for (const zoneId of placesFor(p, projectZoneIds)) {
            slots.forEach((dueTime, s) => {
              const ref = db.doc(`${paths.tasks(org.id)}/${recurringTaskId(date, f.id, dueTime, zoneId, p.id)}`);
              if (generate) {
                batch.set(ref, newTask(f, p.id, projectDoc.id, zoneId, date, dueTime, project, 10 + i * 12 + s));
                created++;
              }
              if (f.countsForStreak && dueTime && minutesNow > minutesOf(dueTime) && p.streakCheckedOn !== date) {
                const key = `${p.id}|${date}`;
                const day = days.get(key) ?? { userId: p.id, date, refs: [] };
                day.refs.push(ref);
                days.set(key, day);
              }
            });
          }
        }
      });
      if (generate) {
        batch.update(projectDoc.ref, { tasksGeneratedFor: date });
        await batch.commit();
      }
    }

    for (const day of days.values()) {
      await judgeDay(org.id, day.userId, day.date, day.refs);
      judged++;
    }
  }
  logger.info('Hourly tick', { removedSandboxes, created, judged });
  return { removedSandboxes, created, judged };
}

export const hourlyTick = onSchedule('every 1 hours', () => runHourlyTick().then(() => undefined));
