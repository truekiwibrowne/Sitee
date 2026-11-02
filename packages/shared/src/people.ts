import { z } from 'zod';
import { CHARACTERS } from './characters.js';
import { gps, id, timestamp } from './common.js';
import { ROLES } from './roles.js';

// Company (org) → Projects → Zones. A project is one construction site; zones are
// areas within it (Block A, Level 2…). People are assigned to projects and zones.

export const roleSchema = z.enum(ROLES);

// orgs/{orgId}
export const orgSchema = z.object({
  name: z.string().min(1),
  /** Max XP one person can earn per project-local day. */
  dailyXpCap: z.number().int().positive(),
  createdAt: timestamp,
  /**
   * True for "Try the demo" sandboxes, false for real companies. Always set, so the
   * hourly job can list real orgs without reading every sandbox.
   */
  demo: z.boolean(),
  /** Sandboxes only: the hourly job deletes them after this. */
  expiresAt: timestamp.optional(),
});
export type Org = z.infer<typeof orgSchema>;

// orgs/{orgId}/projects/{projectId}
export const projectSchema = z.object({
  name: z.string().min(1),
  /** IANA timezone, e.g. "Africa/Kampala". Due times and streak days in all its zones use it. */
  timezone: z.string().min(1),
  address: z.string(),
  /** BoQ baseline import (Phase 3). */
  baselineId: id.nullable(),
  createdAt: timestamp,
});
export type Project = z.infer<typeof projectSchema>;

// orgs/{orgId}/zones/{zoneId}
export const zoneSchema = z.object({
  name: z.string().min(1),
  projectId: id,
  /** Photos taken outside this circle get flagged. */
  geofence: gps.pick({ lat: true, lng: true }).extend({ radiusM: z.number().positive() }).nullable(),
  /** Set by the hourly job once it has created this zone's tasks for that local day. */
  tasksGeneratedFor: z.iso.date().optional(),
  createdAt: timestamp,
});
export type Zone = z.infer<typeof zoneSchema>;

export const LEAGUE_TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const;
export const leagueTierSchema = z.enum(LEAGUE_TIERS);
export type LeagueTier = z.infer<typeof leagueTierSchema>;

// orgs/{orgId}/users/{uid}
export const userSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  /** The character people see on leaderboards and profiles. The person picks it. */
  avatar: z.enum(CHARACTERS),
  // Set by admins (through Cloud Functions).
  role: roleSchema,
  projectIds: z.array(id),
  zoneIds: z.array(id),
  // Game state below is written only by Cloud Functions.
  xpTotal: z.number().int().nonnegative(),
  streak: z.number().int().nonnegative(),
  streakFreezes: z.number().int().nonnegative(),
  league: leagueTierSchema,
  /** Share of this person's reviews that held up under audit, 0–1. Null until audited. */
  reviewAccuracy: z.number().min(0).max(1).nullable(),
  /** Local day of the last on-time daily report that counted towards the streak. */
  lastReportDate: z.iso.date().nullable().optional(),
  /** Day the hourly job last checked this person's streak after the due time. */
  streakCheckedOn: z.iso.date().nullable().optional(),
  /** Day this person last opened their lunchbox. */
  lunchboxOpenedOn: z.iso.date().nullable().optional(),
  createdAt: timestamp,
});
export type UserDoc = z.infer<typeof userSchema>;

/** The only user fields people may change themselves. Everything else is server-only. */
export const SELF_EDITABLE_USER_FIELDS = ['name', 'avatar'] as const satisfies readonly (keyof UserDoc)[];

/** Fields on a user doc that only Cloud Functions may change. Used by rules tests. */
export const SERVER_ONLY_USER_FIELDS = [
  'role',
  'projectIds',
  'zoneIds',
  'xpTotal',
  'streak',
  'streakFreezes',
  'league',
  'reviewAccuracy',
  'lastReportDate',
  'streakCheckedOn',
  'lunchboxOpenedOn',
] as const satisfies readonly (keyof UserDoc)[];

// invites/{email} — a root collection: the invitee doesn't know the org yet. Written and
// read only by Cloud Functions; the invitee claims it when they first sign in.
export const inviteSchema = z.object({
  orgId: id,
  orgName: z.string().min(1),
  email: z.email(),
  name: z.string().min(1),
  role: roleSchema,
  projectIds: z.array(id),
  zoneIds: z.array(id),
  invitedById: id,
  createdAt: timestamp,
});
export type Invite = z.infer<typeof inviteSchema>;
