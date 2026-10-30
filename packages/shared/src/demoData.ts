import type { TimestampLike } from './common.js';
import { paths } from './paths.js';
import { orgSchema, projectSchema, siteSchema, userSchema, type LeagueTier } from './people.js';
import type { Role } from './roles.js';
import { leagueMemberSchema } from './game.js';
import { taskTemplateSchema } from './templates.js';
import { isoWeekId, localDateIn } from './time.js';
import { taskSchema } from './work.js';

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
  weeklyXp: number;
  streak: number;
  league: LeagueTier;
};

const SITE_A = 'site-a';
const SITE_B = 'site-b';
const PROJECT = 'riverside';
const TIMEZONE = 'Africa/Kampala';

export const DEMO_PEOPLE: DemoPerson[] = [
  { key: 'foreman', name: 'Grace Foreman', email: 'foreman@demo.test', role: 'foreman', siteIds: [SITE_A], xpTotal: 1240, weeklyXp: 310, streak: 12, league: 'silver' },
  { key: 'siteManager', name: 'Sam Site', email: 'sitemanager@demo.test', role: 'siteManager', siteIds: [SITE_A], xpTotal: 2310, weeklyXp: 420, streak: 21, league: 'gold' },
  { key: 'projectManager', name: 'Pat Project', email: 'pm@demo.test', role: 'projectManager', siteIds: [SITE_A, SITE_B], xpTotal: 980, weeklyXp: 380, streak: 5, league: 'bronze' },
  { key: 'constructionManager', name: 'Chris Construction', email: 'cm@demo.test', role: 'constructionManager', siteIds: [SITE_A, SITE_B], xpTotal: 640, weeklyXp: 150, streak: 3, league: 'bronze' },
  { key: 'admin', name: 'Alex Admin', email: 'admin@demo.test', role: 'admin', siteIds: [], xpTotal: 0, weeklyXp: 0, streak: 0, league: 'bronze' },
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

  // Today's league table, ranked by weekly XP.
  const today = localDateIn(TIMEZONE, new Date(now.toMillis()));
  const ranked = [...DEMO_PEOPLE].sort((a, b) => b.weeklyXp - a.weeklyXp);
  ranked.forEach((p, i) => {
    add(
      `${paths.leagueMembers(orgId, isoWeekId(today))}/${uidFor(p)}`,
      leagueMemberSchema.parse({ userId: uidFor(p), tier: p.league, weeklyXp: p.weeklyXp, rank: i + 1 }),
    );
  });

  // The foreman's day, as in the Today mockup. From step 7 the daily scheduler creates these.
  const foreman = DEMO_PEOPLE.find((p) => p.role === 'foreman')!;
  const siteManager = DEMO_PEOPLE.find((p) => p.role === 'siteManager')!;
  const task = (key: string, fields: Record<string, unknown>) =>
    add(
      `${paths.tasks(orgId)}/${today}-${key}`,
      taskSchema.parse({
        kind: 'recurring',
        assigneeId: uidFor(foreman),
        assignedById: null,
        siteId: SITE_A,
        projectId: PROJECT,
        date: today,
        dueAt: null,
        status: 'open',
        dependsOn: [],
        parentTaskId: null,
        submissionId: null,
        createdAt: now,
        ...fields,
      }),
    );
  task('toolbox', { kind: 'assigned', title: 'Toolbox talk', templateId: null, assignedById: uidFor(siteManager), status: 'reviewed', order: 0, xp: 10 });
  task('report', { title: 'Daily site report', templateId: 'daily-site-report', order: 1, xp: 50 });
  task('rebar', { kind: 'assigned', title: 'Rebar check', templateId: 'rebar-hold-point', assignedById: uidFor(siteManager), order: 2, xp: 30 });
  task('pour', {
    kind: 'assigned',
    title: 'Pour slab B',
    templateId: null,
    assignedById: uidFor(siteManager),
    status: 'locked',
    dependsOn: [`${today}-rebar`],
    order: 3,
    xp: 40,
  });

  return docs;
}
