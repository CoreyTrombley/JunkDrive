import { describe, it, expect } from 'vitest';
import { saleXp, xpToNext } from '../../config/ranks';
import { generateQuest } from '../quests';
import { createInitialState } from '../state';
import { mulberry32 } from '../rng';

describe('xp rebalance', () => {
  it('saleXp uses exponent 0.42', () => {
    expect(saleXp(1000)).toBe(Math.ceil(3 * Math.pow(1000, 0.42))); // 55
    expect(saleXp(1_000_000)).toBe(Math.ceil(3 * Math.pow(1_000_000, 0.42)));
    expect(saleXp(0)).toBe(1);
    expect(saleXp(-5)).toBe(1);
  });

  it('xpToNext curve is unchanged', () => {
    expect(xpToNext(13)).toBe(Math.round(12 * Math.pow(13, 1.8)));
  });

  it('quest XP scales with rank', () => {
    const low = createInitialState(); // rank 1
    const high = createInitialState();
    high.rank = 20;
    // same rng seed → same template & base roll; only the rank multiplier differs
    const qLow = generateQuest('medium', low, mulberry32(7), 1);
    const qHigh = generateQuest('medium', high, mulberry32(7), 1);
    expect(qHigh.rewardXp).toBeGreaterThan(qLow.rewardXp * 2); // (1+2.0)/(1+0.1) ≈ 2.7×
  });
});
