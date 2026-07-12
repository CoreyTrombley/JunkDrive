import type { Rig } from '../config/types';
import { MILESTONES } from '../config/rigs';
import type { GameState } from './state';
import { CODEX_SETS } from '../config/codex';

export function rigUnitCost(rig: Rig, owned: number): number {
  return Math.round(rig.baseCost * Math.pow(rig.costGrowth, owned));
}

export function rigBatchCost(rig: Rig, owned: number, qty: number): number {
  let total = 0;
  for (let i = 0; i < qty; i++) total += rigUnitCost(rig, owned + i);
  return total;
}

/** How many units of `rig` can `credits` afford, starting from `owned`. */
export function maxAffordableRigQty(rig: Rig, owned: number, credits: number): number {
  let qty = 0;
  let spent = 0;
  // Bounded loop — even at 1.10 growth this converges in well under 2000 steps
  // for any credits value representable as a JS number.
  while (qty < 5000) {
    const next = rigUnitCost(rig, owned + qty);
    if (spent + next > credits) break;
    spent += next;
    qty++;
  }
  return qty;
}

export function milestoneMultiplier(owned: number): number {
  let hits = 0;
  for (const m of MILESTONES) if (owned >= m) hits++;
  if (owned >= 200) hits = MILESTONES.length + Math.floor((owned - 200) / 100);
  return Math.pow(2, hits);
}

export function nextMilestone(owned: number): number {
  for (const m of MILESTONES) if (owned < m) return m;
  const step = 100;
  return Math.ceil((owned + 1) / step) * step;
}

export function codexBonusMult(state: GameState): number {
  let completed = 0;
  for (const set of CODEX_SETS) {
    const bucket = state.codex[set.kind] as Record<string, boolean>;
    if (set.memberIds.every((id) => bucket[id])) completed++;
  }
  return 1 + completed * 0.01;
}

export function boostActive(state: GameState, atTime: number): boolean {
  return !!state.activeBoost && state.activeBoost.expiresAt > atTime;
}

export function globalIncomeMult(state: GameState, atTime: number): number {
  const dmMult = 1 + 0.02 * state.darkMatter;
  const rankMult = 1 + 0.01 * Math.max(0, state.rank - 30);
  const codexMult = codexBonusMult(state);
  const ghostFreq = state.codex.jackpots['ghost_frequency'] ? 1.005 : 1;
  const boost = boostActive(state, atTime) ? 2 : 1;
  return dmMult * rankMult * codexMult * ghostFreq * boost;
}

export function rigRatePerSec(state: GameState, rig: Rig, atTime: number): number {
  const r = state.rigs[rig.id];
  if (!r || !r.managed || r.owned <= 0) return 0;
  let base = (rig.basePayout / rig.cycleSec) * r.owned * milestoneMultiplier(r.owned) * globalIncomeMult(state, atTime);
  if (rig.id === 'salvage_fleet') {
    const bonus = Math.min(3, state.bests.bestFlipMargin); // capped +300%
    base *= 1 + bonus;
  }
  return base;
}

export function totalYardRatePerSec(state: GameState, rigs: Rig[], atTime: number): number {
  return rigs.reduce((sum, rig) => sum + rigRatePerSec(state, rig, atTime), 0);
}

export function gateToll(destinationSector: number): number {
  return 2_000_000 * Math.pow(15, destinationSector - 2);
}

export function sectorUnlockRank(destinationSector: number): number {
  return 20 + (destinationSector - 2) * 10;
}

export function darkMatterFromLifetime(lifetime: number): number {
  return Math.floor(50 * Math.sqrt(Math.max(0, lifetime) / 1e7));
}

export function offlineCapMs(longHaulLevel: number): number {
  const hours = [2, 6, 12, 24][Math.min(longHaulLevel, 3)];
  return hours * 60 * 60 * 1000;
}

export function luckyFlipChance(luckyCharmLevel: number): number {
  return [0.05, 0.08, 0.12][Math.min(luckyCharmLevel, 2)];
}
