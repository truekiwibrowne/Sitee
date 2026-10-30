import { describe, expect, it } from 'vitest';
import { xpForReview } from './xp.js';

describe('xpForReview', () => {
  it('applies the star multiplier', () => {
    expect(xpForReview(50, 1)).toBe(25);
    expect(xpForReview(50, 2)).toBe(50);
    expect(xpForReview(50, 3)).toBe(75);
  });
});
