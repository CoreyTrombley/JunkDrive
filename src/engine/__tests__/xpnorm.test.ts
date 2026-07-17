import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';
import { generateManifest } from '../manifests';
import { goodById } from '../pricing';
import { saleXp } from '../../config/ranks';
import { sectorScale } from '../price';
import { mulberry32 } from '../rng';
import { generateSectorGoods } from '../sectorgen';

describe('sector-normalized XP', () => {
  it('manifest XP is sector-invariant: same normalized value in S1 and S12', () => {
    const s1 = createInitialState();
    s1.rank = 8;
    s1.runSeed = 12345; // pin: createInitialState() randomizes runSeed per call
    const s12 = createInitialState();
    s12.rank = 8;
    s12.sector = 12;
    s12.runSeed = 12345; // same seed → same bias tables → deterministic comparison
    const m1 = generateManifest(s1, mulberry32(5), 1, 0);
    const m12 = generateManifest(s12, mulberry32(5), 1, 0);
    // reward scales with sectorScale; XP must NOT — both compute from normalized reward
    expect(m1.rewardXp).toBe(Math.round(1.5 * saleXp((m1.rewardCredits * 0.45) / sectorScale(1))));
    expect(m12.rewardXp).toBe(Math.round(1.5 * saleXp((m12.rewardCredits * 0.45) / sectorScale(12))));
    // and the normalized magnitudes are comparable (same seed → same goods/quantities)
    expect(m12.rewardXp).toBeLessThan(m1.rewardXp * 4); // NOT scaled by 8^11 ≈ 8.6e9
  });

  it('saleXp itself is untouched (sector-1 identity)', () => {
    expect(saleXp(1000)).toBe(Math.ceil(3 * Math.pow(1000, 0.42)));
  });

  it('deep-sector procedural goods stay unlockable under normalized ranks', () => {
    const goods = generateSectorGoods(60, 12345);
    for (const g of goods) expect(g.unlockRank).toBeLessThanOrEqual(106); // 100 + band·2
  });
});
