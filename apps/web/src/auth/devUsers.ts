import type { Role } from '@site-streak/shared';

// Mirrors the users in scripts/seed.ts. Only shown when the app runs against the emulators.
export const DEV_PASSWORD = 'site-streak-dev';

export const DEV_USERS: { email: string; name: string; role: Role }[] = [
  { email: 'foreman@demo.test', name: 'Grace Foreman', role: 'foreman' },
  { email: 'sitemanager@demo.test', name: 'Sam Site', role: 'siteManager' },
  { email: 'pm@demo.test', name: 'Pat Project', role: 'projectManager' },
  { email: 'cm@demo.test', name: 'Chris Construction', role: 'constructionManager' },
  { email: 'admin@demo.test', name: 'Alex Admin', role: 'admin' },
];
