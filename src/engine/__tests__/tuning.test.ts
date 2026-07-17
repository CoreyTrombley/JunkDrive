import { describe, it, expect } from 'vitest';
import { createInitialState, BASE_FUEL_REGEN_SEC } from '../state';
import { maxHold, fuelRegenSec } from '../derived';
import { MARKET_EVENTS_BY_ID } from '../../config/events';
import { SHIP_UPGRADES_BY_ID, upgradeCost } from '../../config/ship';

describe('trading tuning constants', () => {
  it('cargo hold gives +50m³ per level', () => {
    const s = createInitialState();
    s.shipUpgrades['cargo_hold'] = 4;
    expect(maxHold(s)).toBe(200 + 4 * 50);
  });

  it('cargo hold cost growth is 1.65', () => {
    const def = SHIP_UPGRADES_BY_ID['cargo_hold'];
    expect(upgradeCost(def, 0)).toBe(800);
    expect(upgradeCost(def, 1)).toBe(Math.round(800 * 1.65));
  });

  it('fuel regen: base 65s, -6s/level, floor 35s', () => {
    expect(BASE_FUEL_REGEN_SEC).toBe(65);
    const s = createInitialState();
    expect(fuelRegenSec(s)).toBe(65);
    s.shipUpgrades['fuel_recycler'] = 5;
    expect(fuelRegenSec(s)).toBe(35);
  });

  it('demand spike ceiling is ×6', () => {
    expect(MARKET_EVENTS_BY_ID['demand_spike'].maxMult).toBe(6);
  });
});
