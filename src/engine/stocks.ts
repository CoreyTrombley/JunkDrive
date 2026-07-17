// Station stock levels — the "living market" half of spec 2026-07-16 feature 2.
// Sparse storage: only stations/goods the player has perturbed are stored;
// a missing entry means the stock sits at its baseline.
import type { Good } from '../config/types';
import type { GameState } from './state';
import { biasFor, goodById } from './pricing';

export function stockBaseline(stationId: string, good: Good, runSeed: number): number {
  const bias = biasFor(stationId, good, runSeed);
  if (bias < 0.8) return 120; // exporter: deep supply
  if (bias > 1.25) return 40; // importer: scarce
  return 70;
}

export function getStock(state: GameState, stationId: string, goodId: string): number {
  const entry = state.stocks[stationId]?.[goodId];
  if (entry !== undefined) return entry;
  const good = goodById(goodId, state.runSeed ?? 0);
  return good ? stockBaseline(stationId, good, state.runSeed ?? 0) : 70;
}

export function stockPriceMult(stock: number, baseline: number): number {
  if (baseline <= 0) return 1;
  if (stock <= baseline) return 1 + 0.5 * (1 - stock / baseline);
  return Math.max(0.7, 1 - 0.3 * (stock / baseline - 1));
}

/** delta < 0: player bought (stock drains); delta > 0: player sold (glut). */
export function applyStockTrade(state: GameState, stationId: string, goodId: string, delta: number): GameState {
  const next = Math.max(0, getStock(state, stationId, goodId) + delta);
  return {
    ...state,
    stocks: { ...state.stocks, [stationId]: { ...state.stocks[stationId], [goodId]: next } },
  };
}

/** Advance all perturbed stocks `pulses` steps toward baseline (12%, exporters 20%). */
export function regenStocks(state: GameState, pulses: number): GameState {
  const ids = Object.keys(state.stocks);
  if (ids.length === 0 || pulses <= 0) return state;
  const runSeed = state.runSeed ?? 0;
  const stocks: GameState['stocks'] = {};
  for (const stationId of ids) {
    for (const goodId of Object.keys(state.stocks[stationId])) {
      const good = goodById(goodId, runSeed);
      if (!good) continue;
      const B = stockBaseline(stationId, good, runSeed);
      const rate = B === 120 ? 0.2 : 0.12;
      let S = state.stocks[stationId][goodId];
      for (let i = 0; i < Math.min(pulses, 200); i++) S += (B - S) * rate;
      if (Math.abs(S - B) < 1.0) continue; // prune — reverts to implicit baseline
      (stocks[stationId] ??= {})[goodId] = S;
    }
  }
  return { ...state, stocks };
}
