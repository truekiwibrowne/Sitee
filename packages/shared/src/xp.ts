// How XP is worked out. Only Cloud Functions award it; these are pure functions so the
// app can show the same numbers it will get. Tune the weights here.

export type Stars = 1 | 2 | 3;

/** The supervisor's rating: most of the reward. */
export const STAR_MULTIPLIER: Record<Stars, number> = { 1: 0.5, 2: 1, 3: 1.5 };

/** Earliness: how long before the due time the report was sent. First match wins. */
export const EARLINESS_STEPS = [
  { hoursEarly: 4, multiplier: 1.25 },
  { hoursEarly: 2, multiplier: 1.1 },
  { hoursEarly: 0, multiplier: 1 },
] as const;
export const LATE_MULTIPLIER = 0.5;

/** Speed: a small bonus for finishing soon after opening the form. Small, so rushing doesn't pay. */
export const SPEED_BONUS = { withinMinutes: 10, multiplier: 1.1 } as const;

/** XP the reviewer earns for each review they complete. */
export const REVIEW_XP = 20;

/** What opening the lunchbox gives. */
export const LUNCHBOX_XP = 25;
export const MAX_STREAK_FREEZES = 3;

/** XP for a reviewed task from stars alone: base × star multiplier, rounded. */
export function xpForReview(base: number, stars: Stars): number {
  return Math.round(base * STAR_MULTIPLIER[stars]);
}

/** Multiplier for sending `minutesBeforeDue` minutes before the due time (negative = late). Null = no due time. */
export function earlinessMultiplier(minutesBeforeDue: number | null): number {
  if (minutesBeforeDue === null) return 1;
  if (minutesBeforeDue < 0) return LATE_MULTIPLIER;
  return EARLINESS_STEPS.find((s) => minutesBeforeDue >= s.hoursEarly * 60)?.multiplier ?? 1;
}

/** Multiplier for how long the form took, from opening it to pressing submit. */
export function speedMultiplier(startedAtMs: number, capturedAtMs: number): number {
  const took = capturedAtMs - startedAtMs;
  return took >= 0 && took <= SPEED_BONUS.withinMinutes * 60_000 ? SPEED_BONUS.multiplier : 1;
}

export type ReportXp = { multiplier: number; breakdown: { stars: number; earliness: number; speed: number } };

/** The full multiplier for a reviewed report: stars × earliness × speed. */
export function reportXpMultiplier(stars: Stars, minutesBeforeDue: number | null, startedAtMs: number, capturedAtMs: number): ReportXp {
  const breakdown = {
    stars: STAR_MULTIPLIER[stars],
    earliness: earlinessMultiplier(minutesBeforeDue),
    speed: speedMultiplier(startedAtMs, capturedAtMs),
  };
  return { multiplier: breakdown.stars * breakdown.earliness * breakdown.speed, breakdown };
}

/** Caps an award so the person's total for the day doesn't pass the org's daily cap. */
export function capXp(amount: number, earnedToday: number, dailyCap: number): number {
  return Math.max(0, Math.min(amount, dailyCap - earnedToday));
}
