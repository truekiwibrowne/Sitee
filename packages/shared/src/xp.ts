export type Stars = 1 | 2 | 3;

export const STAR_MULTIPLIER: Record<Stars, number> = { 1: 0.5, 2: 1, 3: 1.5 };

/** XP for a reviewed task: base × reviewer-star multiplier, rounded. */
export function xpForReview(base: number, stars: Stars): number {
  return Math.round(base * STAR_MULTIPLIER[stars]);
}

/** XP the reviewer earns for each review they complete. */
export const REVIEW_XP = 20;

/** What opening the daily chest gives. */
export const CHEST_XP = 25;
export const MAX_STREAK_FREEZES = 3;

/** Caps an award so the person's total for the day doesn't pass the org's daily cap. */
export function capXp(amount: number, earnedToday: number, dailyCap: number): number {
  return Math.max(0, Math.min(amount, dailyCap - earnedToday));
}
