import { z } from 'zod';
import { id, localDate, timestamp } from './common.js';
import { leagueTierSchema } from './people.js';

export const XP_SOURCES = ['review', 'reviewGiven', 'chest', 'training', 'quest', 'adjustment'] as const;

// orgs/{orgId}/xpEvents/{eventId} — append-only ledger, written only by Cloud Functions.
export const xpEventSchema = z.object({
  userId: id,
  source: z.enum(XP_SOURCES),
  /** Base XP before the multiplier. */
  base: z.number().int(),
  multiplier: z.number().nonnegative(),
  /** What was actually awarded, after the multiplier and the daily cap. */
  amount: z.number().int(),
  /** Site-local day it counts towards, for the daily cap. */
  date: localDate,
  taskId: id.nullable(),
  reviewId: id.nullable(),
  createdAt: timestamp,
});
export type XpEvent = z.infer<typeof xpEventSchema>;

/** ISO week, e.g. "2026-W44". Leagues reset weekly. */
export const weekId = z.string().regex(/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/, 'Expected YYYY-Www');

// orgs/{orgId}/leagues/{weekId}/members/{uid}
export const leagueMemberSchema = z.object({
  userId: id,
  tier: leagueTierSchema,
  weeklyXp: z.number().int().nonnegative(),
  rank: z.number().int().positive(),
});
export type LeagueMember = z.infer<typeof leagueMemberSchema>;

// orgs/{orgId}/quests/{questId}
export const questSchema = z.object({
  title: z.string().min(1),
  scope: z.enum(['site', 'project', 'org']),
  scopeId: id,
  target: z.number().int().positive(),
  progress: z.number().int().nonnegative(),
  /** What the team gets, e.g. "Site lunch". Set by the admin. */
  reward: z.string().min(1),
  createdById: id,
  endsAt: timestamp,
  createdAt: timestamp,
});
export type Quest = z.infer<typeof questSchema>;
