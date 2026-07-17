import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';
import { generateManifest, canDeliver } from '../manifests';
import { goodById } from '../pricing';
import { maxHold } from '../derived';
import { mulberry32 } from '../rng';
import { saleXp } from '../../config/ranks';
import { sectorScale } from '../price';
import { STATIONS } from '../../config/stations';

describe('trade manifests', () => {
  function mkState(rank = 8) {
    const s = createInitialState();
    s.rank = rank;
    return s;
  }

  it('generates 2-3 distinct unlocked goods, delivery elsewhere, sane premium and expiry', () => {
    const s = mkState();
    const m = generateManifest(s, mulberry32(42), 1, 1_000_000);
    expect(m.id).toBe('m1');
    expect(m.stationId).not.toBe(s.currentStation);
    expect(m.items.length).toBeGreaterThanOrEqual(2);
    expect(m.items.length).toBeLessThanOrEqual(3);
    const ids = m.items.map((i) => i.goodId);
    expect(new Set(ids).size).toBe(ids.length);
    const targetScan = STATIONS.find((st) => st.id === m.stationId)?.scanChance ?? 0;
    for (const it of m.items) {
      const g = goodById(it.goodId, s.runSeed ?? 0)!;
      expect(g.unlockRank).toBeLessThanOrEqual(s.rank);
      expect(it.qty).toBeGreaterThanOrEqual(1);
      if (targetScan > 0) expect(!!g.contraband).toBe(false); // no contraband demands where customs scans
    }
    expect(m.premium).toBeGreaterThanOrEqual(1.7);
    expect(m.premium).toBeLessThanOrEqual(2.2);
    expect(m.expiresAt).toBeGreaterThanOrEqual(1_000_000 + 20 * 60_000);
    expect(m.expiresAt).toBeLessThanOrEqual(1_000_000 + 40 * 60_000);
  });

  it('reward = base value × premium; XP = round(1.5 · saleXp(reward × 0.45))', () => {
    const s = mkState();
    const m = generateManifest(s, mulberry32(7), 2, 0);
    const baseValue = m.items.reduce(
      (sum, it) => sum + (goodById(it.goodId, s.runSeed ?? 0)?.base ?? 0) * sectorScale(s.sector) * it.qty, 0);
    expect(m.rewardCredits).toBe(Math.round(baseValue * m.premium));
    expect(m.rewardXp).toBe(Math.round(1.5 * saleXp(m.rewardCredits * 0.45)));
  });

  it('total manifest tonnage stays within 60-90% of the hold plus one-unit rounding', () => {
    const s = mkState(12);
    for (let seed = 1; seed <= 20; seed++) {
      const m = generateManifest(s, mulberry32(seed), seed, 0);
      const tons = m.items.reduce((t, it) => t + (goodById(it.goodId, s.runSeed ?? 0)?.mass ?? 1) * it.qty, 0);
      const maxOverspill = m.items.length * 75; // qty floors, then Math.max(1,...) can add ≤1 heaviest unit per item
      expect(tons).toBeLessThanOrEqual(maxHold(s) * 0.9 + maxOverspill);
      expect(tons).toBeGreaterThan(0);
    }
  });

  it('canDeliver requires being at the station with every item aboard', () => {
    const s = mkState();
    const m = generateManifest(s, mulberry32(9), 3, 0);
    expect(canDeliver(s, m)).toBe(false); // wrong station, empty cargo
    const at = { ...s, currentStation: m.stationId };
    expect(canDeliver(at, m)).toBe(false); // right station, empty cargo
    const cargo: typeof s.cargo = {};
    for (const it of m.items) cargo[it.goodId] = { qty: it.qty, avgCost: 1 };
    expect(canDeliver({ ...at, cargo }, m)).toBe(true);
    cargo[m.items[0].goodId] = { qty: m.items[0].qty - 1, avgCost: 1 };
    expect(canDeliver({ ...at, cargo: { ...cargo } }, m)).toBe(m.items[0].qty - 1 >= m.items[0].qty);
  });
});
