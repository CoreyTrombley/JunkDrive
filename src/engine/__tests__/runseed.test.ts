import { describe, it, expect } from 'vitest';
import { sectorSeed, generateSectorGoods, generateSectorBias } from '../sectorgen';
import { hashSeed } from '../rng';
import { createInitialState, newRunSeed, allStationIds } from '../state';
import { store } from '../store';
import { goodById } from '../pricing';

describe('runSeed', () => {
  it('seed 0 is the legacy seed (identity XOR)', () => {
    expect(sectorSeed(2, 0)).toBe(hashSeed('junkrun-sector-2'));
    expect(sectorSeed(3, 0)).toBe(hashSeed('junkrun-sector-3'));
  });

  it('same seed → identical goods; different seed → different catalog', () => {
    const a1 = generateSectorGoods(2, 12345);
    const a2 = generateSectorGoods(2, 12345);
    const b = generateSectorGoods(2, 99999);
    expect(a1).toEqual(a2);
    expect(JSON.stringify(a1)).not.toBe(JSON.stringify(b));
    // ids never change — cargo/waves are keyed by them
    expect(a1.map((g) => g.id)).toEqual(['s2_g0', 's2_g1', 's2_g2', 's2_g3']);
    expect(b.map((g) => g.id)).toEqual(['s2_g0', 's2_g1', 's2_g2', 's2_g3']);
  });

  it('bias tables differ per run seed', () => {
    const goods = generateSectorGoods(2, 0);
    const t0 = generateSectorBias(allStationIds(), goods, 2, 0);
    const t1 = generateSectorBias(allStationIds(), goods, 2, 424242);
    expect(JSON.stringify(t0)).not.toBe(JSON.stringify(t1));
  });

  it('fresh states get a nonzero runSeed; goodById follows the store seed', () => {
    expect(newRunSeed()).toBeGreaterThan(0);
    const s = createInitialState();
    expect(s.runSeed).toBeGreaterThan(0);
    s.maxSectorReached = 2;
    store.value = s;
    const expected = generateSectorGoods(2, s.runSeed)[1];
    expect(goodById('s2_g1')).toEqual(expected);
  });

  it('fresh waves are pre-churned, not flat', () => {
    const s = createInitialState();
    const flat = Object.values(s.waves).every((w) => w.value === 1);
    expect(flat).toBe(false);
  });
});
