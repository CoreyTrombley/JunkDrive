import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';
import { maxHold, usedHold, freeCapacityUnits } from '../derived';
import { SHIP_UPGRADES_BY_ID, upgradeCost } from '../../config/ship';

describe('tonnage hold', () => {
  it('base hold is 200 m³; cargo_hold adds 50m³/level; graviton multiplies', () => {
    const s = createInitialState();
    expect(maxHold(s)).toBe(200);
    s.shipUpgrades['cargo_hold'] = 4;
    expect(maxHold(s)).toBe(400);
    s.shipUpgrades['graviton_frame'] = 2;
    expect(maxHold(s)).toBeCloseTo(400 * 1.5, 6);
  });

  it('bigger_bones adds 80m³ × 2^(level-1) — level 1 = +80, level 2 = +160 total', () => {
    const s = createInitialState();
    s.relics['bigger_bones'] = 1;
    expect(maxHold(s)).toBe(280);
    s.relics['bigger_bones'] = 2;
    expect(maxHold(s)).toBe(360);
  });

  it('usedHold weighs cargo by mass', () => {
    const s = createInitialState();
    s.cargo = { scrap_metal: { qty: 2, avgCost: 5 }, earth_relics: { qty: 3, avgCost: 500 } };
    expect(usedHold(s)).toBeCloseTo(2 * 60 + 3 * 9, 6);
  });

  it('freeCapacityUnits floors by the good mass and never goes negative', () => {
    const s = createInitialState(); // 200m³ free
    expect(freeCapacityUnits(s, 'hull_plates')).toBe(2); // 75m³ each
    expect(freeCapacityUnits(s, 'time_crystals')).toBe(80); // 2.5m³ each
    s.cargo = { scrap_metal: { qty: 4, avgCost: 5 } }; // 240m³ used — over cap is legal for legacy saves
    expect(freeCapacityUnits(s, 'med_gel')).toBe(0);
  });

  it('graviton_frame upgrade def matches spec', () => {
    const def = SHIP_UPGRADES_BY_ID['graviton_frame'];
    expect(def.maxLevel).toBe(5);
    expect(upgradeCost(def, 0)).toBe(250_000);
    expect(upgradeCost(def, 1)).toBe(1_250_000);
  });
});
