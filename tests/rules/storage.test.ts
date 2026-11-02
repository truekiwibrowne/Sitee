import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import 'firebase/compat/storage';
import { paths, photoPath } from '@site-streak/shared';

const ORG = 'demo-org';
const SANDBOX = 'demo-visitor1';
const KB = 1024;
const jpeg = { contentType: 'image/jpeg' };

let env: RulesTestEnvironment;

const storageAs = (uid: string, claims: Record<string, unknown>) => env.authenticatedContext(uid, claims).storage();
const foreman = () => storageAs('f1', { orgId: ORG, role: 'foreman' });
const otherForeman = () => storageAs('f2', { orgId: ORG, role: 'foreman' });
const siteManager = () => storageAs('sm1', { orgId: ORG, role: 'siteManager' });
const outsider = () => storageAs('x1', { orgId: 'other-org', role: 'admin' });
const demoVisitor = () => storageAs('visitor1', { orgId: SANDBOX, role: 'foreman', demo: true });

const bytes = (size: number) => new Uint8Array(size);
// .then() turns the compat UploadTask into a real Promise for assertSucceeds/assertFails.
const upload = (storage: ReturnType<typeof foreman>, path: string, size: number, meta = jpeg) =>
  storage.ref(path).put(bytes(size), meta).then((snapshot) => snapshot);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-site-streak',
    storage: { rules: readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8') },
    // Storage rules look up the task in Firestore.
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearStorage();
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`${paths.tasks(ORG)}/t1`).set({ assigneeId: 'f1', zoneId: 'zone-a' });
    await db.doc(`${paths.tasks(SANDBOX)}/t1`).set({ assigneeId: 'visitor1', zoneId: 'zone-a' });
    await ctx.storage().ref(photoPath(ORG, 'zone-a', 't1', 'existing')).put(bytes(10 * KB), jpeg);
  });
});

describe('photo uploads', () => {
  const myPhoto = photoPath(ORG, 'zone-a', 't1', 'p1');

  it('a foreman can upload a JPEG for their own task', async () => {
    await assertSucceeds(upload(foreman(), myPhoto, 300 * KB));
  });

  it('only JPEGs', async () => {
    await assertFails(upload(foreman(), myPhoto, 300 * KB, { contentType: 'image/png' }));
    await assertFails(upload(foreman(), photoPath(ORG, 'zone-a', 't1', 'p1').replace('.jpg', '.exe'), 300 * KB));
  });

  it('max 1 MB', async () => {
    await assertFails(upload(foreman(), myPhoto, 1100 * KB));
  });

  it("not for someone else's task, the wrong zone or another org", async () => {
    await assertFails(upload(otherForeman(), myPhoto, 300 * KB));
    await assertFails(upload(foreman(), photoPath(ORG, 'zone-b', 't1', 'p1'), 300 * KB));
    await assertFails(upload(outsider(), myPhoto, 300 * KB));
  });

  it('photos cannot be overwritten or deleted', async () => {
    const existing = photoPath(ORG, 'zone-a', 't1', 'existing');
    await assertFails(upload(foreman(), existing, 300 * KB));
    await assertFails(foreman().ref(existing).delete());
  });

  it('demo visitors are capped at 500 KB and stay in their sandbox', async () => {
    await assertSucceeds(upload(demoVisitor(), photoPath(SANDBOX, 'zone-a', 't1', 'p1'), 300 * KB));
    await assertFails(upload(demoVisitor(), photoPath(SANDBOX, 'zone-a', 't1', 'p2'), 700 * KB));
    await assertFails(upload(demoVisitor(), myPhoto, 300 * KB));
  });

  it('only paths for site photos are writable', async () => {
    await assertFails(upload(foreman(), 'anything/else.jpg', 10 * KB));
  });
});

describe('photo reads', () => {
  const existing = photoPath(ORG, 'zone-a', 't1', 'existing');

  it('members of the org can view photos', async () => {
    await assertSucceeds(siteManager().ref(existing).getMetadata());
  });

  it('outsiders and demo visitors cannot', async () => {
    await assertFails(outsider().ref(existing).getMetadata());
    await assertFails(demoVisitor().ref(existing).getMetadata());
  });
});
