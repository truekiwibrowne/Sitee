// The task engine against the Firestore emulator: the same handlers the triggers call.
// Run with `npm run test:emulators` (CI does), which starts the emulators first.

import { beforeAll, describe, expect, it } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  buildDemoOrg,
  DEMO_PEOPLE,
  DEMO_TIMEZONE,
  isoWeekId,
  localDateIn,
  paths,
  zonedTimeToUtc,
  type DemoPerson,
} from '@site-streak/shared';
import { handleReview, handleSubmission } from '../../functions/src/work.js';
import { recurringTaskId, runHourlyTick } from '../../functions/src/daily.js';
import { openChestFor } from '../../functions/src/chest.js';
import { cleanupExpiredDemos } from '../../functions/src/demo.js';

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run these inside the emulators: npm run test:emulators');
  process.env.GCLOUD_PROJECT ??= 'demo-site-streak'; // Stops the Admin SDK probing for cloud credentials.
  initializeApp({ projectId: 'demo-site-streak', storageBucket: 'demo-site-streak.appspot.com' });
});

const db = () => getFirestore();
const DEMO_PEOPLE_BY_ROLE = Object.fromEntries(DEMO_PEOPLE.map((p) => [p.role, p])) as Record<DemoPerson['role'], DemoPerson>;
const today = () => localDateIn(DEMO_TIMEZONE);
let orgCount = 0;

/** A fresh copy of the demo company. Real (not demo) unless `sandbox` is set. */
async function seedOrg(opts: { sandbox?: boolean; dailyXpCap?: number } = {}) {
  orgCount++;
  const orgId = opts.sandbox ? `demo-visitor${orgCount}` : `test-org-${orgCount}-${Date.now()}`;
  const uidFor = (p: DemoPerson) =>
    opts.sandbox ? (p.role === 'foreman' ? `visitor${orgCount}` : `${orgId}-${p.key}`) : `${p.key}-${orgCount}`;
  const docs = buildDemoOrg({
    orgId,
    now: Timestamp.now(),
    uidFor,
    ...(opts.sandbox ? { expiresAt: Timestamp.fromMillis(Date.now() + 3_600_000) } : {}),
  });
  const batch = db().batch();
  for (const d of docs) batch.set(db().doc(d.path), d.data);
  await batch.commit();
  if (opts.dailyXpCap) await db().doc(paths.org(orgId)).update({ dailyXpCap: opts.dailyXpCap });
  const uid = (role: DemoPerson['role']) => uidFor(DEMO_PEOPLE_BY_ROLE[role]);
  return { orgId, uid };
}

/** Writes a submission as the phone would, captured at 08:00 site time (on time). */
async function submit(orgId: string, taskId: string, authorId: string, templateId: string | null, answers: Record<string, unknown> = {}) {
  await db().doc(`${paths.submissions(orgId)}/${taskId}`).set({
    taskId,
    templateId,
    authorId,
    siteId: 'site-a',
    answers,
    photos: [],
    gps: null,
    capturedAt: Timestamp.fromMillis(zonedTimeToUtc(today(), '08:00', DEMO_TIMEZONE)),
    syncedAt: Timestamp.now(),
  });
  await handleSubmission(orgId, taskId);
}

const get = async (path: string) => (await db().doc(path).get()).data() ?? {};

describe('onSubmission', () => {
  it('marks the task submitted, counts the streak once and routes a review to the site manager', async () => {
    const { orgId, uid } = await seedOrg();
    const reportId = `${today()}-report`;
    await submit(orgId, reportId, uid('foreman'), 'daily-site-report');

    expect((await get(`${paths.tasks(orgId)}/${reportId}`)).status).toBe('submitted');
    const foreman = await get(`${paths.users(orgId)}/${uid('foreman')}`);
    expect(foreman.streak).toBe(13);
    expect(foreman.lastReportDate).toBe(today());

    const reviewTask = await get(`${paths.tasks(orgId)}/review_${reportId}`);
    expect(reviewTask).toMatchObject({ kind: 'review', assigneeId: uid('siteManager'), status: 'open', submissionId: reportId });

    // A retried trigger changes nothing.
    await handleSubmission(orgId, reportId);
    expect((await get(`${paths.users(orgId)}/${uid('foreman')}`)).streak).toBe(13);
  });

  it('unlocks a task once the one it was waiting on is done', async () => {
    const { orgId, uid } = await seedOrg();
    expect((await get(`${paths.tasks(orgId)}/${today()}-pour`)).status).toBe('locked');
    await submit(orgId, `${today()}-rebar`, uid('foreman'), 'rebar-hold-point');
    expect((await get(`${paths.tasks(orgId)}/${today()}-pour`)).status).toBe('open');
  });

  it('in demo sandboxes, the made-up site manager reviews straight away', async () => {
    const { orgId, uid } = await seedOrg({ sandbox: true });
    const reportId = `${today()}-report`;
    await submit(orgId, reportId, uid('foreman'), 'daily-site-report');
    const review = await get(`${paths.reviews(orgId)}/review_${reportId}`);
    expect(review.reviewerId).toBe(uid('siteManager'));
    expect([2, 3]).toContain(review.stars);
  });
});

