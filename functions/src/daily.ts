import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { FieldValue, getFirestore, Timestamp, type WriteBatch } from 'firebase-admin/firestore';
import {
  isWorkday,
  localDateIn,
  localMinutesIn,
  minutesOf,
  paths,
  siteSchema,
  taskTemplateSchema,
  userSchema,
  weekdayOf,
  zonedTimeToUtc,
  type Site,
  type Task,
  type TaskTemplate,
  type UserDoc,
} from '@site-streak/shared';
import { cleanupExpiredDemos } from './demo.js';

// One hourly job does all the scheduled work, so the project uses a single Cloud Scheduler
// job (three are free per billing account). Each run, for every real (non-demo) site:
//  1. after local midnight, creates the day's recurring tasks (once per day per site);
//  2. after a daily report's due time, checks streaks: a missed report uses a streak
//     freeze if there is one, otherwise the streak resets to 0.
// It also deletes expired demo sandboxes.

/** Recurring task ids are predictable, so the streak check can find them and re-runs are harmless. */
export const recurringTaskId = (date: string, templateId: string, uid: string) => `${date}_${templateId}_${uid}`;

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

type Person = UserDoc & { id: string };

function generateTasks(batch: WriteBatch, orgId: string, siteId: string, site: Site, date: string, templates: (TaskTemplate & { id: string })[], people: Person[]) {
  let created = 0;
  templates.forEach((t, i) => {
    if (!runsOn(t, date)) return;
    for (const p of people) {
      if (p.role !== t.role || !p.siteIds.includes(siteId)) continue;
      const task: Omit<Task, 'createdAt'> & { createdAt: FieldValue } = {
        kind: 'recurring',
        title: t.name,
        templateId: t.id,
        assigneeId: p.id,
        assignedById: null,
        siteId,
        projectId: site.projectId,
        date,
        dueAt: t.dueTime ? Timestamp.fromMillis(zonedTimeToUtc(date, t.dueTime, site.timezone)) : null,
        status: 'open',
        dependsOn: [],
        parentTaskId: null,
        order: 10 + i,
        xp: t.xp,
        submissionId: null,
        createdAt: FieldValue.serverTimestamp(),
      };
      batch.set(getFirestore().doc(`${paths.tasks(orgId)}/${recurringTaskId(date, t.id, p.id)}`), task);
      created++;
    }
  });
  return created;
}

async function checkStreaks(orgId: string, siteId: string, site: Site, date: string, minutesNow: number, templates: (TaskTemplate & { id: string })[], people: Person[]) {
  const db = getFirestore();
  let checked = 0;
  for (const t of templates) {
    const countsForStreak = t.dueTime && (t.frequency === 'workday' || t.frequency === 'daily');
    if (!countsForStreak || !runsOn(t, date) || minutesNow <= minutesOf(t.dueTime!)) continue;
    for (const p of people) {
      if (p.role !== t.role || !p.siteIds.includes(siteId) || p.streakCheckedOn === date) continue;
      const taskRef = db.doc(`${paths.tasks(orgId)}/${recurringTaskId(date, t.id, p.id)}`);
      const userRef = db.doc(`${paths.users(orgId)}/${p.id}`);
      await db.runTransaction(async (tx) => {
        const [taskSnap, userSnap] = await Promise.all([tx.get(taskRef), tx.get(userRef)]);
        const user = userSchema.parse(userSnap.data());
        if (user.streakCheckedOn === date) return;
        const status = taskSnap.get('status') as Task['status'] | undefined;
        const missed = status === 'open' || status === 'late';
        if (missed && user.streakFreezes > 0) {
          tx.update(userRef, { streakFreezes: user.streakFreezes - 1, streakCheckedOn: date });
          tx.update(taskRef, { status: 'excused' });
        } else if (missed) {
          tx.update(userRef, { streak: 0, streakCheckedOn: date });
          tx.update(taskRef, { status: 'late' });
        } else {
          tx.update(userRef, { streakCheckedOn: date });
        }
      });
      checked++;
    }
  }
  return checked;
}

/** One pass of the scheduled work. `now` is a parameter so tests can pick the moment. */
export async function runHourlyTick(now: Date = new Date()) {
  const db = getFirestore();
  const removedSandboxes = await cleanupExpiredDemos(now);
  let created = 0;
  let checked = 0;

  const orgs = await db.collection('orgs').where('demo', '==', false).get();
  for (const org of orgs.docs) {
    const [sitesSnap, templatesSnap, usersSnap] = await Promise.all([
      db.collection(paths.sites(org.id)).get(),
      db.collection(paths.taskTemplates(org.id)).where('active', '==', true).get(),
      db.collection(paths.users(org.id)).get(),
    ]);
    const templates = templatesSnap.docs.map((d) => ({ ...taskTemplateSchema.parse(d.data()), id: d.id }));
    const people = usersSnap.docs.map((d) => ({ ...userSchema.parse(d.data()), id: d.id }));

    for (const siteDoc of sitesSnap.docs) {
      const site = siteSchema.parse(siteDoc.data());
      const date = localDateIn(site.timezone, now);
      if (site.tasksGeneratedFor !== date) {
        const batch = db.batch();
        created += generateTasks(batch, org.id, siteDoc.id, site, date, templates, people);
        batch.update(siteDoc.ref, { tasksGeneratedFor: date });
        await batch.commit();
      }
      checked += await checkStreaks(org.id, siteDoc.id, site, date, localMinutesIn(site.timezone, now), templates, people);
    }
  }
  logger.info('Hourly tick', { removedSandboxes, created, checked });
  return { removedSandboxes, created, checked };
}

export const hourlyTick = onSchedule('every 1 hours', () => runHourlyTick().then(() => undefined));
