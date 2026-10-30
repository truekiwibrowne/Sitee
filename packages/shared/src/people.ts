import { z } from 'zod';
import { gps, id, timestamp } from './common.js';
import { ROLES } from './roles.js';

export const roleSchema = z.enum(ROLES);

// orgs/{orgId}
export const orgSchema = z.object({
  name: z.string().min(1),
  /** Max XP one person can earn per site-local day. */
  dailyXpCap: z.number().int().positive(),
  createdAt: timestamp,
});
export type Org = z.infer<typeof orgSchema>;

// orgs/{orgId}/projects/{projectId}
export const projectSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().min(1),
  siteIds: z.array(id),
  /** BoQ baseline import (Phase 3). */
  baselineId: id.nullable(),
  createdAt: timestamp,
});
export type Project = z.infer<typeof projectSchema>;

// orgs/{orgId}/sites/{siteId}
export const siteSchema = z.object({
  name: z.string().min(1),
  projectId: id,
  /** IANA timezone, e.g. "Africa/Kampala". Due times and streak days use it. */
  timezone: z.string().min(1),
  memberIds: z.array(id),
  /** Photos taken outside this circle get flagged. */
  geofence: gps.pick({ lat: true, lng: true }).extend({ radiusM: z.number().positive() }).nullable(),
  createdAt: timestamp,
});
export type Site = z.infer<typeof siteSchema>;

export const LEAGUE_TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const;
export const leagueTierSchema = z.enum(LEAGUE_TIERS);
export type LeagueTier = z.infer<typeof leagueTierSchema>;

// orgs/{orgId}/users/{uid}
export const userSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  role: roleSchema,
  siteIds: z.array(id),
  // Game state below is written only by Cloud Functions.
  xpTotal: z.number().int().nonnegative(),
  streak: z.number().int().nonnegative(),
  streakFreezes: z.number().int().nonnegative(),
  league: leagueTierSchema,
  /** Share of this person's reviews that held up under audit, 0–1. Null until audited. */
  reviewAccuracy: z.number().min(0).max(1).nullable(),
  createdAt: timestamp,
});
export type UserDoc = z.infer<typeof userSchema>;

/** Fields on a user doc that only Cloud Functions (or an admin) may change. Used by rules tests. */
export const SERVER_ONLY_USER_FIELDS = [
  'role',
  'siteIds',
  'xpTotal',
  'streak',
  'streakFreezes',
  'league',
  'reviewAccuracy',
] as const satisfies readonly (keyof UserDoc)[];