describe('onReview', () => {
  async function reviewedReport(stars: 1 | 2 | 3, dailyXpCap?: number) {
    const org = await seedOrg({ dailyXpCap });
    const reportId = `${today()}-report`;
    await submit(org.orgId, reportId, org.uid('foreman'), 'daily-site-report');
    const reviewId = `review_${reportId}`;
    await db().doc(`${paths.reviews(org.orgId)}/${reviewId}`).set({
      submissionId: reportId,
      taskId: reportId,
      reviewerId: org.uid('siteManager'),
      authorId: org.uid('foreman'),
      stars,
      checks: { photosMatchWork: 'yes' },
      comment: 'Good',
      crossSite: false,
      auditedBy: null,
      createdAt: Timestamp.now(),
    });
    await handleReview(org.orgId, reviewId);
    return { ...org, reportId, reviewId };
  }

  it('awards base × stars to the author, review XP to the reviewer, and closes both tasks', async () => {
    const { orgId, uid, reportId, reviewId } = await reviewedReport(3);
    expect((await get(`${paths.users(orgId)}/${uid('foreman')}`)).xpTotal).toBe(1240 + 75); // 50 × 1.5
    expect((await get(`${paths.users(orgId)}/${uid('siteManager')}`)).xpTotal).toBe(2310 + 20);
    expect(await get(`${paths.xpEvents(orgId)}/${reviewId}_author`)).toMatchObject({ amount: 75, base: 50, multiplier: 1.5, source: 'review' });
    expect((await get(`${paths.tasks(orgId)}/${reportId}`)).status).toBe('reviewed');
    expect((await get(`${paths.tasks(orgId)}/${reviewId}`)).status).toBe('reviewed');

    // League: weekly XP goes up and ranks are recomputed.
    const week = isoWeekId(today());
    const foremanRow = await get(`${paths.leagueMembers(orgId, week)}/${uid('foreman')}`);
    expect(foremanRow.weeklyXp).toBe(310 + 75);
    expect(foremanRow.rank).toBe(2); // 385 now beats the PM's 380; the site manager has 440.

    // A retried trigger awards nothing more.
    await handleReview(orgId, reviewId);
    expect((await get(`${paths.users(orgId)}/${uid('foreman')}`)).xpTotal).toBe(1240 + 75);
  });

  it('one star halves the XP', async () => {
    const { orgId, uid } = await reviewedReport(1);
    expect((await get(`${paths.users(orgId)}/${uid('foreman')}`)).xpTotal).toBe(1240 + 25);
  });

  it('respects the daily XP cap', async () => {
    const { orgId, uid, reviewId } = await reviewedReport(3, 60);
    expect((await get(`${paths.xpEvents(orgId)}/${reviewId}_author`)).amount).toBe(60);
    expect((await get(`${paths.users(orgId)}/${uid('foreman')}`)).xpTotal).toBe(1240 + 60);
  });
});

describe('hourly tick', () => {
  // Monday 2 Nov 2026, 19:00 in Kampala: after the 18:00 report deadline.
  const monday = '2026-11-02';
  const evening = new Date(zonedTimeToUtc(monday, '19:00', DEMO_TIMEZONE));

  it('creates the day’s report task once, then resets the streak when it’s missed', async () => {
    const { orgId, uid } = await seedOrg();
    await runHourlyTick(evening);
    const taskPath = `${paths.tasks(orgId)}/${recurringTaskId(monday, 'daily-site-report', uid('foreman'))}`;
    expect((await get(taskPath)).status).toBe('late');
    expect((await get(`${paths.users(orgId)}/${uid('foreman')}`)).streak).toBe(0);
    expect((await get(`${paths.sites(orgId)}/site-a`)).tasksGeneratedFor).toBe(monday);

    // Running again creates nothing new and doesn't re-check.
    await db().doc(`${paths.users(orgId)}/${uid('foreman')}`).update({ streak: 5 });
    await runHourlyTick(evening);
    expect((await get(`${paths.users(orgId)}/${uid('foreman')}`)).streak).toBe(5);
  });

  it('uses a streak freeze instead of resetting, if there is one', async () => {
    const { orgId, uid } = await seedOrg();
    await db().doc(`${paths.users(orgId)}/${uid('foreman')}`).update({ streakFreezes: 1 });
    await runHourlyTick(evening);
    const user = await get(`${paths.users(orgId)}/${uid('foreman')}`);
    expect(user).toMatchObject({ streak: 12, streakFreezes: 0 });
    expect((await get(`${paths.tasks(orgId)}/${recurringTaskId(monday, 'daily-site-report', uid('foreman'))}`)).status).toBe('excused');
  });

  it('deletes expired demo sandboxes', async () => {
    const { orgId } = await seedOrg({ sandbox: true });
    await db().doc(paths.org(orgId)).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await cleanupExpiredDemos();
    expect((await db().doc(paths.org(orgId)).get()).exists).toBe(false);
    expect((await db().collection(paths.users(orgId)).get()).size).toBe(0);
  });
});

describe('daily chest', () => {
  it('opens only when every task is done: +25 XP and a streak freeze, once a day', async () => {
    const { orgId, uid } = await seedOrg();
    const foreman = uid('foreman');
    await expect(openChestFor(orgId, foreman)).rejects.toThrow(/Finish all/);

    const tasks = await db().collection(paths.tasks(orgId)).where('assigneeId', '==', foreman).get();
    await Promise.all(tasks.docs.map((d) => d.ref.update({ status: 'reviewed' })));

    expect(await openChestFor(orgId, foreman)).toEqual({ xp: 25, gotFreeze: true });
    expect(await get(`${paths.users(orgId)}/${foreman}`)).toMatchObject({ xpTotal: 1240 + 25, streakFreezes: 1, chestOpenedOn: today() });
    await expect(openChestFor(orgId, foreman)).rejects.toThrow(/already opened/);
  });
});
