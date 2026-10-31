import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { buildDemoOrg, isRole, paths } from '@site-streak/shared';

const SANDBOX_HOURS = 24;
/**
 * Most sandboxes the public demo will build per day (UTC). Each is ~20 writes, so this
 * keeps a bot or a burst of traffic well inside Firestore's free daily quota.
 */
const DAILY_SANDBOX_CAP = 200;

const sandboxId = (uid: string) => `demo-${uid}`;

/** The visitor's timezone if it's a real IANA zone, else the demo default. */
function validTimeZone(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 64) return undefined;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return value;
  } catch {
    return undefined;
  }
}

/** Deletes a sandbox's Firestore data and photos. */
async function deleteSandbox(orgId: string) {
  await getFirestore().recursiveDelete(getFirestore().doc(paths.org(orgId)));
  await getStorage().bucket().deleteFiles({ prefix: `orgs/${orgId}/` });
}

/**
 * "Try the demo": gives an anonymous visitor a private copy of the demo company and
 * signs them in as the role they picked. Picking another role starts a fresh copy.
 */
export const startDemo = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  // Only anonymous visitors get sandboxes, so real accounts can never be moved into one.
  if (auth.token.firebase.sign_in_provider !== 'anonymous') {
    throw new HttpsError('failed-precondition', 'The demo is for visitors without an account.');
  }
  const data = request.data as { role?: unknown; timeZone?: unknown } | null;
  const role = data?.role;
  if (!isRole(role)) throw new HttpsError('invalid-argument', 'Pick a role to try.');

  const db = getFirestore();
  // demoStats has no client rules, so only this function can read or write it.
  const counter = db.doc(`demoStats/${new Date().toISOString().slice(0, 10)}`);
  await db.runTransaction(async (tx) => {
    const built = ((await tx.get(counter)).get('sandboxes') as number | undefined) ?? 0;
    if (built >= DAILY_SANDBOX_CAP) {
      throw new HttpsError('resource-exhausted', 'The demo is very busy today. Please try again tomorrow.');
    }
    tx.set(counter, { sandboxes: built + 1 }, { merge: true });
  });

  const orgId = sandboxId(auth.uid);
  if ((await db.doc(paths.org(orgId)).get()).exists) await deleteSandbox(orgId);

  const now = Timestamp.now();
  const docs = buildDemoOrg({
    orgId,
    now,
    expiresAt: Timestamp.fromMillis(now.toMillis() + SANDBOX_HOURS * 60 * 60 * 1000),
    timeZone: validTimeZone(data?.timeZone),
    // The visitor plays the chosen role; everyone else is a made-up colleague.
    uidFor: (p) => (p.role === role ? auth.uid : `${orgId}-${p.key}`),
  });
  const batch = db.batch();
  for (const d of docs) batch.set(db.doc(d.path), d.data);
  await batch.commit();

  await getAuth().setCustomUserClaims(auth.uid, { orgId, role, demo: true });
  logger.info('Demo sandbox started', { orgId, role });
  return { orgId, role };
});

/** Deletes expired sandboxes, their photos and the anonymous visitor accounts. */
export const cleanupDemos = onSchedule('every 6 hours', async () => {
  // Only sandboxes have expiresAt, so a range query on it finds just those.
  const expired = await getFirestore()
    .collection('orgs')
    .where('expiresAt', '<', Timestamp.now())
    .limit(100)
    .get();

  for (const org of expired.docs) {
    await deleteSandbox(org.id);
    await getAuth()
      .deleteUser(org.id.replace(/^demo-/, ''))
      .catch(() => undefined); // Already gone.
  }
  logger.info('Cleaned up demo sandboxes', { count: expired.size });
});
