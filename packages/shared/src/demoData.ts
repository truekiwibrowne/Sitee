import type { CharacterId } from './characters.js';
import type { TimestampLike } from './common.js';
import { leagueMemberSchema } from './game.js';
import { paths } from './paths.js';
import { orgSchema, projectSchema, userSchema, zoneSchema, type LeagueTier } from './people.js';
import type { Role } from './roles.js';
import { DEFAULT_FORM_IDS, STARTER_FORMS } from './formLibrary.js';
import { taskTemplateSchema, type TemplateBody } from './templates.js';
import { isoWeekId, localDateIn, zonedTimeToUtc } from './time.js';
import { taskSchema } from './work.js';

// The demo company: used by the emulator seed (orgs/demo-org) and by every live
// "Try the demo" sandbox (orgs/demo-{uid}), so both always match.

/** Forms every new company starts with (and the demo uses). Admins add more from the library. */
export const DEFAULT_TEMPLATES: Record<string, TemplateBody> = Object.fromEntries(
  DEFAULT_FORM_IDS.map((id) => [id, STARTER_FORMS[id]!]),
);

export type DemoPerson = {
  key: string;
  name: string;
  email: string;
  role: Role;
  avatar: CharacterId;
  projectIds: string[];
  zoneIds: string[];
  // Demo game state so the Today screen has something to show.
  xpTotal: number;
  weeklyXp: number;
  streak: number;
  league: LeagueTier;
};

const PROJECT = 'riverside';
const ZONE_A = 'zone-a';
const ZONE_B = 'zone-b';
/** The seeded demo project's timezone. Live sandboxes use the visitor's own instead. */
export const DEMO_TIMEZONE = 'Africa/Kampala';

export const DEMO_PEOPLE: DemoPerson[] = [
  { key: 'foreman', name: 'Grace Foreman', email: 'foreman@demo.test', role: 'foreman', avatar: 'brix', projectIds: [PROJECT], zoneIds: [ZONE_A], xpTotal: 1240, weeklyXp: 310, streak: 12, league: 'silver' },
  { key: 'siteManager', name: 'Sam Site', email: 'sitemanager@demo.test', role: 'siteManager', avatar: 'blocx', projectIds: [PROJECT], zoneIds: [ZONE_A, ZONE_B], xpTotal: 2310, weeklyXp: 420, streak: 21, league: 'gold' },
  { key: 'projectManager', name: 'Pat Project', email: 'pm@demo.test', role: 'projectManager', avatar: 'blocx', projectIds: [PROJECT], zoneIds: [], xpTotal: 980, weeklyXp: 380, streak: 5, league: 'bronze' },
  { key: 'constructionManager', name: 'Chris Construction', email: 'cm@demo.test', role: 'constructionManager', avatar: 'brix', projectIds: [PROJECT], zoneIds: [], xpTotal: 640, weeklyXp: 150, streak: 3, league: 'bronze' },
  { key: 'admin', name: 'Alex Admin', email: 'admin@demo.test', role: 'admin', avatar: 'brix', projectIds: [], zoneIds: [], xpTotal: 0, weeklyXp: 0, streak: 0, league: 'bronze' },
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
  /** IANA timezone for the project, so due times and "late" match where the visitor is. */
  timeZone?: string;
  /** Makes a Timestamp from epoch ms (the caller's SDK), for the tasks' due times. */
  toTimestamp?: (ms: number) => TimestampLike;
}): DemoDoc[] {
  const { orgId, now, uidFor } = opts;
  const timeZone = opts.timeZone ?? DEMO_TIMEZONE;
  const docs: DemoDoc[] = [];
  const add = (path: string, data: Record<string, unknown>) => docs.push({ path, data });

  add(paths.org(orgId), {
    ...orgSchema.parse({
      name: 'Demo Construction Ltd',
      dailyXpCap: 300,
      createdAt: now,
      demo: opts.expiresAt !== undefined,
      ...(opts.expiresAt ? { expiresAt: opts.expiresAt } : {}),
    }),
  });

  add(
    `${paths.projects(orgId)}/${PROJECT}`,
    projectSchema.parse({ name: 'Riverside Apartments', timezone: timeZone, address: '12 River Road', baselineId: null, createdAt: now }),
  );

  for (const [id, name] of [
    [ZONE_A, 'Block A'],
    [ZONE_B, 'Block B'],
  ] as const) {
    add(`${paths.zones(orgId)}/${id}`, zoneSchema.parse({ name, projectId: PROJECT, geofence: null, createdAt: now }));
  }

  for (const p of DEMO_PEOPLE) {
    add(
      `${paths.users(orgId)}/${uidFor(p)}`,
      userSchema.parse({
        name: p.name,
        email: p.email,
        avatar: p.avatar,
        role: p.role,
        projectIds: p.projectIds,
        zoneIds: p.zoneIds,
        xpTotal: p.xpTotal,
        streak: p.streak,
        streakFreezes: 0,
        league: p.league,
        reviewAccuracy: null,
        createdAt: now,
      }),
    );
  }

  for (const [id, template] of Object.entries(DEFAULT_TEMPLATES)) {
    add(`${paths.taskTemplates(orgId)}/${id}`, taskTemplateSchema.parse({ ...template, createdAt: now }));
  }

  // Today's league table, ranked by weekly XP.
  const today = localDateIn(timeZone, new Date(now.toMillis()));
  const ranked = [...DEMO_PEOPLE].sort((a, b) => b.weeklyXp - a.weeklyXp);
  ranked.forEach((p, i) => {
    add(
      `${paths.leagueMembers(orgId, isoWeekId(today))}/${uidFor(p)}`,
      leagueMemberSchema.parse({ userId: uidFor(p), tier: p.league, weeklyXp: p.weeklyXp, rank: i + 1 }),
    );
  });

  // The foreman's day, as in the Today mockup. In real companies the hourly job creates these.
  const foreman = DEMO_PEOPLE.find((p) => p.role === 'foreman')!;
  const siteManager = DEMO_PEOPLE.find((p) => p.role === 'siteManager')!;
  const task = (key: string, fields: Record<string, unknown>) =>
    add(
      `${paths.tasks(orgId)}/${today}-${key}`,
      taskSchema.parse({
        kind: 'recurring',
        assigneeId: uidFor(foreman),
        assignedById: null,
        zoneId: ZONE_A,
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
  const reportDue = opts.toTimestamp?.(zonedTimeToUtc(today, '18:00', timeZone)) ?? null;
  task('report', { title: 'Daily site report', templateId: 'daily-site-report', dueAt: reportDue, order: 1, xp: 50 });
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
