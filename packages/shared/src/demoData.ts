import type { TimestampLike } from './common.js';
import { paths } from './paths.js';
import { orgSchema, projectSchema, siteSchema, userSchema, type LeagueTier } from './people.js';
import type { Role } from './roles.js';
import { taskTemplateSchema } from './templates.js';

// The demo company: used by the emulator seed (orgs/demo-org) and by every live
// "Try the demo" sandbox (orgs/demo-{uid}), so both always match.

export type DemoPerson = {
  key: string;
  name: string;
  email: string;
  role: Role;
  siteIds: string[];
  // Demo game state so the Today screen has something to show.
  xpTotal: number;
  streak: number;
  league: LeagueTier;
};

const SITE_A = 'site-a';
const SITE_B = 'site-b';
const PROJECT = 'riverside';
const TIMEZONE = 'Africa/Kampala';

export const DEMO_PEOPLE: DemoPerson[] = [
  { key: 'foreman', name: 'Grace Foreman', email: 'foreman@demo.test', role: 'foreman', siteIds: [SITE_A], xpTotal: 1240, streak: 12, league: 'silver' },
  { key: 'siteManager', name: 'Sam Site', email: 'sitemanager@demo.test', role: 'siteManager', siteIds: [SITE_A], xpTotal: 2310, streak: 21, league: 'gold' },
  { key: 'projectManager', name: 'Pat Project', email: 'pm@demo.test', role: 'projectManager', siteIds: [SITE_A, SITE_B], xpTotal: 980, streak: 5, league: 'bronze' },
  { key: 'constructionManager', name: 'Chris Construction', email: 'cm@demo.test', role: 'constructionManager', siteIds: [SITE_A, SITE_B], xpTotal: 640, streak: 3, league: 'bronze' },
  { key: 'admin', name: 'Alex Admin', email: 'admin@demo.test', role: 'admin', siteIds: [], xpTotal: 0, streak: 0, league: 'bronze' },
];

export type DemoDoc = { path: string; data: Record<string, unknown> };

/**
 * Every document in a demo org, parsed through the shared schemas.
 * `uidFor` decides each person's user id (a seeded account, or the visitor for their chosen role).
 */
export function buildDemoOrg(opts: {
  orgId: string;
  now: TimestampLike;
  uidFor: (person: DemoPerson) => string;
  /** Set for live sandboxes; the cleanup job deletes the org after this time. */
  expiresAt?: TimestampLike;
}): DemoDoc[] {
  const { orgId, now, uidFor } = opts;
  const docs: DemoDoc[] = [];
  const add = (path: string, data: Record<string, unknown>) => docs.push({ path, data });

  add(paths.org(orgId), {
    ...orgSchema.parse({ name: 'Demo Construction Ltd', dailyXpCap: 300, createdAt: now }),
    ...(opts.expiresAt ? { demo: true, expiresAt: opts.expiresAt } : {}),
  });

  add(
    `${paths.projects(orgId)}/${PROJECT}`,
    projectSchema.parse({ name: 'Riverside Apartments', timezone: TIMEZONE, siteIds: [SITE_A, SITE_B], baselineId: null, createdAt: now }),
  );

  for (const [id, name] of [
    [SITE_A, 'Riverside Block A'],
    [SITE_B, 'Riverside Block B'],
  ] as const) {
    add(
      `${paths.sites(orgId)}/${id}`,
      siteSchema.parse({
        name,
        projectId: PROJECT,
        timezone: TIMEZONE,
        memberIds: DEMO_PEOPLE.filter((p) => p.siteIds.includes(id)).map(uidFor),
        geofence: null,
        createdAt: now,
      }),
    );
  }

  for (const p of DEMO_PEOPLE) {
    add(
      `${paths.users(orgId)}/${uidFor(p)}`,
      userSchema.parse({
        name: p.name,
        email: p.email,
        role: p.role,
        siteIds: p.siteIds,
        xpTotal: p.xpTotal,
        streak: p.streak,
        streakFreezes: 0,
        league: p.league,
        reviewAccuracy: null,
        createdAt: now,
      }),
    );
  }

  add(
    `${paths.taskTemplates(orgId)}/daily-site-report`,
    taskTemplateSchema.parse({
      name: 'Daily site report',
      role: 'foreman',
      frequency: 'workday',
      dueTime: '18:00',
      xp: 50,
      reviewRule: 'siteManagerPlusCrossSite',
      unlockRules: [],
      fields: [
        { id: 'weather', label: 'Weather', type: 'pickList', required: true, options: ['Sunny', 'Cloudy', 'Light rain', 'Heavy rain', 'Windy'] },
        { id: 'labour', label: 'Labour on site', type: 'number', required: true, min: 0, unit: 'people' },
        { id: 'photos', label: 'Site photos', type: 'photo', required: true, minPhotos: 3 },
        { id: 'delays', label: 'Delays and cause', type: 'text', required: false },
        { id: 'tomorrow', label: "Tomorrow's plan", type: 'text', required: true },
      ],
      active: true,
      createdAt: now,
    }),
  );

  add(
    `${paths.taskTemplates(orgId)}/rebar-hold-point`,
    taskTemplateSchema.parse({
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
        { id: 'coverMm', label: 'Cover checked', type: 'number', required: true, min: 0, unit: 'mm' },
        { id: 'photos', label: 'Rebar photos', type: 'photo', required: true, minPhotos: 4 },
        { id: 'notes', label: 'Notes', type: 'text', required: false },
      ],
      active: true,
      createdAt: now,
    }),
  );

  return docs;
}
