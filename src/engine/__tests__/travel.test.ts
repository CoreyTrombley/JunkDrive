import { describe, it, expect } from 'vitest';
import { createInitialState, BASE_MAX_FUEL, BASE_FUEL_REGEN_SEC } from '../state';
import { fuelRegenSec } from '../derived';
import { store } from '../store';
import { startJump, buyFuelPip, claimSalvage } from '../actions';
import { generateSectorMap, lanesFrom, nodeById } from '../mapgen';

function freshAt(nodeId?: string) {
  const s = createInitialState();
  s.runSeed = 12345; // pin the map so this suite is deterministic across runs
  s.rank = 12;       // unlock halo_court (R6) and the_signal (R12) — this suite tests
                     // lane adjacency and fuel, not rank gating; without this, ~1 in 9
                     // random maps points rust_harbor's first lane at a locked station
  if (nodeId) s.currentStation = nodeId;
  store.value = s;
  return s;
}

describe('lane travel + fuel rebalance', () => {
  it('fuel constants match spec', () => {
    expect(BASE_MAX_FUEL).toBe(8);
    expect(BASE_FUEL_REGEN_SEC).toBe(65);
    const s = createInitialState();
    expect(fuelRegenSec(s)).toBe(65);
    s.shipUpgrades['fuel_recycler'] = 5;
    expect(fuelRegenSec(s)).toBe(35);
  });

  it('jumps require a direct lane and deduct the lane fuel cost', () => {
    const s = freshAt();
    const map = generateSectorMap(s.sector, s.runSeed ?? 0);
    const lane = lanesFrom(map, s.currentStation)[0];
    const target = lane.a === s.currentStation ? lane.b : lane.a;
    const nonAdjacent = map.nodes.find((n) =>
      n.id !== s.currentStation && !lanesFrom(map, s.currentStation).some((l) => l.a === n.id || l.b === n.id))!;
    expect(startJump(nonAdjacent.id).ok).toBe(false);
    const res = startJump(target);
    expect(res.ok).toBe(true);
    expect(res.lane?.fuel).toBe(lane.fuel);
    expect(store.value.fuel).toBe(BASE_MAX_FUEL - lane.fuel);
  });

  it('depot sells fuel pips at max(50, 2% net worth)', () => {
    const s = createInitialState();
    s.runSeed = 12345;
    const map = generateSectorMap(s.sector, s.runSeed);
    const depot = map.nodes.find((n) => n.kind === 'depot')!;
    s.currentStation = depot.id;
    s.fuel = 2;
    s.credits = 10_000;
    store.value = s;
    const r = buyFuelPip();
    expect(r.ok).toBe(true);
    expect(store.value.fuel).toBe(3);
    expect(store.value.credits).toBe(10_000 - 200);
    store.value = { ...store.value, fuel: BASE_MAX_FUEL };
    expect(buyFuelPip().ok).toBe(false); // tank full
  });

  it('salvage claims respect the 10-minute cooldown', () => {
    const s = createInitialState();
    s.runSeed = 12345;
    const map = generateSectorMap(s.sector, s.runSeed);
    const field = map.nodes.find((n) => n.kind === 'salvage')!;
    s.currentStation = field.id;
    store.value = s;
    expect(claimSalvage().ok).toBe(true);
    const carried = Object.values(store.value.cargo).reduce((n, c) => n + c.qty, 0);
    expect(carried).toBeGreaterThanOrEqual(1);
    expect(claimSalvage().ok).toBe(false); // cooldown
    // reset the cooldown AND empty the hold, so the reroll can't be tonnage-blocked
    store.value = { ...store.value, cargo: {}, lastSalvageAt: { [field.id]: Date.now() - 11 * 60_000 } };
    expect(claimSalvage().ok).toBe(true);
  });

  it('waypoint actions refuse to run elsewhere', () => {
    freshAt(); // rust_harbor
    expect(buyFuelPip().ok).toBe(false);
    expect(claimSalvage().ok).toBe(false);
  });
});
