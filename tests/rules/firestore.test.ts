import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { CHARACTERS, paths, SERVER_ONLY_USER_FIELDS } from '@site-streak/shared';

const ORG = 'demo-org';
const OTHER_ORG = 'other-org';
const SANDBOX = 'demo-visitor1';

const { serverTimestamp } = firebase.firestore.FieldValue;
const { Timestamp } = firebase.firestore;

let env: RulesTestEnvironment;

const as = (uid: string, claims: Record<string, unknown>) => env.authenticatedContext(uid, claims).firestore();
const foreman = () => as('f1', { orgId: ORG, role: 'foreman' });
const otherForeman = () => as('f2', { orgId: ORG, role: 'foreman' });
const siteManager = () => as('sm1', { orgId: ORG, role: 'siteManager' });
const admin = () => as('a1', { orgId: ORG, role: 'admin' });
const outsider = () => as('x1', { orgId: OTHER_ORG, role: 'admin' });
const demoVisitor = () => as('visitor1', { orgId: SANDBOX, role: 'foreman', demo: true });

const userDoc = (name: string, role: string) => ({
  name,
  email: `${name}@demo.test`,
  avatar: 'brix',
  role,
  projectIds: ['riverside'],
  zoneIds: ['zone-a'],
  xpTotal: 100,
  streak: 3,
  streakFreezes: 0,
  league: 'bronze',
  reviewAccuracy: null,
  createdAt: Timestamp.now(),
});

const taskDoc = (over: Record<string, unknown>) => ({
  kind: 'recurring',
  title: 'Daily site report',
  templateId: 'daily-site-report',
  assigneeId: 'f1',
  assignedById: null,
  zoneId: 'zone-a',
  projectId: 'riverside',
  date: '2026-10-30',
  dueAt: null,
  status: 'open',
  dependsOn: [],
  parentTaskId: null,
  xp: 50,
  submissionId: null,
  createdAt: Timestamp.now(),
  ...over,
});

const submission = (over: Record<string, unknown> = {}) => ({
  taskId: 't1',
  templateId: 'daily-site-report',
  authorId: 'f1',
  zoneId: 'zone-a',
  answers: { weather: 'Sunny', labour: 12, photos: ['p1', 'p2', 'p3'], delays: null, tomorrow: 'Pour slab B' },
  photos: [],
  gps: null,
  startedAt: Timestamp.now(),
  capturedAt: Timestamp.now(),
  syncedAt: serverTimestamp(),
  ...over,
});

const review = (over: Record<string, unknown> = {}) => ({
  submissionId: 'tDone',
  taskId: 'tDone',
  reviewerId: 'sm1',
  authorId: 'f1',
  stars: 3,
  checks: { photosMatchWork: 'yes' },
  comment: 'Great photos.',
  crossSite: false,
  auditedBy: null,
  createdAt: serverTimestamp(),
  ...over,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-site-streak',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(paths.org(ORG)).set({ name: 'Demo', dailyXpCap: 300, createdAt: Timestamp.now() });
    await db.doc(`${paths.users(ORG)}/f1`).set(userDoc('Grace', 'foreman'));
    await db.doc(`${paths.users(ORG)}/sm1`).set(userDoc('Sam', 'siteManager'));
    await db.doc(`${paths.taskTemplates(ORG)}/daily-site-report`).set({ name: 'Daily site report' });
    await db.doc(`${paths.tasks(ORG)}/t1`).set(taskDoc({}));
    await db.doc(`${paths.tasks(ORG)}/tOther`).set(taskDoc({ assigneeId: 'f2' }));
    await db.doc(`${paths.tasks(ORG)}/tDone`).set(taskDoc({ status: 'submitted', submissionId: 'tDone' }));
    await db.doc(`${paths.submissions(ORG)}/tDone`).set({ ...submission({ taskId: 'tDone' }), syncedAt: Timestamp.now() });
    await db.doc(`${paths.tasks(ORG)}/r1`).set(
      taskDoc({ kind: 'review', title: 'Review report', templateId: null, assigneeId: 'sm1', submissionId: 'tDone' }),
    );
    await db.doc(`${paths.xpEvents(ORG)}/e1`).set({ userId: 'f1', amount: 50 });
    await db.doc(`${paths.trainingModules(ORG)}/m1/private/answerKey`).set({ correct: { q1: 1 } });
    await db.doc(paths.org(SANDBOX)).set({ name: 'Demo sandbox', dailyXpCap: 300, createdAt: Timestamp.now() });
  });
});

