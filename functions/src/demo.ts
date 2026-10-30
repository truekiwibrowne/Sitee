import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { buildDemoOrg, isRole, paths } from '@site-streak/shared';

const SANDBOX_HOURS = 24;

const sandboxId = (uid: string) => `demo-${uid}`;

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
  const role: unknown = (request.data as { role?: unknown } | null)?.role;
  if (!isRole(role)) throw new HttpsError('invalid-argument', 'Pick a role to try.');

  const db = getFirestore();
  const orgId = sandboxId(auth.uid);
  if ((await db.doc(paths.org(orgId)).get()).exists) await deleteSandbox(orgId);

  const now = Timestamp.now();
  const docs = buildDemoOrg({
    orgId,
    now,
    expiresAt: Timestamp.fromMillis(now.toMillis() + SANDBOX_HOURS * 60 * 60 * 1000),
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
