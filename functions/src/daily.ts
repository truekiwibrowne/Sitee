import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { FieldValue, getFirestore, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import {
  isWorkday,
  localDateIn,
  localMinutesIn,
  minutesOf,
  paths,
  projectSchema,
  taskTemplateSchema,
  userSchema,
  weekdayOf,
  zonedTimeToUtc,
  zoneSchema,
  type Project,
  type Task,
  type TaskTemplate,
  type UserDoc,
  type Zone,
} from '@site-streak/shared';
import { cleanupExpiredDemos } from './demo.js';

// One hourly job does all the scheduled work, so the project uses a single Cloud Scheduler
// job (three are free per billing account). Each run, for every zone in every real company:
//  1. after local midnight, creates the day's recurring tasks: one per template, per
//     person, per zone they work in (once per day per zone);
//  2. after a daily report's due time, checks streaks. A person's day is judged across all
//     their zones: any missed report uses a streak freeze if they have one, otherwise the
//     streak resets to 0. Assumes a person's zones share a timezone.
// It also deletes expired demo sandboxes.

/** Recurring task ids are predictable, so the streak check can find them and re-runs are harmless. */
export const recurringTaskId = (date: string, templateId: string, zoneId: string, uid: string) =>
  `${date}_${templateId}_${zoneId}_${uid}`;

function runsOn(template: TaskTemplate, date: string): boolean {
  switch (template.frequency) {
    case 'daily':
      return true;
    case 'workday':
      return isWorkday(date);
    case 'weekly':
      return weekdayOf(date) === 1; // Mondays.
    default:
      return false; // Hold points and one-offs are assigned, not scheduled.
  }
}

const countsForStreak = (t: TaskTemplate) => !!t.dueTime && (t.frequency === 'workday' || t.frequency === 'daily');

type Person = UserDoc & { id: string };
type Named<T> = T & { id: string };

function newTask(t: Named<TaskTemplate>, p: Person, zoneId: string, zone: Zone, project: Project, date: string, order: number) {
  const task: Omit<Task, 'createdAt'> & { createdAt: FieldValue } = {
    kind: 'recurring',
    title: t.name,
    templateId: t.id,
    assigneeId: p.id,
    assignedById: null,
    zoneId,
    projectId: zone.projectId,
    date,
    dueAt: t.dueTime ? Timestamp.fromMillis(zonedTimeToUtc(date, t.dueTime, project.timezone)) : null,
    status: 'open',
    dependsOn: [],
    parentTaskId: null,
    order,
    xp: t.xp,
    submissionId: null,
    createdAt: FieldValue.serverTimestamp(),
  };
  return task;
}

/** A missed day: a freeze covers it if there's one, otherwise the streak resets. Every missed report is marked. */
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
    const [projectsSnap, zonesSnap, templatesSnap, usersSnap] = await Promise.all([
      db.collection(paths.projects(org.id)).get(),
      db.collection(paths.zones(org.id)).get(),
      db.collection(paths.taskTemplates(org.id)).where('active', '==', true).get(),
      db.collection(paths.users(org.id)).get(),
    ]);
    const projects = new Map(projectsSnap.docs.map((d) => [d.id, projectSchema.parse(d.data())]));
    const templates = templatesSnap.docs.map((d) => ({ ...taskTemplateSchema.parse(d.data()), id: d.id }));
    const people = usersSnap.docs.map((d) => ({ ...userSchema.parse(d.data()), id: d.id }));
    /** person|date → that day's streak-counting tasks whose due time has passed. */
    const days = new Map<string, { userId: string; date: string; refs: DocumentReference[] }>();

    for (const zoneDoc of zonesSnap.docs) {
      const zone = zoneSchema.parse(zoneDoc.data());
      const project = projects.get(zone.projectId);
      if (!project) continue;
      const date = localDateIn(project.timezone, now);
      const minutesNow = localMinutesIn(project.timezone, now);
      const inZone = people.filter((p) => p.zoneIds.includes(zoneDoc.id));

      if (zone.tasksGeneratedFor !== date) {
        const batch = db.batch();
        templates.forEach((t, i) => {
          if (!runsOn(t, date)) return;
          for (const p of inZone.filter((p) => p.role === t.role)) {
            batch.set(
              db.doc(`${paths.tasks(org.id)}/${recurringTaskId(date, t.id, zoneDoc.id, p.id)}`),
              newTask(t, p, zoneDoc.id, zone, project, date, 10 + i),
            );
            created++;
          }
        });
        batch.update(zoneDoc.ref, { tasksGeneratedFor: date });
        await batch.commit();
      }

      for (const t of templates) {
        if (!countsForStreak(t) || !runsOn(t, date) || minutesNow <= minutesOf(t.dueTime!)) continue;
        for (const p of inZone.filter((p) => p.role === t.role && p.streakCheckedOn !== date)) {
          const key = `${p.id}|${date}`;
          const day = days.get(key) ?? { userId: p.id, date, refs: [] };
          day.refs.push(db.doc(`${paths.tasks(org.id)}/${recurringTaskId(date, t.id, zoneDoc.id, p.id)}`));
          days.set(key, day);
        }
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
