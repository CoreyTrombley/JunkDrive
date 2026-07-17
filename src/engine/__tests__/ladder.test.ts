import { describe, it, expect } from 'vitest';
import { sectorScale } from '../price';
import { gateToll, sectorUnlockRank, resonanceNeeded, SECTOR_CAP, RESONANCE_FLIP_FLOOR } from '../formulas';

describe('endgame ladder math', () => {
  it('sector scale is unchanged through S10, then +60%/sector', () => {
    for (let s = 1; s <= 10; s++) expect(sectorScale(s)).toBe(Math.pow(8, s - 1));
    expect(sectorScale(11)).toBeCloseTo(Math.pow(8, 9) * 1.6, 4);
    expect(sectorScale(99)).toBeCloseTo(Math.pow(8, 9) * Math.pow(1.6, 89), -10);
    // readable endgame: S99 scale ~2e26, not 8^98 ~ 3e88
    expect(sectorScale(99)).toBeLessThan(1e27);
  });

  it('tolls are unchanged through S10, then grow slower than income (1.5 < 1.6)', () => {
    for (let d = 2; d <= 10; d++) expect(gateToll(d)).toBe(2_000_000 * Math.pow(15, d - 2));
    expect(gateToll(11)).toBeCloseTo(2_000_000 * Math.pow(15, 8) * 1.5, -2);
    expect(gateToll(99)).toBeCloseTo(2_000_000 * Math.pow(15, 8) * Math.pow(1.5, 89), -10);
  });

  it('rank gates end at S10; resonance is the gate beyond', () => {
    expect(sectorUnlockRank(2)).toBe(20);
    expect(sectorUnlockRank(10)).toBe(100);
    expect(sectorUnlockRank(11)).toBe(0);
    expect(sectorUnlockRank(99)).toBe(0);
  });

  it('resonance curve matches the sim-verified D2 ladder', () => {
    expect(resonanceNeeded(10)).toBe(0);
    expect(resonanceNeeded(11)).toBe(7);
    expect(resonanceNeeded(30)).toBe(Math.ceil(6 * Math.pow(1.062, 20)));
    expect(resonanceNeeded(50)).toBe(67);
    expect(resonanceNeeded(90)).toBe(Math.ceil(6 * Math.pow(1.062, 80))); // = 739
    expect(resonanceNeeded(99)).toBe(Math.ceil(6 * Math.pow(1.062, 89))); // ≈ 1269
  });

  it('constants', () => {
    expect(SECTOR_CAP).toBe(99);
    expect(RESONANCE_FLIP_FLOOR).toBe(2000);
  });
});
