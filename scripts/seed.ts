// Seeds the local emulators with the demo company (orgs/demo-org): 1 project, 2 sites,
// 1 user per role with sign-in accounts, and the two MVP task templates. The data
// comes from buildDemoOrg in packages/shared, the same source as live demo sandboxes.
// Safe to re-run; it overwrites the same fixed IDs.
//
//   npm run emulators   (in one terminal)
//   npm run seed        (in another)

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { buildDemoOrg, DEMO_PEOPLE, type DemoPerson } from '@site-streak/shared';

// Never let this script reach a real project.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const PROJECT_ID = 'demo-site-streak';
// Stops the Admin SDK probing for Google Cloud credentials it doesn't need here.
process.env.GCLOUD_PROJECT = PROJECT_ID;
const ORG_ID = 'demo-org';

// Emulator-only password for the one-tap dev sign-in buttons (see apps/web SignIn).
const DEV_PASSWORD = 'site-streak-dev';

initializeApp({ projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

const seedUid = (p: DemoPerson) => `${p.key}-1`;

async function upsertAuthUser(p: DemoPerson) {
  const uid = seedUid(p);
  const props = { email: p.email, emailVerified: true, displayName: p.name, password: DEV_PASSWORD };
  try {
    await auth.updateUser(uid, props);
  } catch {
    await auth.createUser({ uid, ...props });
  }
  // Roles and org live in custom claims; security rules read them from the token.
  await auth.setCustomUserClaims(uid, { orgId: ORG_ID, role: p.role });
}

async function seed() {
  const docs = buildDemoOrg({ orgId: ORG_ID, now: Timestamp.now(), uidFor: seedUid, toTimestamp: (ms) => Timestamp.fromMillis(ms) });
  const batch = db.batch();
  for (const d of docs) batch.set(db.doc(d.path), d.data);
  await batch.commit();

  for (const p of DEMO_PEOPLE) await upsertAuthUser(p);

  console.log(`Seeded org ${ORG_ID}: ${docs.length} documents, ${DEMO_PEOPLE.length} sign-in accounts.`);
}

seed().catch((err) => {
  console.error('Seed failed. Are the emulators running? (npm run emulators)\n', err);
  process.exit(1);
});
