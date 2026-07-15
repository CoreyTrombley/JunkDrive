import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';
import { RIGS_BY_ID } from '../../config/rigs';
import { rigTapPayout, rigEffectiveRatePerSec, rigRatePerSec, globalIncomeMult } from '../formulas';

function stateWithRig(id: string, owned: number, managed = false) {
  const s = createInitialState();
  s.rigs[id] = { owned, managed };
  return s;
}

describe('rig payouts', () => {
  const vend = RIGS_BY_ID['vending_drones']; // basePayout 14, cycleSec 3

  it('tap pays exactly one second of effective income', () => {
    const s = stateWithRig('vending_drones', 5);
    // (14 / 3) * 5 owned * milestone ×1 * global ×1
    expect(rigTapPayout(s, vend, Date.now())).toBeCloseTo((14 / 3) * 5, 6);
  });

  it('tap includes milestone multiplier', () => {
    const s = stateWithRig('vending_drones', 10); // milestone ×2 at 10 owned
    expect(rigTapPayout(s, vend, Date.now())).toBeCloseTo((14 / 3) * 10 * 2, 6);
  });

  it('effective rate ignores managed, rigRatePerSec requires it', () => {
    const s = stateWithRig('vending_drones', 5, false);
    const t = Date.now();
    expect(rigEffectiveRatePerSec(s, vend, t)).toBeCloseTo((14 / 3) * 5, 6);
    expect(rigRatePerSec(s, vend, t)).toBe(0);
    s.rigs['vending_drones'].managed = true;
    expect(rigRatePerSec(s, vend, t)).toBeCloseTo((14 / 3) * 5, 6);
  });

  it('salvage fleet flip-margin bonus applies to effective rate', () => {
    const s = stateWithRig('salvage_fleet', 1); // basePayout 160000, cycleSec 90
    s.bests.bestFlipMargin = 1.0; // +100%, capped at +300%
    expect(rigEffectiveRatePerSec(s, RIGS_BY_ID['salvage_fleet'], Date.now()))
      .toBeCloseTo((160000 / 90) * 1 * 1 * 2, 4);
  });
});

describe('yard sector parity', () => {
  it('yard income scales ×8 per sector like trade prices', () => {
    const s = createInitialState();
    const t = Date.now();
    const base = globalIncomeMult(s, t);
    s.sector = 2;
    expect(globalIncomeMult(s, t)).toBeCloseTo(base * 8, 6);
    s.sector = 3;
    expect(globalIncomeMult(s, t)).toBeCloseTo(base * 64, 6);
  });
});
