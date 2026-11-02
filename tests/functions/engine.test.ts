// The task engine and company functions against the emulators: the same code the triggers
// and callables run. Run with `npm run test:emulators` (CI does), which starts the emulators.

import { beforeAll, describe, expect, it } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import {
  buildDemoOrg,
  DEMO_PEOPLE,
  DEMO_TIMEZONE,
  isoWeekId,
  localDateIn,
  paths,
  zonedTimeToUtc,
  STARTER_FORMS,
  type DemoPerson,
} from '@site-streak/shared';
import { handleReview, handleSubmission } from '../../functions/src/work.js';
import { recurringTaskId, runHourlyTick } from '../../functions/src/daily.js';
import { openLunchboxFor } from '../../functions/src/lunchbox.js';
import { cleanupExpiredDemos } from '../../functions/src/demo.js';
import { claimInvite, createCompany, inviteMember, removeMember, updateMember } from '../../functions/src/admin.js';

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run these inside the emulators: npm run test:emulators');
  process.env.GCLOUD_PROJECT ??= 'demo-site-streak'; // Stops the Admin SDK probing for cloud credentials.
  initializeApp({ projectId: 'demo-site-streak', storageBucket: 'demo-site-streak.appspot.com' });
});

const db = () => getFirestore();
const today = () => localDateIn(DEMO_TIMEZONE);
const DEMO_PEOPLE_BY_ROLE = Object.fromEntries(DEMO_PEOPLE.map((p) => [p.role, p])) as Record<DemoPerson['role'], DemoPerson>;
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
    toTimestamp: (ms) => Timestamp.fromMillis(ms),
    ...(opts.sandbox ? { expiresAt: Timestamp.fromMillis(Date.now() + 3_600_000) } : {}),
  });
  const batch = db().batch();
  for (const d of docs) batch.set(db().doc(d.path), d.data);
  await batch.commit();
  if (opts.dailyXpCap) await db().doc(paths.org(orgId)).update({ dailyXpCap: opts.dailyXpCap });
  const uid = (role: DemoPerson['role']) => uidFor(DEMO_PEOPLE_BY_ROLE[role]);
  return { orgId, uid };
}

/** Writes a submission as the phone would. By default: opened 07:55, sent 08:00 site time. */
async function submit(
  orgId: string,
  taskId: string,
  authorId: string,
  templateId: string | null,
  timing: { started?: string; sent?: string } = {},
) {
  const at = (time: string) => Timestamp.fromMillis(zonedTimeToUtc(today(), time, DEMO_TIMEZONE));
  await db().doc(`${paths.submissions(orgId)}/${taskId}`).set({
    taskId,
    templateId,
    authorId,
    zoneId: 'zone-a',
    answers: {},
    photos: [],
    gps: null,
    startedAt: at(timing.started ?? '07:55'),
    capturedAt: at(timing.sent ?? '08:00'),
    syncedAt: Timestamp.now(),
  });
  await handleSubmission(orgId, taskId);
}

const get = async (path: string) => (await db().doc(path).get()).data() ?? {};

