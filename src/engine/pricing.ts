import type { Good } from '../config/types';
import { GOODS, GOODS_BY_ID } from '../config/goods';
import { stationBias, STATIONS } from '../config/stations';
import { generateSectorGoods, generateSectorBias } from './sectorgen';
import { allStationIds } from './state';
import type { GameState } from './state';
import { getState } from './store';
import { computePrice, eventMultiplier, type ActiveMarketEvent } from './price';
import { now } from './time';

const sectorGoodRe = /^s(\d+)_g(\d+)/;

/** The live run's seed; 0 for legacy saves (which keeps all legacy output identical). */
function activeRunSeed(): number {
  return getState().runSeed ?? 0;
}

const goodsCache = new Map<string, Good[]>();
function sectorGoodsCached(sector: number, runSeed: number): Good[] {
  const key = `${sector}:${runSeed}`;
  let goods = goodsCache.get(key);
  if (!goods) {
    goods = generateSectorGoods(sector, runSeed);
    goodsCache.set(key, goods);
  }
  return goods;
}

const biasCache = new Map<string, Record<string, Record<string, number>>>();
function sectorBiasTable(sector: number, runSeed: number): Record<string, Record<string, number>> {
  const key = `${sector}:${runSeed}`;
  let table = biasCache.get(key);
  if (!table) {
    table = generateSectorBias(allStationIds(), sectorGoodsCached(sector, runSeed), sector, runSeed);
    biasCache.set(key, table);
  }
  return table;
}

/** Per-run re-roll of the hand-authored sector-1 route matrix (same archetype:
 *  one exporter, ~40% importers). The Signal is excluded — it keeps its flat
 *  hand-authored 1.10 — and the tutorial scrap route is pinned so Onboarding
 *  steps 1-3 stay true on every run. */
function runBiasTableS1(runSeed: number): Record<string, Record<string, number>> {
  const key = `s1:${runSeed}`;
  let table = biasCache.get(key);
  if (!table) {
    const ids = STATIONS.filter((s) => s.id !== 'the_signal').map((s) => s.id);
    table = generateSectorBias(ids, GOODS, 1, runSeed);
    table['rust_harbor']['scrap_metal'] = 0.55;
    table['neon_bazaar']['scrap_metal'] = 1.45;
    biasCache.set(key, table);
  }
  return table;
}

export function goodById(goodId: string, runSeed = activeRunSeed()): Good | undefined {
  if (GOODS_BY_ID[goodId]) return GOODS_BY_ID[goodId];
  const m = sectorGoodRe.exec(goodId);
  if (!m) return undefined;
  const sector = parseInt(m[1], 10);
  return sectorGoodsCached(sector, runSeed).find((g) => g.id === goodId);
}

export function biasFor(stationId: string, good: Good, runSeed = activeRunSeed()): number {
  if (GOODS_BY_ID[good.id]) {
    if (runSeed === 0 || stationId === 'the_signal') return stationBias(stationId, good.id);
    return runBiasTableS1(runSeed)[stationId]?.[good.id] ?? stationBias(stationId, good.id);
  }
  const m = sectorGoodRe.exec(good.id);
  const sector = m ? parseInt(m[1], 10) : 2;
  return sectorBiasTable(sector, runSeed)[stationId]?.[good.id] ?? 1;
}

export function getPrice(state: GameState, stationId: string, goodId: string): number {
  const good = goodById(goodId, state.runSeed ?? 0);
  if (!good) return 0;
  const wave = state.waves[goodId];
  const waveValue = wave ? wave.value : 1;
  const bias = biasFor(stationId, good, state.runSeed ?? 0);
  const evMult = eventMultiplier(state.activeEvents, stationId, goodId, now());
  return computePrice({ base: good.base, bias, waveValue, eventMult: evMult, sector: state.sector });
}

export function isTradeDisabled(events: ActiveMarketEvent[], stationId: string, goodId: string, atTime: number): boolean {
  return events.some(
    (e) => e.disables && e.stationId === stationId && e.expiresAt > atTime && (e.goodId === null || e.goodId === goodId)
  );
}

export function goodsCatalogForState(state: GameState): Good[] {
  const list: Good[] = [...GOODS];
  for (let s = 2; s <= state.maxSectorReached; s++) list.push(...sectorGoodsCached(s, state.runSeed ?? 0));
  return list;
}

export function allUnlockedGoods(state: GameState): Good[] {
  return goodsCatalogForState(state).filter((g) => g.unlockRank <= state.rank);
}

export interface BestRoute {
  stationId: string;
  goodId: string;
  margin: number; // fractional profit margin, e.g. 0.42 = buy-here-sell-there nets +42%
}

/**
 * Best buy-here-sell-there opportunity across all reachable stations, considering
 * every good the player has unlocked. Powers Market Scanner III — spec §8: "the
 * Scanner is the strategy unlock... Scanner III makes the best-margin route glow."
 * Returns null if no reachable station offers a profitable flip right now.
 */
export function bestRoute(state: GameState): BestRoute | null {
  const t = now();
  const goods = allUnlockedGoods(state);
  let best: BestRoute | null = null;
  for (const st of STATIONS) {
    if (st.id === state.currentStation) continue;
    if (st.unlockRank > state.rank) continue;
    for (const g of goods) {
      if (isTradeDisabled(state.activeEvents, state.currentStation, g.id, t)) continue;
      if (isTradeDisabled(state.activeEvents, st.id, g.id, t)) continue;
      const buy = getPrice(state, state.currentStation, g.id);
      if (buy <= 0) continue;
      const sell = getPrice(state, st.id, g.id);
      const margin = (sell - buy) / buy;
      if (!best || margin > best.margin) best = { stationId: st.id, goodId: g.id, margin };
    }
  }
  return best && best.margin > 0 ? best : null;
}
