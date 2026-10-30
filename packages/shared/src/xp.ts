export type Stars = 1 | 2 | 3;

export const STAR_MULTIPLIER: Record<Stars, number> = { 1: 0.5, 2: 1, 3: 1.5 };

/** XP for a reviewed task: base × reviewer-star multiplier, rounded. */
export function xpForReview(base: number, stars: Stars): number {
  return Math.round(base * STAR_MULTIPLIER[stars]);
}