describe('XP and game state are server-only', () => {
  it('nobody can write an xpEvent, not even an admin', async () => {
    const event = { userId: 'f1', source: 'review', base: 50, multiplier: 1.5, amount: 75 };
    await assertFails(foreman().collection(paths.xpEvents(ORG)).add(event));
    await assertFails(siteManager().collection(paths.xpEvents(ORG)).add(event));
    await assertFails(admin().collection(paths.xpEvents(ORG)).add(event));
    await assertFails(foreman().doc(`${paths.xpEvents(ORG)}/e1`).update({ amount: 5000 }));
  });

  it.each(SERVER_ONLY_USER_FIELDS)(
    'a user cannot change their own %s',
    async (field) => {
      const value =
        field === 'role' ? 'admin'
        : field === 'league' ? 'platinum'
        : field === 'projectIds' || field === 'zoneIds' ? ['other']
        : field.endsWith('On') || field === 'lastReportDate' ? '2026-01-01'
        : 999;
      await assertFails(foreman().doc(`${paths.users(ORG)}/f1`).update({ [field]: value }));
    },
  );

  it('a user can change their own name and avatar, and only those', async () => {
    await assertSucceeds(foreman().doc(`${paths.users(ORG)}/f1`).update({ name: 'Grace N.' }));
    await assertSucceeds(foreman().doc(`${paths.users(ORG)}/f1`).update({ avatar: 'blocx' }));
    for (const avatar of CHARACTERS) await assertSucceeds(foreman().doc(`${paths.users(ORG)}/f1`).update({ avatar }));
    await assertFails(foreman().doc(`${paths.users(ORG)}/f1`).update({ avatar: 'not-a-character' }));
    await assertFails(foreman().doc(`${paths.users(ORG)}/f1`).update({ name: 'Grace', xpTotal: 999 }));
    await assertFails(foreman().doc(`${paths.users(ORG)}/sm1`).update({ name: 'Hacked' }));
  });

  it('nobody can create their own user doc or league entry', async () => {
    await assertFails(foreman().doc(`${paths.users(ORG)}/f9`).set(userDoc('New', 'foreman')));
    await assertFails(foreman().doc(`${paths.leagueMembers(ORG, '2026-W44')}/f1`).set({ weeklyXp: 9999 }));
  });

  it('task status and unlocks cannot be changed from the phone', async () => {
    await assertFails(foreman().doc(`${paths.tasks(ORG)}/t1`).update({ status: 'reviewed' }));
    await assertFails(siteManager().doc(`${paths.tasks(ORG)}/t1`).update({ status: 'reviewed' }));
    await assertFails(foreman().collection(paths.tasks(ORG)).add(taskDoc({ xp: 1000 })));
  });
});

describe('org isolation', () => {
  it('members can read their own org', async () => {
    await assertSucceeds(foreman().doc(paths.org(ORG)).get());
    await assertSucceeds(foreman().doc(`${paths.users(ORG)}/sm1`).get());
  });

  it('people from another org cannot read anything', async () => {
    await assertFails(outsider().doc(paths.org(ORG)).get());
    await assertFails(outsider().doc(`${paths.users(ORG)}/f1`).get());
    await assertFails(outsider().doc(`${paths.taskTemplates(ORG)}/daily-site-report`).get());
  });

  it('demo visitors only see their own sandbox', async () => {
    await assertSucceeds(demoVisitor().doc(paths.org(SANDBOX)).get());
    await assertFails(demoVisitor().doc(paths.org(ORG)).get());
    await assertFails(demoVisitor().doc(`${paths.users(ORG)}/f1`).get());
  });

  it('signed-out visitors cannot read anything', async () => {
    await assertFails(env.unauthenticatedContext().firestore().doc(paths.org(ORG)).get());
  });
});

describe('tasks', () => {
  it('foremen read their own tasks; managers read all', async () => {
    await assertSucceeds(foreman().doc(`${paths.tasks(ORG)}/t1`).get());
    await assertFails(foreman().doc(`${paths.tasks(ORG)}/tOther`).get());
    await assertSucceeds(siteManager().doc(`${paths.tasks(ORG)}/tOther`).get());
  });
});

describe('submissions', () => {
  const ref = (db: firebase.firestore.Firestore, id = 't1') => db.doc(`${paths.submissions(ORG)}/${id}`);

  it('a foreman can submit their own open task', async () => {
    await assertSucceeds(ref(foreman()).set(submission()));
  });

  it("cannot submit someone else's task", async () => {
    await assertFails(ref(foreman(), 'tOther').set(submission({ taskId: 'tOther' })));
    await assertFails(ref(otherForeman()).set(submission({ authorId: 'f2' })));
  });

  it('cannot pretend to be another author', async () => {
    await assertFails(ref(foreman()).set(submission({ authorId: 'f2' })));
  });

  it('the doc id must be the task id', async () => {
    await assertFails(foreman().doc(`${paths.submissions(ORG)}/random-id`).set(submission()));
  });

  it('cannot backdate when it synced', async () => {
    await assertFails(ref(foreman()).set(submission({ syncedAt: Timestamp.fromMillis(0) })));
  });

  it('cannot add extra fields', async () => {
    await assertFails(ref(foreman()).set(submission({ xpAwarded: 500 })));
  });

  it('cannot resubmit a task that is already submitted', async () => {
    await assertFails(ref(foreman(), 'tDone').set(submission({ taskId: 'tDone' })));
  });

  it('cannot edit or delete after submitting', async () => {
    await assertSucceeds(ref(foreman()).set(submission()));
    await assertFails(ref(foreman()).update({ answers: {} }));
    await assertFails(ref(foreman()).delete());
  });

  it('the author and managers can read it; other foremen cannot', async () => {
    await assertSucceeds(ref(foreman(), 'tDone').get());
    await assertSucceeds(ref(siteManager(), 'tDone').get());
    await assertFails(ref(otherForeman(), 'tDone').get());
  });
});

