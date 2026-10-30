// Seeds the local emulators: 1 org, 1 project, 2 sites, 1 user per role and the
// two MVP task templates. Safe to re-run; it overwrites the same fixed IDs.
//
//   npm run emulators   (in one terminal)
//   npm run seed        (in another)

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { Role } from '@site-streak/shared';

// Never let this script reach a real project.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const PROJECT_ID = 'demo-site-streak';
// Stops the Admin SDK probing for Google Cloud credentials it doesn't need here.
process.env.GCLOUD_PROJECT = PROJECT_ID;
const ORG_ID = 'demo-org';
const PROJECT = 'riverside';
const SITE_A = 'site-a';
const SITE_B = 'site-b';
const TIMEZONE = 'Africa/Kampala';

// Emulator-only password for the dev sign-in buttons.
const DEV_PASSWORD = 'site-streak-dev';

initializeApp({ projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();
const org = db.doc(`orgs/${ORG_ID}`);
const now = Timestamp.now();

type SeedUser = {
  uid: string;
  name: string;
  email: string;
  role: Role;
  siteIds: string[];
  // Demo game state so the Today screen has something to show.
  xpTotal?: number;
  streak?: number;
  league?: string;
};

const users: SeedUser[] = [
  { uid: 'foreman-1', name: 'Grace Foreman', email: 'foreman@demo.test', role: 'foreman', siteIds: [SITE_A], xpTotal: 1240, streak: 12, league: 'silver' },
  { uid: 'site-manager-1', name: 'Sam Site', email: 'sitemanager@demo.test', role: 'siteManager', siteIds: [SITE_A], xpTotal: 2310, streak: 21 },
  { uid: 'project-manager-1', name: 'Pat Project', email: 'pm@demo.test', role: 'projectManager', siteIds: [SITE_A, SITE_B] },
  { uid: 'construction-manager-1', name: 'Chris Construction', email: 'cm@demo.test', role: 'constructionManager', siteIds: [SITE_A, SITE_B] },
  { uid: 'admin-1', name: 'Alex Admin', email: 'admin@demo.test', role: 'admin', siteIds: [] },
];

async function upsertAuthUser(u: SeedUser) {
  const props = { email: u.email, emailVerified: true, displayName: u.name, password: DEV_PASSWORD };
  try {
    await auth.updateUser(u.uid, props);
  } catch {
    await auth.createUser({ uid: u.uid, ...props });
  }
  // Roles and org live in custom claims; security rules read them from the token.
  await auth.setCustomUserClaims(u.uid, { orgId: ORG_ID, role: u.role });
}

async function seed() {
  await org.set({ name: 'Demo Construction Ltd', createdAt: now });

  await org.collection('projects').doc(PROJECT).set({
    name: 'Riverside Apartments',
    timezone: TIMEZONE,
    siteIds: [SITE_A, SITE_B],
    createdAt: now,
  });

  const sites = [
    { id: SITE_A, name: 'Riverside Block A' },
    { id: SITE_B, name: 'Riverside Block B' },
  ];
  for (const s of sites) {
    await org.collection('sites').doc(s.id).set({
      name: s.name,
      projectId: PROJECT,
      timezone: TIMEZONE,
      memberIds: users.filter((u) => u.siteIds.includes(s.id)).map((u) => u.uid),
      createdAt: now,
    });
  }

  for (const u of users) {
    await upsertAuthUser(u);
    await org.collection('users').doc(u.uid).set({
      name: u.name,
      email: u.email,
      role: u.role,
      siteIds: u.siteIds,
      xpTotal: u.xpTotal ?? 0,
      streak: u.streak ?? 0,
      streakFreezes: 0,
      league: u.league ?? 'bronze',
      reviewAccuracy: null,
      createdAt: now,
    });
  }

  await org.collection('taskTemplates').doc('daily-site-report').set({
    name: 'Daily site report',
    role: 'foreman',
    frequency: 'workday',
    dueTime: '18:00',
    xp: 50,
    reviewRule: 'siteManagerPlusCrossSite',
    unlockRules: [],
    fields: [
      { id: 'weather', label: 'Weather', type: 'pickList', required: true, options: ['Sunny', 'Cloudy', 'Light rain', 'Heavy rain', 'Windy'] },
      { id: 'labour', label: 'Labour on site', type: 'number', required: true, min: 0 },
      { id: 'photos', label: 'Site photos', type: 'photo', required: true, minPhotos: 3 },
      { id: 'delays', label: 'Delays and cause', type: 'text', required: false },
      { id: 'tomorrow', label: "Tomorrow's plan", type: 'text', required: true },
    ],
    active: true,
    createdAt: now,
  });

  await org.collection('taskTemplates').doc('rebar-hold-point').set({
    name: 'Rebar hold point',
    role: 'foreman',
    frequency: 'perHoldPoint',
    dueTime: null,
    xp: 30,
    reviewRule: 'siteManager',
    unlockRules: [],
    fields: [
      { id: 'element', label: 'Element / location', type: 'text', required: true },
      { id: 'barsMatchDrawing', label: 'Bar size and spacing match drawing', type: 'pickList', required: true, options: ['Yes', 'No'] },
      { id: 'coverMm', label: 'Cover checked (mm)', type: 'number', required: true, min: 0 },
      { id: 'photos', label: 'Rebar photos', type: 'photo', required: true, minPhotos: 4 },
      { id: 'notes', label: 'Notes', type: 'text', required: false },
    ],
    active: true,
    createdAt: now,
  });

  console.log(`Seeded org ${ORG_ID}: 2 sites, ${users.length} users, 2 templates.`);
}

seed().catch((err) => {
  console.error('Seed failed. Are the emulators running? (npm run emulators)\n', err);
  process.exit(1);
});