describe('onSubmission', () => {
  it('marks the task submitted, counts the streak once and routes a review to the zone’s site manager', async () => {
    const { orgId, uid } = await seedOrg();
    const reportId = `${today()}-report`;
    await submit(orgId, reportId, uid('foreman'), 'daily-site-report');

    expect((await get(`${paths.tasks(orgId)}/${reportId}`)).status).toBe('submitted');
    const foreman = await get(`${paths.users(orgId)}/${uid('foreman')}`);
    expect(foreman.streak).toBe(13);
    expect(foreman.lastReportDate).toBe(today());

    const reviewTask = await get(`${paths.tasks(orgId)}/review_${reportId}`);
    expect(reviewTask).toMatchObject({ kind: 'review', assigneeId: uid('siteManager'), zoneId: 'zone-a', status: 'open', submissionId: reportId });

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

describe('onReview: XP = base × stars × earliness × speed', () => {
  async function reviewedReport(stars: 1 | 2 | 3, timing: { started?: string; sent?: string } = {}, dailyXpCap?: number) {
    const org = await seedOrg({ dailyXpCap });
    const reportId = `${today()}-report`;
    await submit(org.orgId, reportId, org.uid('foreman'), 'daily-site-report', timing);
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

  it('early and quick with 3 stars: 50 × 1.5 × 1.25 × 1.1 = 103; the reviewer gets 20; both tasks close', async () => {
    const { orgId, uid, reportId, reviewId } = await reviewedReport(3);
    expect((await get(`${paths.users(orgId)}/${uid('foreman')}`)).xpTotal).toBe(1240 + 103);
    expect((await get(`${paths.users(orgId)}/${uid('siteManager')}`)).xpTotal).toBe(2310 + 20);
    expect(await get(`${paths.xpEvents(orgId)}/${reviewId}_author`)).toMatchObject({
      amount: 103,
      base: 50,
      breakdown: { stars: 1.5, earliness: 1.25, speed: 1.1 },
      source: 'review',
    });
    expect((await get(`${paths.tasks(orgId)}/${reportId}`)).status).toBe('reviewed');
    expect((await get(`${paths.tasks(orgId)}/${reviewId}`)).status).toBe('reviewed');

    // League: weekly XP goes up and ranks are recomputed (413 beats the PM's 380; the site manager has 440).
    const row = await get(`${paths.leagueMembers(orgId, isoWeekId(today()))}/${uid('foreman')}`);
    expect(row).toMatchObject({ weeklyXp: 310 + 103, rank: 2 });

    // A retried trigger awards nothing more.
    await handleReview(orgId, reviewId);
    expect((await get(`${paths.users(orgId)}/${uid('foreman')}`)).xpTotal).toBe(1240 + 103);
  });

  it('late and slow halves it: 50 × 1 × 0.5 × 1 = 25', async () => {
    const { orgId, reviewId } = await reviewedReport(2, { started: '18:00', sent: '19:00' });
    expect(await get(`${paths.xpEvents(orgId)}/${reviewId}_author`)).toMatchObject({ amount: 25, breakdown: { earliness: 0.5, speed: 1 } });
  });

  it('one star still pays something: 50 × 0.5 × 1.25 × 1.1 = 34', async () => {
    const { orgId, uid } = await reviewedReport(1);
    expect((await get(`${paths.users(orgId)}/${uid('foreman')}`)).xpTotal).toBe(1240 + 34);
  });

  it('respects the daily XP cap', async () => {
    const { orgId, uid, reviewId } = await reviewedReport(3, {}, 60);
    expect((await get(`${paths.xpEvents(orgId)}/${reviewId}_author`)).amount).toBe(60);
    expect((await get(`${paths.users(orgId)}/${uid('foreman')}`)).xpTotal).toBe(1240 + 60);
  });
});

describe('hourly tick', () => {
  // Monday 2 Nov 2026, 19:00 in Kampala: after the 18:00 report deadline.
  const monday = '2026-11-02';
  const evening = new Date(zonedTimeToUtc(monday, '19:00', DEMO_TIMEZONE));

  it('creates a report task per zone once, then resets the streak when one is missed', async () => {
    const { orgId, uid } = await seedOrg();
    await runHourlyTick(evening);
    const taskPath = `${paths.tasks(orgId)}/${recurringTaskId(monday, 'daily-site-report', '18:00', 'zone-a', uid('foreman'))}`;
    expect((await get(taskPath)).status).toBe('late');
    expect((await get(`${paths.users(orgId)}/${uid('foreman')}`)).streak).toBe(0);
    expect((await get(`${paths.projects(orgId)}/riverside`)).tasksGeneratedFor).toBe(monday);
    // The foreman isn't in Block B, so no report there.
    expect((await db().doc(`${paths.tasks(orgId)}/${recurringTaskId(monday, 'daily-site-report', '18:00', 'zone-b', uid('foreman'))}`).get()).exists).toBe(false);

    // Running again creates nothing new and doesn't re-check.
    await db().doc(`${paths.users(orgId)}/${uid('foreman')}`).update({ streak: 5 });
    await runHourlyTick(evening);
    expect((await get(`${paths.users(orgId)}/${uid('foreman')}`)).streak).toBe(5);
  });

  it('a foreman in two zones gets a report for each; one freeze covers the whole day', async () => {
    const { orgId, uid } = await seedOrg();
    await db().doc(`${paths.users(orgId)}/${uid('foreman')}`).update({ zoneIds: ['zone-a', 'zone-b'], streakFreezes: 1 });
    await runHourlyTick(evening);
    for (const zone of ['zone-a', 'zone-b']) {
      expect((await get(`${paths.tasks(orgId)}/${recurringTaskId(monday, 'daily-site-report', '18:00', zone, uid('foreman'))}`)).status).toBe('excused');
    }
    expect(await get(`${paths.users(orgId)}/${uid('foreman')}`)).toMatchObject({ streak: 12, streakFreezes: 0 });
  });

  it('deletes expired demo sandboxes', async () => {
    const { orgId } = await seedOrg({ sandbox: true });
    await db().doc(paths.org(orgId)).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await cleanupExpiredDemos();
    expect((await db().doc(paths.org(orgId)).get()).exists).toBe(false);
    expect((await db().collection(paths.users(orgId)).get()).size).toBe(0);
  });
});

describe('forms: schedules, projects and review routing', () => {
  const monday = '2026-11-02';
  const morning = new Date(zonedTimeToUtc(monday, '06:00', DEMO_TIMEZONE));

  async function addForm(orgId: string, id: string, form: Record<string, unknown>) {
    await db().doc(`${paths.taskTemplates(orgId)}/${id}`).set({ ...STARTER_FORMS[id], ...form, createdAt: Timestamp.now() });
  }

  it('a form with two due times makes two tasks; a project-level monthly audit goes to the project manager', async () => {
    const { orgId, uid } = await seedOrg();
    await addForm(orgId, 'toolbox-talk', { dueTimes: ['08:00', '13:00'] });
    // 2 Nov is not the 1st, so move the audit to the 2nd.
    await addForm(orgId, 'internal-audit', { monthDays: [2] });
    await runHourlyTick(morning);
    for (const time of ['08:00', '13:00']) {
      expect((await get(`${paths.tasks(orgId)}/${recurringTaskId(monday, 'toolbox-talk', time, 'zone-a', uid('foreman'))}`)).status).toBe('open');
    }
    const audit = await get(`${paths.tasks(orgId)}/${recurringTaskId(monday, 'internal-audit', '16:00', null, uid('projectManager'))}`);
    expect(audit).toMatchObject({ status: 'open', zoneId: null, assigneeId: uid('projectManager') });
  });

  it('forms only run on the projects they’re for', async () => {
    const { orgId, uid } = await seedOrg();
    await addForm(orgId, 'toolbox-talk', { projectIds: ['some-other-project'] });
    await runHourlyTick(morning);
    expect((await db().doc(`${paths.tasks(orgId)}/${recurringTaskId(monday, 'toolbox-talk', '08:00', 'zone-a', uid('foreman'))}`).get()).exists).toBe(false);
  });

  it('a form with no review pays XP straight away at two stars', async () => {
    const { orgId, uid } = await seedOrg();
    await addForm(orgId, 'toolbox-talk', {});
    const taskId = 'toolbox-today';
    await db().doc(`${paths.tasks(orgId)}/${taskId}`).set({
      ...(await get(`${paths.tasks(orgId)}/${today()}-report`)),
      templateId: 'toolbox-talk',
      title: 'Toolbox talk',
      xp: 20,
      dueAt: Timestamp.fromMillis(zonedTimeToUtc(today(), '07:58', DEMO_TIMEZONE)), // Due 2 min before it's sent: late.
    });
    await submit(orgId, taskId, uid('foreman'), 'toolbox-talk');
    expect((await get(`${paths.tasks(orgId)}/${taskId}`)).status).toBe('reviewed');
    expect((await db().doc(`${paths.tasks(orgId)}/review_${taskId}`).get()).exists).toBe(false);
    // 20 × 1 (two stars) × 0.5 (late) × 1.1 (quick) = 11
    expect(await get(`${paths.xpEvents(orgId)}/auto_${taskId}`)).toMatchObject({ amount: 11, breakdown: { stars: 1, earliness: 0.5, speed: 1.1 } });
  });

  it('a site manager’s report goes to the project manager to review', async () => {
    const { orgId, uid } = await seedOrg();
    await addForm(orgId, 'hs-site-inspection', {});
    const taskId = 'hs-today';
    await db().doc(`${paths.tasks(orgId)}/${taskId}`).set({
      ...(await get(`${paths.tasks(orgId)}/${today()}-report`)),
      assigneeId: uid('siteManager'),
      templateId: 'hs-site-inspection',
      title: 'Health & safety site inspection',
    });
    await submit(orgId, taskId, uid('siteManager'), 'hs-site-inspection');
    expect((await get(`${paths.tasks(orgId)}/review_${taskId}`)).assigneeId).toBe(uid('projectManager'));
  });
});

describe('lunchbox', () => {
  it('opens only when every task is done: +25 XP and a streak freeze, once a day', async () => {
    const { orgId, uid } = await seedOrg();
    const foreman = uid('foreman');
    await expect(openLunchboxFor(orgId, foreman)).rejects.toThrow(/Finish all/);

    const tasks = await db().collection(paths.tasks(orgId)).where('assigneeId', '==', foreman).get();
    await Promise.all(tasks.docs.map((d) => d.ref.update({ status: 'reviewed' })));

    expect(await openLunchboxFor(orgId, foreman)).toEqual({ xp: 25, gotFreeze: true });
    expect(await get(`${paths.users(orgId)}/${foreman}`)).toMatchObject({ xpTotal: 1240 + 25, streakFreezes: 1, lunchboxOpenedOn: today() });
    await expect(openLunchboxFor(orgId, foreman)).rejects.toThrow(/already opened/);
  });
});

describe('companies and invites', () => {
  /** A signed-in caller as the callables see them. */
  function as(uid: string, token: Record<string, unknown>, data: unknown = {}) {
    return { auth: { uid, token: { firebase: { sign_in_provider: 'password' }, ...token } }, data } as unknown as CallableRequest;
  }
  let n = 0;
  async function account(verified = true) {
    n++;
    const email = `person${n}-${Date.now()}@demo.test`;
    const user = await getAuth().createUser({ email, emailVerified: verified });
    return { uid: user.uid, email };
  }

  it('anyone signed in can create a company and becomes its admin, with the default forms', async () => {
    const me = await account();
    const { orgId } = await createCompany.run(as(me.uid, { email: me.email, email_verified: true }, { companyName: 'Acme Build', yourName: 'Ana' }));
    expect(await get(paths.org(orgId))).toMatchObject({ name: 'Acme Build', demo: false });
    expect(await get(`${paths.users(orgId)}/${me.uid}`)).toMatchObject({ name: 'Ana', role: 'admin', avatar: 'brix' });
    expect((await db().collection(paths.taskTemplates(orgId)).get()).size).toBe(2);
    expect((await getAuth().getUser(me.uid)).customClaims).toEqual({ orgId, role: 'admin' });
  });

  it('demo visitors and people already in a company can’t create one', async () => {
    const me = await account();
    await expect(
      createCompany.run({ auth: { uid: me.uid, token: { firebase: { sign_in_provider: 'anonymous' } } }, data: { companyName: 'X', yourName: 'Y' } } as unknown as CallableRequest),
    ).rejects.toThrow(/Demo visitors/);
    await expect(createCompany.run(as(me.uid, { email: me.email, orgId: 'some-org' }, { companyName: 'X', yourName: 'Y' }))).rejects.toThrow(/already in a company/);
  });

  it('an admin invites someone; they join with a verified email and get the role, projects and zones', async () => {
    const { orgId, uid } = await seedOrg();
    const adminToken = { orgId, role: 'admin', email: 'admin@demo.test' };
    const newbie = await account(true);
    await inviteMember.run(as(uid('admin'), adminToken, { email: newbie.email, name: 'Nia', role: 'foreman', projectIds: ['riverside'], zoneIds: ['zone-b'] }));

    const result = await claimInvite.run(as(newbie.uid, { email: newbie.email, email_verified: true }));
    expect(result).toEqual({ orgId, already: false });
    expect(await get(`${paths.users(orgId)}/${newbie.uid}`)).toMatchObject({ name: 'Nia', role: 'foreman', zoneIds: ['zone-b'], xpTotal: 0 });
    expect((await getAuth().getUser(newbie.uid)).customClaims).toEqual({ orgId, role: 'foreman' });
    expect((await db().doc(`invites/${newbie.email}`).get()).exists).toBe(false);
  });

  it('an unverified email can’t claim an invite, and non-admins can’t invite', async () => {
    const { orgId, uid } = await seedOrg();
    const someone = await account(false);
    await inviteMember.run(as(uid('admin'), { orgId, role: 'admin' }, { email: someone.email, name: 'Sly', role: 'admin', projectIds: [], zoneIds: [] }));
    await expect(claimInvite.run(as(someone.uid, { email: someone.email, email_verified: false }))).rejects.toThrow(/Confirm your email/);
    await expect(
      inviteMember.run(as(uid('siteManager'), { orgId, role: 'siteManager' }, { email: 'x@demo.test', name: 'X', role: 'foreman', projectIds: [], zoneIds: [] })),
    ).rejects.toThrow(/Only your company admin/);
  });

  it('invites must use the company’s own projects and zones', async () => {
    const { orgId, uid } = await seedOrg();
    await expect(
      inviteMember.run(as(uid('admin'), { orgId, role: 'admin' }, { email: 'y@demo.test', name: 'Y', role: 'foreman', projectIds: ['someone-elses'], zoneIds: [] })),
    ).rejects.toThrow(/no longer exists/);
  });

  it('admins change roles and zones, can’t demote themselves, and can remove people', async () => {
    const { orgId, uid } = await seedOrg();
    const admin = as(uid('admin'), { orgId, role: 'admin' });
    const member = await account();
    await db().doc(`${paths.users(orgId)}/${member.uid}`).set({ ...(await get(`${paths.users(orgId)}/${uid('foreman')}`)), email: member.email });

    await updateMember.run({ ...admin, data: { uid: member.uid, role: 'siteManager', projectIds: ['riverside'], zoneIds: ['zone-a', 'zone-b'] } } as CallableRequest);
    expect(await get(`${paths.users(orgId)}/${member.uid}`)).toMatchObject({ role: 'siteManager', zoneIds: ['zone-a', 'zone-b'] });
    expect((await getAuth().getUser(member.uid)).customClaims).toEqual({ orgId, role: 'siteManager' });

    await expect(
      updateMember.run({ ...admin, data: { uid: uid('admin'), role: 'foreman', projectIds: [], zoneIds: [] } } as CallableRequest),
    ).rejects.toThrow(/own admin role/);

    await removeMember.run({ ...admin, data: { uid: member.uid } } as CallableRequest);
    expect((await db().doc(`${paths.users(orgId)}/${member.uid}`).get()).exists).toBe(false);
    expect((await getAuth().getUser(member.uid)).customClaims ?? {}).toEqual({});
  });
});