describe('reviews', () => {
  const ref = (db: firebase.firestore.Firestore, id = 'r1') => db.doc(`${paths.reviews(ORG)}/${id}`);

  it('the assigned reviewer can review', async () => {
    await assertSucceeds(ref(siteManager()).set(review()));
  });

  it('nobody else can use that review task', async () => {
    await assertFails(ref(admin()).set(review({ reviewerId: 'a1' })));
    await assertFails(ref(foreman()).set(review({ reviewerId: 'f1' })));
  });

  it('stars must be 1 to 3', async () => {
    await assertFails(ref(siteManager()).set(review({ stars: 4 })));
    await assertFails(ref(siteManager()).set(review({ stars: 0 })));
  });

  it('cannot misattribute the author or pre-set an audit', async () => {
    await assertFails(ref(siteManager()).set(review({ authorId: 'f2' })));
    await assertFails(ref(siteManager()).set(review({ auditedBy: 'sm1' })));
  });

  it('cannot change stars after submitting', async () => {
    await assertSucceeds(ref(siteManager()).set(review({ stars: 1 })));
    await assertFails(ref(siteManager()).update({ stars: 3 }));
  });
});

describe('setup collections', () => {
  it('only admins can edit templates', async () => {
    const tpl = paths.taskTemplates(ORG);
    await assertSucceeds(admin().doc(`${tpl}/daily-site-report`).update({ name: 'Daily report' }));
    await assertFails(siteManager().doc(`${tpl}/daily-site-report`).update({ name: 'Mine now' }));
    await assertFails(foreman().doc(`${tpl}/new`).set({ name: 'Free XP' }));
  });

  it('quiz answer keys are hidden from everyone, admins included', async () => {
    await assertFails(admin().doc(`${paths.trainingModules(ORG)}/m1/private/answerKey`).get());
    await assertFails(foreman().doc(`${paths.trainingModules(ORG)}/m1/private/answerKey`).get());
  });

  it('admins can read their own company’s invites; nobody can write them', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('invites/mine@demo.test').set({ orgId: ORG, role: 'foreman' });
      await ctx.firestore().doc('invites/theirs@demo.test').set({ orgId: OTHER_ORG, role: 'foreman' });
    });
    await assertSucceeds(admin().doc('invites/mine@demo.test').get());
    await assertFails(admin().doc('invites/theirs@demo.test').get());
    await assertFails(siteManager().doc('invites/mine@demo.test').get());
    await assertFails(admin().doc('invites/new@demo.test').set({ orgId: ORG, role: 'admin' }));
    // The invitee can't peek either; claiming happens in a Cloud Function.
    await assertFails(env.authenticatedContext('newbie', { email: 'mine@demo.test' }).firestore().doc('invites/mine@demo.test').get());
  });

  it('admins can rename the company, and change nothing else on it', async () => {
    await assertSucceeds(admin().doc(paths.org(ORG)).update({ name: 'New name' }));
    await assertFails(admin().doc(paths.org(ORG)).update({ dailyXpCap: 99999 }));
    await assertFails(siteManager().doc(paths.org(ORG)).update({ name: 'Mine' }));
  });

  it('admins can add projects and zones; zones must belong to a real project', async () => {
    const project = { name: 'Harbour Tower', timezone: 'Africa/Kampala', address: '', baselineId: null, createdAt: Timestamp.now() };
    await assertSucceeds(admin().doc(`${paths.projects(ORG)}/harbour`).set(project));
    await assertSucceeds(admin().doc(`${paths.zones(ORG)}/z1`).set({ name: 'Level 1', projectId: 'harbour', geofence: null, createdAt: Timestamp.now() }));
    await assertFails(admin().doc(`${paths.zones(ORG)}/z2`).set({ name: 'Ghost', projectId: 'nope', geofence: null, createdAt: Timestamp.now() }));
    await assertFails(siteManager().doc(`${paths.projects(ORG)}/p2`).set(project));
  });

  it('unknown collections are denied', async () => {
    await assertFails(admin().doc(`orgs/${ORG}/whatever/x`).set({ a: 1 }));
    await assertFails(admin().doc('somethingElse/x').get());
  });
});
