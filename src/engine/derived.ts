import type { GameState } from './state';
import { BASE_HOLD, BASE_MAX_FUEL, BASE_FUEL_REGEN_SEC } from './state';
import { STATIONS_BY_ID } from '../config/stations';

export function maxHold(state: GameState): number {
  const cargoLevel = state.shipUpgrades['cargo_hold'] || 0;
  const relicLevel = state.relics['bigger_bones'] || 0;
  return BASE_HOLD + cargoLevel * 3 + relicLevel * 4;
}

export function usedHold(state: GameState): number {
  let total = 0;
  for (const key in state.cargo) total += state.cargo[key].qty;
  return total;
}

export function maxFuel(state: GameState): number {
  const lvl = state.shipUpgrades['fuel_tank'] || 0;
  const relicLevel = state.relics['deep_tank'] || 0;
  return BASE_MAX_FUEL + lvl + relicLevel * 2;
}

export function fuelRegenSec(state: GameState): number {
  const lvl = state.shipUpgrades['fuel_recycler'] || 0;
  return Math.max(40, BASE_FUEL_REGEN_SEC - lvl * 7);
}

export function scanChanceFor(state: GameState, stationId: string): number {
  const st = STATIONS_BY_ID[stationId];
  if (!st) return 0;
  const lvl = state.shipUpgrades['smuggler_panels'] || 0;
  return Math.max(0, st.scanChance - lvl * 0.03);
}

export function travelDurationMs(state: GameState): number {
  const warmEngines = (state.relics['warm_engines'] || 0) > 0;
  if (warmEngines) return 2000;
  const jdLvl = state.shipUpgrades['jump_drive'] || 0;
  return Math.max(2000, 4000 - jdLvl * 1000);
}

export function canSkipTravel(state: GameState): boolean {
  const warmEngines = (state.relics['warm_engines'] || 0) > 0;
  const jdLvl = state.shipUpgrades['jump_drive'] || 0;
  return warmEngines || jdLvl > 0;
}

export function tollDiscount(state: GameState): number {
  const lvl = state.relics['gate_crasher'] || 0;
  return [0, 0.25, 0.4][Math.min(lvl, 2)];
}

/** Simplified net worth used for milestones & quest reward scaling: liquid credits. */
export function netWorth(state: GameState): number {
  return state.credits;
}

export function goldenRolodexActive(state: GameState): boolean {
  return (state.relics['golden_rolodex'] || 0) > 0;
}

export function eventMagnetActive(state: GameState): boolean {
  return (state.relics['event_magnet'] || 0) > 0;
}
