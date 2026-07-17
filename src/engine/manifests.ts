// Trade manifests — contracted combo deliveries at a premium. Spec 2026-07-16
// feature 2: the "buy combinations of items" objective. Three offers live in
// state; expired ones reroll. Payouts bypass stock depletion (contract price).
import type { GameState } from './state';
import { STATIONS } from '../config/stations';
import { allUnlockedGoods, biasFor, goodById } from './pricing';
import { maxHold } from './derived';
import { sectorScale } from './price';
import { saleXp } from '../config/ranks';
import { type RngFn, pick, randInt, randRange, shuffle } from './rng';

export interface Manifest {
  id: string;
  stationId: string;
  items: { goodId: string; qty: number }[];
  rewardCredits: number;
  rewardXp: number;
  premium: number;
  expiresAt: number;
}

export const MANIFEST_SLOTS = 3;

export function generateManifest(state: GameState, rng: RngFn, seq: number, t: number): Manifest {
  const runSeed = state.runSeed ?? 0;
  const stations = STATIONS.filter((s) => s.unlockRank <= state.rank && s.id !== state.currentStation);
  const target = stations.length ? pick(rng, stations) : STATIONS[0];

  const targetStation = STATIONS.find((s) => s.id === target.id);
  // No contraband demands at stations that scan — a customs bust at the delivery
  // door would eat the manifest cargo. The Signal (scanChance 0) stays a legal buyer.
  const unlocked = allUnlockedGoods(state).filter(
    (g) => g.tier >= (targetStation?.minGoodTier ?? 1) && !(g.contraband && (targetStation?.scanChance ?? 0) > 0)
  );
  // Prefer goods this station does NOT export cheaply — sourcing them means travel.
  const preferred = unlocked.filter((g) => biasFor(target.id, g, runSeed) >= 0.9);
  const pool = preferred.length >= 2 ? preferred : unlocked;
  const count = Math.max(1, Math.min(pool.length, randInt(rng, 2, 3)));
  const goods = shuffle(rng, pool).slice(0, count);

  const tonsBudget = maxHold(state) * randRange(rng, 0.6, 0.9);
  const share = tonsBudget / goods.length;
  let items = goods.map((g) => ({ goodId: g.id, qty: Math.max(1, Math.floor(share / g.mass)) }));
  // The per-item Math.max(1, …) bump can push a 3-heavy-goods manifest past the
  // hold on an unupgraded ship — undeliverable, since canDeliver needs everything
  // aboard at once. Dropping the heaviest line always leaves a fitting 2-item combo.
  const tonsOf = (list: typeof items) =>
    list.reduce((t, it) => t + (goodById(it.goodId, runSeed)?.mass ?? 1) * it.qty, 0);
  if (items.length > 2 && tonsOf(items) > maxHold(state)) {
    const heaviest = items.reduce((a, b) =>
      (goodById(a.goodId, runSeed)?.mass ?? 1) * a.qty >= (goodById(b.goodId, runSeed)?.mass ?? 1) * b.qty ? a : b);
    items = items.filter((it) => it !== heaviest);
  }

  const baseValue = items.reduce(
    (sum, it) => sum + (goodById(it.goodId, runSeed)?.base ?? 0) * sectorScale(state.sector) * it.qty, 0);
  const premium = randRange(rng, 1.7, 2.2);
  const rewardCredits = Math.round(baseValue * premium);
  const rewardXp = Math.round(1.5 * saleXp(rewardCredits * 0.45));

  return {
    id: `m${seq}`,
    stationId: target.id,
    items,
    rewardCredits,
    rewardXp,
    premium,
    expiresAt: t + randInt(rng, 20, 40) * 60_000,
  };
}

export function canDeliver(state: GameState, m: Manifest): boolean {
  if (state.currentStation !== m.stationId) return false;
  return m.items.every((it) => (state.cargo[it.goodId]?.qty ?? 0) >= it.qty);
}
