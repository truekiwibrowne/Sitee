import { z } from 'zod';

/**
 * A Firestore Timestamp from either the web SDK or the Admin SDK. Schemas describe
 * documents as read back from Firestore, so both SDKs' Timestamp classes must pass.
 */
export type TimestampLike = { seconds: number; nanoseconds: number; toMillis(): number };

export const timestamp = z.custom<TimestampLike>(
  (v) =>
    typeof v === 'object' &&
    v !== null &&
    typeof (v as TimestampLike).seconds === 'number' &&
    typeof (v as TimestampLike).nanoseconds === 'number' &&
    typeof (v as TimestampLike).toMillis === 'function',
  'Expected a Firestore Timestamp',
);

export const id = z.string().min(1);

/** A calendar day in the site's own timezone, e.g. "2026-10-30". Streaks and daily tasks key on this. */
export const localDate = z.iso.date();

/** "HH:MM", 24-hour, in the site's timezone. */
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');

export const gps = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative(),
});
export type Gps = z.infer<typeof gps>;
