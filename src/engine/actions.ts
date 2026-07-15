// The reducer. Every mutation to game state flows through a function in this
// file; UI components call these and read `store.value` (via the store
// signal) to render. Side-effect "juice" (SFX/haptics/floaters/confetti) is
// fired through engine/bus.ts so this file stays focused on game logic.

import { getState, setState, store, clockTick } from './store';
import { emit } from './bus';
import type { GameState, Quest, CargoEntry, Settings } from './state';
import { createInitialState, allStationIds } from './state';
import { GOODS, GOODS_BY_ID } from '../config/goods';
import { STATIONS, STATIONS_BY_ID } from '../config/stations';
import { RIGS, RIGS_BY_ID } from '../config/rigs';
import { xpToNext, saleXp, titleForRank, rankGoodieCredits, isBoostRank, RANK_UNLOCK_LABELS } from '../config/ranks';
import {
  MARKET_EVENTS, MARKET_EVENTS_BY_ID, ENCOUNTERS, ENCOUNTERS_BY_ID, JACKPOTS, ARRIVAL_ROLL_WEIGHTS,
} from '../config/events';
import { RELICS_BY_ID, relicCost, relicMaxLevel } from '../config/relics';
import { SHIP_UPGRADES_BY_ID, upgradeCost } from '../config/ship';
import { CODEX_SETS } from '../config/codex';
import {
  pulseWave, fastForwardWave, PULSE_INTERVAL_MS, initWave, type ActiveMarketEvent,
} from './price';
import { goodById, getPrice, isTradeDisabled, allUnlockedGoods } from './pricing';
import {
  rigUnitCost, rigBatchCost, maxAffordableRigQty, milestoneMultiplier,
  codexBonusMult, globalIncomeMult, totalYardRatePerSec, gateToll,
  sectorUnlockRank, darkMatterFromLifetime, offlineCapMs, luckyFlipChance,
  rigTapPayout,
} from './formulas';
import {
  maxHold, usedHold, maxFuel, fuelRegenSec, scanChanceFor, netWorth,
  goldenRolodexActive, eventMagnetActive, tollDiscount,
} from './derived';
import { mulberry32, randRange, randInt, chance, pickWeighted, pick, shuffle, type RngFn } from './rng';
import { generateQuest, generateFullRail } from './quests';
import { generateSectorGoods } from './sectorgen';
import { loadSave, writeSave, exportSaveCode, importSaveCode } from './save';
import { now } from './time';
import { formatSignedCredits } from './num';
import { maybeOfferInstall } from './installPrompt';

const sessionRng: RngFn = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);

const AMBIENT_INTERVAL_MS = 5 * 60_000;
const HOT_STREAK_WINDOW_MS = 90_000;
const BOOST_DURATION_MS = 10 * 60_000;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function addCargo(cargo: Record<string, CargoEntry>, goodId: string, qty: number, atCost: number): Record<string, CargoEntry> {
  if (qty <= 0) return cargo;
  const existing = cargo[goodId] || { qty: 0, avgCost: 0 };
  const newQty = existing.qty + qty;
  const newAvg = newQty > 0 ? (existing.qty * existing.avgCost + qty * atCost) / newQty : 0;
  return { ...cargo, [goodId]: { qty: newQty, avgCost: newAvg } };
}

function dropCargoFraction(cargo: Record<string, CargoEntry>, pct: number): Record<string, CargoEntry> {
  const out: Record<string, CargoEntry> = {};
  for (const [gid, c] of Object.entries(cargo)) {
    const newQty = Math.floor(c.qty * (1 - pct));
    if (newQty > 0) out[gid] = { qty: newQty, avgCost: c.avgCost };
  }
  return out;
}

function dropContraband(cargo: Record<string, CargoEntry>): Record<string, CargoEntry> {
  const out: Record<string, CargoEntry> = {};
  for (const [gid, c] of Object.entries(cargo)) {
    if (!GOODS_BY_ID[gid]?.contraband) out[gid] = c;
  }
  return out;
}

function bestUnlockedTier(rank: number): number {
  return GOODS.filter((g) => g.unlockRank <= rank).reduce((max, g) => Math.max(max, g.tier), 1);
}

function stampCodex(state: GameState, kind: keyof GameState['codex'], id: string): GameState {
  if (state.codex[kind][id]) return state;
  const codex = { ...state.codex, [kind]: { ...state.codex[kind], [id]: true } };
  let st: GameState = { ...state, codex };
  st = progressQuests(st, (q) =>
    q.kind === 'codex_set' && q.progress < q.goal && CODEX_SETS.some((set) => set.memberIds.every((m) => st.codex[set.kind][m]))
      ? { ...q, progress: q.goal }
      : q
  );
  return st;
}

function progressQuests(state: GameState, updater: (q: Quest) => Quest): GameState {
  return { ...state, quests: state.quests.map(updater) };
}

function checkMilestones(state: GameState): GameState {
  let st = state;
  const nw = netWorth(st);

  if (nw >= 1_000_000) {
    const elapsed = now() - st.runStartedAt;
    if (st.bests.fastestMillionMs === null || elapsed < st.bests.fastestMillionMs) {
      st = { ...st, bests: { ...st.bests, fastestMillionMs: elapsed } };
    }
  }

  if (nw < 10) return st;
  const p = Math.floor(Math.log10(nw));
  if (p < 1 || st.milestones.includes(p)) return st;
  st = { ...st, milestones: [...st.milestones, p], boostTokens: st.boostTokens + 1 };
  emit({ type: 'toast', text: `MILESTONE — 10^${p} net worth! +1 Boost Token`, icon: '🏆' });
  emit({ type: 'confetti', power: 'small' });
  return st;
}

function applyXpAndRankUps(state: GameState): GameState {
  let st = state;
  let leveled = false;
  let guard = 0;
  while (st.xp >= xpToNext(st.rank) && guard < 500) {
    guard++;
    st = { ...st, xp: st.xp - xpToNext(st.rank), rank: st.rank + 1 };
    leveled = true;
    const goodie = rankGoodieCredits(netWorth(st));
    let boostTokens = st.boostTokens;
    if (isBoostRank(st.rank)) boostTokens += 1;
    st = { ...st, credits: st.credits + goodie, boostTokens };
    const label = RANK_UNLOCK_LABELS[st.rank];
    emit({ type: 'toast', text: `RANK ${st.rank} — ${titleForRank(st.rank)}${label ? ' · ' + label : ''}`, icon: '⭐' });
  }
  if (leveled) {
    emit({ type: 'sfx', id: 'rank_up' });
    emit({ type: 'haptic', pattern: 'rank_up' });
    emit({ type: 'confetti', power: 'big' });
  }
  return st;
}

// ---------------------------------------------------------------------------
// Boot / save / settings
// ---------------------------------------------------------------------------

export function bootGame(): { offlineReport: GameState['pendingOfflineReport'] } {
  const loaded = loadSave();
  if (!loaded) {
    let state = createInitialState();
    state = { ...state, quests: generateFullRail(state, sessionRng, state.questIdSeq), questIdSeq: state.questIdSeq + 3 };
    store.value = state;
    return { offlineReport: null };
  }

  // Merge settings/stats over fresh defaults rather than trusting the raw saved shape
  // verbatim: a save from before a new field existed (e.g. musicVolume, goodsSold) would
  // otherwise load that field as `undefined`, which breaks sliders/stat tiles and can
  // throw when an AudioParam is assigned a non-finite value.
  const fresh = createInitialState();
  let state: GameState = {
    ...loaded,
    settings: { ...fresh.settings, ...loaded.settings },
    stats: { ...fresh.stats, ...loaded.stats },
  };
  const t = now();
  const elapsed = Math.max(0, t - state.lastSeen);

  state = processMarketPulses(state, t);
  state = regenFuelState(state, t);

  const longHaulLvl = state.relics['long_haul'] || 0;
  const cap = offlineCapMs(longHaulLvl);
  const cappedElapsed = Math.min(elapsed, cap);
  const rate = totalYardRatePerSec(state, RIGS, t);
  const earned = rate * (cappedElapsed / 1000);
  if (earned > 0) {
    state = { ...state, credits: state.credits + earned, lifetimeEarnings: state.lifetimeEarnings + earned };
    state = checkMilestones(state);
  }
  state = { ...state, lastIdleSettleAt: t };

  const stillActive = state.activeEvents.filter((e) => e.expiresAt > t);
  if (stillActive.length === 0 && elapsed > 2 * 60_000) {
    const rolled = rollMarketEvent(state, t);
    state = { ...state, activeEvents: rolled ?? [], lastAmbientEventAt: t };
  } else {
    state = { ...state, activeEvents: stillActive, lastAmbientEventAt: t };
  }

  if (!state.quests || state.quests.length < 3) {
    state = { ...state, quests: generateFullRail(state, sessionRng, state.questIdSeq), questIdSeq: state.questIdSeq + 3 };
  }

  const offlineReport = elapsed > 30_000 ? { amount: earned, elapsedMs: elapsed, capped: elapsed > cap } : null;
  state = { ...state, pendingOfflineReport: offlineReport, lastSeen: t };

  store.value = state;
  return { offlineReport };
}

let clockInterval: ReturnType<typeof setInterval> | null = null;
let autosaveInterval: ReturnType<typeof setInterval> | null = null;

export function startGameLoop(): void {
  if (clockInterval) return;
  clockInterval = setInterval(() => {
    tick();
    clockTick.value = clockTick.value + 1;
  }, 250);
  autosaveInterval = setInterval(() => writeSave(getState()), 5000);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) writeSave(getState());
    });
    window.addEventListener('beforeunload', () => writeSave(getState()));
  }
}

export function stopGameLoop(): void {
  if (clockInterval) clearInterval(clockInterval);
  if (autosaveInterval) clearInterval(autosaveInterval);
  clockInterval = null;
  autosaveInterval = null;
}

export function updateSettings(partial: Partial<Settings>): void {
  setState((s) => ({ ...s, settings: { ...s.settings, ...partial } }));
}

export function exportSave(): string {
  return exportSaveCode(getState());
}

export function importSave(code: string): { ok: boolean; reason?: string } {
  try {
    const loaded = importSaveCode(code);
    store.value = loaded;
    writeSave(loaded);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Invalid save code.' };
  }
}

// ---------------------------------------------------------------------------
// Tick pipeline
// ---------------------------------------------------------------------------

function settleIdleIncome(state: GameState, t: number): GameState {
  const elapsed = t - state.lastIdleSettleAt;
  if (elapsed <= 0) return { ...state, lastIdleSettleAt: t };
  const rate = totalYardRatePerSec(state, RIGS, t);
  const earned = rate * (elapsed / 1000);
  if (earned <= 0) return { ...state, lastIdleSettleAt: t };
  let st: GameState = {
    ...state,
    credits: state.credits + earned,
    lifetimeEarnings: state.lifetimeEarnings + earned,
    lastIdleSettleAt: t,
  };
  st = checkMilestones(st);
  return st;
}

function regenFuelState(state: GameState, t: number): GameState {
  const mf = maxFuel(state);
  if (state.fuel >= mf) return { ...state, fuel: mf, lastFuelUpdateAt: t };
  const regenSec = fuelRegenSec(state);
  const elapsedSec = (t - state.lastFuelUpdateAt) / 1000;
  const gained = elapsedSec / regenSec;
  const newFuel = Math.min(mf, state.fuel + gained);
  return { ...state, fuel: newFuel, lastFuelUpdateAt: t };
}

function processMarketPulses(state: GameState, t: number): GameState {
  const elapsed = t - state.lastMarketPulseAt;
  if (elapsed < PULSE_INTERVAL_MS) return state;
  const pulses = Math.floor(elapsed / PULSE_INTERVAL_MS);
  const waves = { ...state.waves };
  for (const goodId in waves) {
    const good = goodById(goodId);
    if (!good) continue;
    const w = { value: waves[goodId].value, history: [...waves[goodId].history] };
    fastForwardWave(w, good.volatility, pulses, sessionRng);
    waves[goodId] = w;
  }
  return { ...state, waves, lastMarketPulseAt: state.lastMarketPulseAt + pulses * PULSE_INTERVAL_MS };
}

function maybeSpawnAmbientEvent(state: GameState, t: number): GameState {
  if (state.activeEvents.filter((e) => e.expiresAt > t).length >= 3) return state;
  if (t - state.lastAmbientEventAt < AMBIENT_INTERVAL_MS) return state;
  const rolled = rollMarketEvent(state, t);
  if (!rolled) return { ...state, lastAmbientEventAt: t };
  const trimmed = [...state.activeEvents.filter((e) => e.expiresAt > t), ...rolled].slice(-6);
  return { ...state, activeEvents: trimmed, lastAmbientEventAt: t };
}

function expireTimers(state: GameState, t: number): GameState {
  let st = state;
  if (st.hotStreak.count > 0 && st.hotStreak.expiresAt <= t) {
    st = { ...st, hotStreak: { count: 0, expiresAt: 0 } };
    emit({ type: 'sfx', id: 'streak_break' });
  }
  if (st.activeBoost && st.activeBoost.expiresAt <= t) {
    st = { ...st, activeBoost: null };
  }
  return st;
}

export function tick(): void {
  const t = now();
  setState((s) => {
    let state = s;
    state = settleIdleIncome(state, t);
    state = regenFuelState(state, t);
    state = processMarketPulses(state, t);
    state = maybeSpawnAmbientEvent(state, t);
    state = expireTimers(state, t);
    state = { ...state, lastSeen: t };
    return state;
  });
}

// ---------------------------------------------------------------------------
// Market events
// ---------------------------------------------------------------------------

function rollMarketEvent(state: GameState, t: number): ActiveMarketEvent[] | null {
  const unlocked = allUnlockedGoods(state);
  if (unlocked.length === 0) return null;
  const stationsUnlocked = STATIONS.filter((s) => s.unlockRank <= state.rank);
  if (stationsUnlocked.length === 0) return null;

  const def = pickWeighted(sessionRng, MARKET_EVENTS.map((e) => ({ item: e, weight: e.weight })));
  const station = pick(sessionRng, stationsUnlocked);
  const duration = randRange(sessionRng, def.minDurationMs, def.maxDurationMs);
  const expiresAt = t + duration;
  const mult = randRange(sessionRng, def.minMult, def.maxMult);
  const mkId = () => `${def.id}-${t}-${Math.floor(sessionRng() * 100000)}`;

  if (def.scope === 'all-goods-one-station') {
    return [{ id: mkId(), kind: def.id, stationId: station.id, goodId: null, multiplier: mult, startedAt: t, expiresAt }];
  }
  if (def.scope === 'sector-wide-good') {
    const good = pick(sessionRng, unlocked);
    return stationsUnlocked.map((s) => ({ id: mkId(), kind: def.id, stationId: s.id, goodId: good.id, multiplier: mult, startedAt: t, expiresAt }));
  }
  if (def.scope === 'multi-good') {
    const count = Math.min(def.goodCount, unlocked.length);
    const picked = shuffle(sessionRng, unlocked).slice(0, count);
    return picked.map((g) => ({ id: mkId(), kind: def.id, stationId: station.id, goodId: g.id, multiplier: mult, startedAt: t, expiresAt }));
  }
  const good = pick(sessionRng, unlocked);
  return [{ id: mkId(), kind: def.id, stationId: station.id, goodId: good.id, multiplier: def.disables ? 1 : mult, startedAt: t, expiresAt, disables: def.disables }];
}

// ---------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------

export function buyGood(goodId: string, qty: number): { ok: boolean; reason?: string; spent?: number; qty?: number } {
  if (qty <= 0) return { ok: false, reason: 'Nothing to buy.' };
  const state = getState();
  const good = goodById(goodId);
  if (!good) return { ok: false, reason: 'Unknown good.' };
  if (good.unlockRank > state.rank) return { ok: false, reason: `Unlocks at Rank ${good.unlockRank}.` };
  const station = STATIONS_BY_ID[state.currentStation];
  if (station && good.tier < station.minGoodTier) return { ok: false, reason: 'Not stocked here.' };
  if (isTradeDisabled(state.activeEvents, state.currentStation, goodId, now())) return { ok: false, reason: 'Embargoed here right now.' };
  const free = maxHold(state) - usedHold(state);
  const buyQty = Math.min(qty, free);
  if (buyQty <= 0) return { ok: false, reason: 'Cargo hold full.' };
  const price = getPrice(state, state.currentStation, goodId);
  const cost = price * buyQty;
  if (cost > state.credits) {
    emit({ type: 'sfx', id: 'cant_afford' });
    emit({ type: 'haptic', pattern: 'error' });
    return { ok: false, reason: 'Not enough credits.' };
  }
  setState((s) => ({
    ...s,
    credits: s.credits - cost,
    cargo: addCargo(s.cargo, goodId, buyQty, price),
    stats: {
      ...s.stats,
      creditsSpent: s.stats.creditsSpent + cost,
      goodsBought: { ...s.stats.goodsBought, [goodId]: (s.stats.goodsBought[goodId] ?? 0) + buyQty },
    },
  }));
  emit({ type: 'sfx', id: 'buy' });
  emit({ type: 'haptic', pattern: 'tap' });
  emit({ type: 'floater', text: formatSignedCredits(-cost), kind: 'info' });
  return { ok: true, spent: cost, qty: buyQty };
}

export function sellGood(goodId: string, qty: number): { ok: boolean; reason?: string; profit?: number; isCrit?: boolean; qty?: number } {
  const state = getState();
  const entry = state.cargo[goodId];
  if (!entry || entry.qty <= 0) return { ok: false, reason: 'Nothing to sell.' };
  if (isTradeDisabled(state.activeEvents, state.currentStation, goodId, now())) return { ok: false, reason: 'Embargoed here right now.' };
  const sellQty = Math.min(qty, entry.qty);
  const basePrice = getPrice(state, state.currentStation, goodId);
  const t = now();

  const streakActive = state.hotStreak.expiresAt > t;
  const streakMult = 1 + Math.min(streakActive ? state.hotStreak.count : 0, 5) * 0.08;
  const luckyChance = luckyFlipChance(state.relics['lucky_charm'] || 0);
  const isCrit = chance(sessionRng, luckyChance);
  const effPrice = basePrice * streakMult * (isCrit ? 2 : 1);

  const revenue = effPrice * sellQty;
  const cost = entry.avgCost * sellQty;
  const profit = revenue - cost;
  const marginFrac = entry.avgCost > 0 ? (effPrice - entry.avgCost) / entry.avgCost : 0;
  const gainedXp = profit > 0 ? saleXp(profit) : 1;
  const newStreakCount = profit > 0 ? Math.min(5, (streakActive ? state.hotStreak.count : 0) + 1) : 0;

  setState((s) => {
    const remainingQty = entry.qty - sellQty;
    const newCargo = { ...s.cargo };
    if (remainingQty <= 0) delete newCargo[goodId];
    else newCargo[goodId] = { qty: remainingQty, avgCost: entry.avgCost };

    let st: GameState = {
      ...s,
      cargo: newCargo,
      credits: s.credits + revenue,
      lifetimeEarnings: s.lifetimeEarnings + Math.max(0, profit),
      xp: s.xp + gainedXp,
      hotStreak: profit > 0 ? { count: newStreakCount, expiresAt: t + HOT_STREAK_WINDOW_MS } : { count: 0, expiresAt: 0 },
      bests: {
        ...s.bests,
        biggestSale: Math.max(s.bests.biggestSale, revenue),
        bestFlipMargin: Math.max(s.bests.bestFlipMargin, marginFrac),
      },
      stats: {
        ...s.stats,
        totalSales: s.stats.totalSales + 1,
        creditsEarned: s.stats.creditsEarned + revenue,
        goodsSold: { ...s.stats.goodsSold, [goodId]: (s.stats.goodsSold[goodId] ?? 0) + sellQty },
      },
    };
    st = stampCodex(st, 'goods', goodId);
    st = applyXpAndRankUps(st);
    st = progressQuests(st, (q) => {
      if (q.kind === 'flip_units' && (!q.goodId || q.goodId === goodId)) return { ...q, progress: Math.min(q.goal, q.progress + sellQty) };
      if (q.kind === 'bank_sale' && profit >= q.goal) return { ...q, progress: q.goal };
      if (q.kind === 'hot_streak' && newStreakCount >= q.goal) return { ...q, progress: q.goal };
      if (q.kind === 'lucky_flip' && isCrit) return { ...q, progress: 1 };
      return q;
    });
    st = checkMilestones(st);
    return st;
  });

  if (isCrit) {
    emit({ type: 'sfx', id: 'lucky_flip' });
    emit({ type: 'confetti', power: 'small' });
  } else {
    emit({ type: 'sfx', id: 'sell' });
  }
  emit({ type: 'haptic', pattern: 'sell' });
  emit({ type: 'floater', text: formatSignedCredits(profit), kind: profit >= 0 ? 'profit' : 'loss' });
  if (newStreakCount >= 2) emit({ type: 'sfx', id: 'streak_up', data: newStreakCount });

  return { ok: true, profit, isCrit, qty: sellQty };
}

// ---------------------------------------------------------------------------
// Jumping / arrivals
// ---------------------------------------------------------------------------

export function startJump(targetStationId: string): { ok: boolean; reason?: string } {
  const state = getState();
  const target = STATIONS_BY_ID[targetStationId];
  if (!target) return { ok: false, reason: 'Unknown station.' };
  if (target.unlockRank > state.rank) return { ok: false, reason: `Unlocks at Rank ${target.unlockRank}.` };
  if (targetStationId === state.currentStation) return { ok: false, reason: 'Already docked here.' };
  if (state.fuel < 1) return { ok: false, reason: 'Out of fuel.' };
  setState((s) => ({ ...s, fuel: s.fuel - 1 }));
  emit({ type: 'sfx', id: 'jump' });
  emit({ type: 'haptic', pattern: 'tap' });
  return { ok: true };
}

interface RolledArrival {
  kind: 'clean' | 'market_event' | 'encounter' | 'petty_salvage' | 'hq_ping' | 'jackpot';
  detail?: { encounterId?: string; jackpotId?: string };
}

function rollArrival(state: GameState): RolledArrival {
  const weights = { ...ARRIVAL_ROLL_WEIGHTS };
  if (eventMagnetActive(state)) {
    weights.clean = Math.max(0, weights.clean - 8);
    weights.market_event += 8;
  }
  const entries = (Object.keys(weights) as Array<keyof typeof weights>).map((k) => ({ item: k, weight: weights[k] }));
  const kind = pickWeighted(sessionRng, entries);
  if (kind === 'encounter') {
    const pool = ENCOUNTERS.filter((e) => !e.requiresContraband);
    const eligible = pool.filter((e) => !e.requiresGood || (state.cargo[e.requiresGood]?.qty ?? 0) > 0);
    const chosen = pickWeighted(sessionRng, eligible.map((e) => ({ item: e.id, weight: e.weight })));
    return { kind: 'encounter', detail: { encounterId: chosen } };
  }
  if (kind === 'jackpot') {
    const pool = state.stats.totalPrestiges > 0 ? JACKPOTS : JACKPOTS.filter((j) => j.id !== 'wormhole_echo');
    const chosen = pick(sessionRng, pool);
    return { kind: 'jackpot', detail: { jackpotId: chosen.id } };
  }
  return { kind };
}

function applyArrivalRoll(state: GameState, roll: RolledArrival, t: number): GameState {
  let st = state;
  const setToast = (toast: { text: string; icon: string }) => {
    emit({ type: 'toast', text: toast.text, icon: toast.icon });
  };

  switch (roll.kind) {
    case 'clean': {
      setToast({ text: 'Clean approach.', icon: '🛰️' });
      break;
    }
    case 'market_event': {
      const events = rollMarketEvent(st, t);
      if (events && events.length) {
        const trimmed = [...st.activeEvents.filter((e) => e.expiresAt > t), ...events].slice(-6);
        st = { ...st, activeEvents: trimmed };
        st = stampCodex(st, 'events', events[0].kind);
        const def = MARKET_EVENTS_BY_ID[events[0].kind];
        const stationName = STATIONS_BY_ID[events[0].stationId]?.name ?? '?';
        const goodName = events[0].goodId ? goodById(events[0].goodId)?.name ?? '?' : '';
        const text = def.copyTemplate
          .replace('{station}', stationName)
          .replace('{good}', goodName)
          .replace('{mult}', events[0].multiplier.toFixed(1)); // templates already carry a literal × before {mult}
        setToast({ text, icon: def.icon });
      }
      break;
    }
    case 'encounter': {
      const encounterId = roll.detail?.encounterId ?? 'wandering_trader';
      st = { ...st, pendingEncounter: { encounterId, rolledAt: t } };
      break;
    }
    case 'petty_salvage': {
      const unlocked = allUnlockedGoods(st);
      if (unlocked.length) {
        const good = pick(sessionRng, unlocked);
        const qty = Math.min(randInt(sessionRng, 1, 3), maxHold(st) - usedHold(st));
        if (qty > 0) {
          st = { ...st, cargo: addCargo(st.cargo, good.id, qty, 0) };
          setToast({ text: `Found ${qty}× ${good.name} floating by. Finders keepers.`, icon: good.icon });
        }
      }
      break;
    }
    case 'hq_ping': {
      const bonus = Math.max(15, netWorth(st) * 0.02);
      st = { ...st, credits: st.credits + bonus };
      setToast({ text: `The Yard found something. +${formatSignedCredits(bonus)}`, icon: '🎁' });
      break;
    }
    case 'jackpot': {
      const jackpotId = roll.detail?.jackpotId ?? 'motherlode';
      st = stampCodex(st, 'jackpots', jackpotId);
      st = { ...st, pendingJackpot: { jackpotId, triggeredAt: t, stationId: st.currentStation } };
      // The audio/haptic/confetti voices for this moment (a full fanfare tone, the
      // biggest haptic pattern in the game, big confetti) already existed but were
      // never triggered — arrival only ever set pendingJackpot and let the modal
      // render silently. Every other celebration (rank up, milestones) fires all
      // three; jackpots — the rarest, biggest moment — should too.
      emit({ type: 'sfx', id: 'jackpot' });
      emit({ type: 'haptic', pattern: 'jackpot' });
      emit({ type: 'confetti', power: 'big' });
      if (jackpotId === 'motherlode') {
        const free = maxHold(st) - usedHold(st);
        if (free > 0) {
          const bestTier = bestUnlockedTier(st.rank);
          const pool = GOODS.filter((g) => g.tier <= bestTier + 1 && g.unlockRank <= st.rank + 5);
          const good = pool.length ? pick(sessionRng, pool) : GOODS[0];
          st = { ...st, cargo: addCargo(st.cargo, good.id, free, 0) };
        }
      } else if (jackpotId === 'golden_buyer') {
        const ev: ActiveMarketEvent = {
          id: `golden-${t}`, kind: 'golden_buyer', stationId: st.currentStation, goodId: null,
          multiplier: 10, startedAt: t, expiresAt: t + 60_000,
        };
        st = { ...st, activeEvents: [...st.activeEvents.filter((e) => e.expiresAt > t), ev] };
      } else if (jackpotId === 'wormhole_echo') {
        st = { ...st, darkMatter: st.darkMatter + 1 };
      }
      break;
    }
  }
  return st;
}

export function completeJump(targetStationId: string): { roll: RolledArrival } {
  const t = now();
  let rolled: RolledArrival = { kind: 'clean' };
  setState((s) => {
    let state: GameState = { ...s, currentStation: targetStationId, stats: { ...s.stats, totalJumps: s.stats.totalJumps + 1 } };
    state = stampCodex(state, 'stations', targetStationId);
    // Arriving forces an immediate local pulse (spec §5.2)
    state = processMarketPulses({ ...state, lastMarketPulseAt: state.lastMarketPulseAt - PULSE_INTERVAL_MS }, t);

    const carryingContraband = Object.keys(state.cargo).some((gid) => state.cargo[gid].qty > 0 && GOODS_BY_ID[gid]?.contraband);
    const scanChance = scanChanceFor(state, targetStationId);
    const forced = carryingContraband && chance(sessionRng, scanChance);

    rolled = forced ? { kind: 'encounter', detail: { encounterId: 'customs_scan' } } : rollArrival(state);
    if (forced) state = { ...state, pendingEncounter: { encounterId: 'customs_scan', rolledAt: t } };
    else state = applyArrivalRoll(state, rolled, t);

    state = progressQuests(state, (q) => {
      if (q.kind === 'visit_station' && q.stationId === targetStationId) return { ...q, progress: q.goal };
      if (q.kind === 'jump_n') return { ...q, progress: Math.min(q.goal, q.progress + 1) };
      return q;
    });
    return state;
  });
  emit({ type: 'sfx', id: 'arrival', stationMotif: STATIONS_BY_ID[targetStationId]?.theme.motif });
  return { roll: rolled };
}

export function dismissPendingJackpot(): void {
  setState((s) => ({ ...s, pendingJackpot: null }));
}

// ---------------------------------------------------------------------------
// Encounters
// ---------------------------------------------------------------------------

export function resolveEncounter(choiceId: string): { ok: boolean; text: string } {
  const state = getState();
  const pending = state.pendingEncounter;
  if (!pending) return { ok: false, text: '' };
  const def = ENCOUNTERS_BY_ID[pending.encounterId];
  const choice = def?.choices.find((c) => c.id === choiceId);
  if (!def || !choice) return { ok: false, text: '' };
  const t = now();
  let resultText = '';

  setState((s) => {
    let st: GameState = { ...s, pendingEncounter: null };
    st = stampCodex(st, 'encounters', def.id);

    const cargoValue = (state2: GameState) =>
      Object.entries(state2.cargo).reduce((sum, [gid, c]) => sum + c.qty * getPrice(state2, state2.currentStation, gid), 0);
    const contrabandValue = (state2: GameState) =>
      Object.entries(state2.cargo).reduce(
        (sum, [gid, c]) => (GOODS_BY_ID[gid]?.contraband ? sum + c.qty * getPrice(state2, state2.currentStation, gid) : sum),
        0
      );

    switch (def.id) {
      case 'pirate_toll': {
        if (choice.id === 'pay') {
          const pct = Number(choice.params?.pct ?? 0.1);
          const cost = cargoValue(st) * pct;
          st = { ...st, credits: Math.max(0, st.credits - cost) };
          resultText = `Paid ${formatSignedCredits(-cost).replace('-', '')}. They let you through.`;
        } else {
          const success = chance(sessionRng, Number(choice.successChance ?? 0.5));
          if (success) {
            st = { ...st, xp: st.xp + Number(choice.params?.xpOnEscape ?? 30) };
            resultText = 'You lost them in an asteroid field! +XP';
          } else {
            st = { ...st, cargo: dropCargoFraction(st.cargo, Number(choice.params?.lossPctOnFail ?? 0.3)) };
            resultText = 'They clipped your hold. Some cargo is gone.';
          }
        }
        break;
      }
      case 'derelict': {
        if (choice.id === 'board') {
          const success = chance(sessionRng, Number(choice.successChance ?? 0.7));
          if (success) {
            const minQ = Number(choice.params?.gainMinQty ?? 2);
            const maxQ = Number(choice.params?.gainMaxQty ?? 6);
            const qty = Math.min(randInt(sessionRng, minQ, maxQ), maxHold(st) - usedHold(st));
            const bestTier = bestUnlockedTier(st.rank);
            const pool = GOODS.filter((g) => g.tier <= bestTier + 1 && g.unlockRank <= st.rank + 3);
            const good = pool.length ? pick(sessionRng, pool) : GOODS[0];
            st = { ...st, cargo: addCargo(st.cargo, good.id, Math.max(0, qty), 0) };
            resultText = qty > 0 ? `Salvaged ${qty}× ${good.name}. Free loot.` : 'Hold was full — grabbed nothing.';
          } else {
            st = { ...st, fuel: Math.max(0, st.fuel - Number(choice.params?.fuelLossOnFail ?? 1)) };
            resultText = 'Booby trap! Lost fuel scrambling out.';
          }
        } else {
          st = { ...st, xp: st.xp + Number(choice.params?.xp ?? 5) };
          resultText = 'You fly past. Probably smart.';
        }
        break;
      }
      case 'wandering_trader': {
        if (choice.id === 'deal') {
          const rolodex = goldenRolodexActive(st);
          const minPct = Number(choice.params?.minPct ?? 0.55);
          const maxPctRaw = Number(choice.params?.maxPct ?? 0.75);
          const maxPct = rolodex ? Math.min(0.6, maxPctRaw) : maxPctRaw;
          const goodOdds = Number(choice.params?.goodOdds ?? 0.8);
          const unlocked = allUnlockedGoods(st);
          const good = unlocked.length ? pick(sessionRng, unlocked) : GOODS[0];
          const price = getPrice(st, st.currentStation, good.id);
          const pct = randRange(sessionRng, minPct, maxPct);
          const dealPrice = price * pct;
          const qty = Math.min(randInt(sessionRng, 3, 10), maxHold(st) - usedHold(st));
          const cost = dealPrice * qty;
          const isGoodDeal = chance(sessionRng, goodOdds) || rolodex;
          if (qty > 0 && st.credits >= cost && isGoodDeal) {
            st = { ...st, credits: st.credits - cost, cargo: addCargo(st.cargo, good.id, qty, dealPrice) };
            resultText = `Bought ${qty}× ${good.name} at ${Math.round((1 - pct) * 100)}% off galactic average.`;
          } else {
            resultText = "'Eh, changed my mind.' Nothing happens.";
          }
        } else {
          resultText = 'You wave them off.';
        }
        break;
      }
      case 'customs_scan': {
        if (choice.id === 'payfine') {
          const cost = contrabandValue(st) * Number(choice.params?.pct ?? 0.4);
          st = { ...st, credits: Math.max(0, st.credits - cost) };
          resultText = `Paid a ${formatSignedCredits(-cost).replace('-', '')} fine. Clean record.`;
        } else if (choice.id === 'bribe') {
          const backfireChance = Number(choice.params?.backfireChance ?? 0.25);
          const backfired = chance(sessionRng, backfireChance);
          const pct = backfired ? Number(choice.params?.backfirePct ?? 0.35) : Number(choice.params?.pct ?? 0.15);
          const cost = contrabandValue(st) * pct;
          st = { ...st, credits: Math.max(0, st.credits - cost) };
          resultText = backfired ? 'The bribe backfired. That cost more than planned.' : 'Officer looks the other way.';
        } else {
          st = { ...st, cargo: dropContraband(st.cargo), xp: st.xp + Number(choice.params?.xp ?? 10) };
          resultText = 'Jettisoned the goods. Clean getaway.';
        }
        break;
      }
      case 'distress_call': {
        if (choice.id === 'respond') {
          st = { ...st, fuel: Math.max(0, st.fuel - Number(choice.params?.fuelCost ?? 1)) };
          const success = chance(sessionRng, Number(choice.successChance ?? 0.8));
          if (success) {
            const roll = sessionRng();
            if (roll < 0.4) {
              const bonus = Math.max(20, netWorth(st) * 0.03);
              st = { ...st, credits: st.credits + bonus };
              resultText = `Grateful survivors paid you ${formatSignedCredits(bonus)}.`;
            } else if (roll < 0.75) {
              const unlocked = allUnlockedGoods(st);
              const good = unlocked.length ? pick(sessionRng, unlocked) : GOODS[0];
              const qty = Math.min(randInt(sessionRng, 2, 5), maxHold(st) - usedHold(st));
              st = { ...st, cargo: addCargo(st.cargo, good.id, Math.max(0, qty), 0) };
              resultText = `They gave you ${qty}× ${good.name} in thanks.`;
            } else {
              st = { ...st, xp: st.xp + 40 };
              resultText = 'A strange story, and solid XP.';
            }
          } else {
            resultText = 'It was a recording. Creepy.';
          }
        } else {
          resultText = 'You keep flying. Not your problem.';
        }
        break;
      }
      case 'rich_collector': {
        if (choice.id === 'sell') {
          const goodId = String(choice.params?.goodId ?? 'earth_relics');
          const mult = Number(choice.params?.mult ?? 6);
          const owned = st.cargo[goodId]?.qty ?? 0;
          if (owned > 0) {
            const revenue = getPrice(st, st.currentStation, goodId) * mult * owned;
            const cargo = { ...st.cargo };
            delete cargo[goodId];
            st = { ...st, credits: st.credits + revenue, lifetimeEarnings: st.lifetimeEarnings + revenue, cargo };
            resultText = `Sold ${owned}× Earth Relics for ${formatSignedCredits(revenue)}! 💎`;
          } else {
            resultText = "You don't have any. Awkward.";
          }
        } else {
          resultText = "'Your loss,' they mutter.";
        }
        break;
      }
      case 'stowaway': {
        if (choice.id === 'hunt') {
          st = { ...st, xp: st.xp + Number(choice.params?.xp ?? 15) };
          resultText = 'Caught it. A very confused space rat.';
        } else {
          const goodId = String(choice.params?.goodId ?? 'protein_packs');
          const lossQty = Number(choice.params?.lossQty ?? 3);
          const owned = st.cargo[goodId]?.qty ?? 0;
          const newQty = Math.max(0, owned - lossQty);
          const cargo = { ...st.cargo };
          if (newQty <= 0) delete cargo[goodId];
          else cargo[goodId] = { ...cargo[goodId], qty: newQty };
          st = { ...st, cargo };
          resultText = `It ate ${Math.min(lossQty, owned)} units before you noticed.`;
        }
        break;
      }
    }

    if (def.id === 'pirate_toll') st = progressQuests(st, (q) => (q.kind === 'pirate_toll' ? { ...q, progress: q.goal } : q));
    st = applyXpAndRankUps(st);
    st = checkMilestones(st);
    return st;
  });

  emit({ type: 'sfx', id: 'event_card' });
  return { ok: true, text: resultText };
}

// ---------------------------------------------------------------------------
// The Yard: rigs & managers
// ---------------------------------------------------------------------------

export function buyRig(rigId: string, qty: number | 'max'): { ok: boolean; bought: number; spent: number } {
  const state = getState();
  const rig = RIGS_BY_ID[rigId];
  if (!rig) return { ok: false, bought: 0, spent: 0 };
  const owned = state.rigs[rigId]?.owned ?? 0;
  const affordable = maxAffordableRigQty(rig, owned, state.credits);
  const buyQty = qty === 'max' ? affordable : Math.max(0, Math.min(qty, affordable));
  if (buyQty <= 0) {
    emit({ type: 'sfx', id: 'cant_afford' });
    return { ok: false, bought: 0, spent: 0 };
  }
  const cost = rigBatchCost(rig, owned, buyQty);
  setState((s) => {
    let st: GameState = {
      ...s,
      credits: s.credits - cost,
      rigs: { ...s.rigs, [rigId]: { owned: owned + buyQty, managed: s.rigs[rigId]?.managed ?? false } },
    };
    st = progressQuests(st, (q) => (q.kind === 'buy_rig' ? { ...q, progress: Math.min(q.goal, q.progress + buyQty) } : q));
    return st;
  });
  emit({ type: 'sfx', id: 'buy' });
  emit({ type: 'haptic', pattern: 'tap' });
  return { ok: true, bought: buyQty, spent: cost };
}

export function hireManager(rigId: string): { ok: boolean; reason?: string } {
  const state = getState();
  const rig = RIGS_BY_ID[rigId];
  const r = state.rigs[rigId];
  if (!rig || !r || r.owned <= 0) return { ok: false, reason: 'Own at least 1 first.' };
  if (r.managed) return { ok: false, reason: 'Already managed.' };
  if (state.credits < rig.managerCost) return { ok: false, reason: 'Not enough credits.' };
  setState((s) => {
    let st: GameState = { ...s, credits: s.credits - rig.managerCost, rigs: { ...s.rigs, [rigId]: { ...s.rigs[rigId], managed: true } } };
    st = progressQuests(st, (q) => (q.kind === 'hire_manager' ? { ...q, progress: 1 } : q));
    return st;
  });
  emit({ type: 'toast', text: `${rig.managerName} is on the clock. It earns while you fly.`, icon: rig.icon });
  emit({ type: 'sfx', id: 'buy' });
  emit({ type: 'confetti', power: 'small' });
  if (rigId === 'vending_drones') maybeOfferInstall();
  return { ok: true };
}

export function tapRig(rigId: string): { ok: boolean; payout: number } {
  const state = getState();
  const rig = RIGS_BY_ID[rigId];
  const r = state.rigs[rigId];
  if (!rig || !r || r.owned <= 0 || r.managed) return { ok: false, payout: 0 };
  const t = now();
  const payout = rigTapPayout(state, rig, t);
  setState((s) => {
    let st: GameState = {
      ...s,
      credits: s.credits + payout,
      lifetimeEarnings: s.lifetimeEarnings + payout,
      stats: { ...s.stats, totalTaps: s.stats.totalTaps + 1 },
    };
    st = checkMilestones(st);
    return st;
  });
  emit({ type: 'sfx', id: 'tap' });
  emit({ type: 'haptic', pattern: 'tap' });
  emit({ type: 'floater', text: formatSignedCredits(payout), kind: 'profit' });
  return { ok: true, payout };
}

export function claimOfflineReport(): void {
  setState((s) => {
    let st: GameState = { ...s, pendingOfflineReport: null };
    st = progressQuests(st, (q) => (q.kind === 'claim_offline' ? { ...q, progress: 1 } : q));
    return st;
  });
  // Coin-cascade SFX plays on the modal's mount (synced to its count-up
  // animation) — see OfflineModal.tsx — so claiming just confirms quietly.
  emit({ type: 'confetti', power: 'small' });
}

export function useBoostToken(): { ok: boolean } {
  const state = getState();
  const t = now();
  if (state.boostTokens <= 0) return { ok: false };
  if (state.activeBoost && state.activeBoost.expiresAt > t) return { ok: false };
  setState((s) => ({ ...s, boostTokens: s.boostTokens - 1, activeBoost: { expiresAt: now() + BOOST_DURATION_MS } }));
  emit({ type: 'sfx', id: 'buy' });
  emit({ type: 'confetti', power: 'small' });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ship upgrades
// ---------------------------------------------------------------------------

export function buyShipUpgrade(upgradeId: string): { ok: boolean; reason?: string } {
  const state = getState();
  const def = SHIP_UPGRADES_BY_ID[upgradeId];
  if (!def) return { ok: false, reason: 'Unknown upgrade.' };
  const level = state.shipUpgrades[upgradeId] || 0;
  if (def.maxLevel != null && level >= def.maxLevel) return { ok: false, reason: 'Maxed out.' };
  const cost = upgradeCost(def, level);
  if (state.credits < cost) return { ok: false, reason: 'Not enough credits.' };
  setState((s) => ({ ...s, credits: s.credits - cost, shipUpgrades: { ...s.shipUpgrades, [upgradeId]: level + 1 } }));
  emit({ type: 'sfx', id: 'buy' });
  emit({ type: 'confetti', power: 'small' });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export function claimQuest(slotIndex: number): { ok: boolean } {
  const state = getState();
  const q = state.quests[slotIndex];
  if (!q || q.progress < q.goal) return { ok: false };
  setState((s) => {
    let st: GameState = {
      ...s,
      credits: s.credits + q.rewardCredits,
      xp: s.xp + q.rewardXp,
      boostTokens: s.boostTokens + (q.rewardBoost ? 1 : 0),
    };
    st = applyXpAndRankUps(st);
    const newQuest = generateQuest(q.size, st, sessionRng, st.questIdSeq);
    const quests = [...st.quests];
    quests[slotIndex] = newQuest;
    st = { ...st, quests, questIdSeq: st.questIdSeq + 1 };
    st = checkMilestones(st);
    return st;
  });
  emit({ type: 'sfx', id: 'quest_claim' });
  emit({ type: 'confetti', power: 'small' });
  emit({ type: 'haptic', pattern: 'tap' });
  emit({ type: 'floater', text: formatSignedCredits(q.rewardCredits), kind: 'profit' });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Daily streak
// ---------------------------------------------------------------------------

function dayKey(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function dailyRewardForDay(day: number, nw: number): { credits: number; xp: number; boost: boolean } {
  return { credits: Math.max(20, nw * 0.02 * day), xp: 10 * day, boost: day >= 5 };
}

export function canClaimDailyStreak(state: GameState): boolean {
  return state.dailyStreak.lastClaimDay !== dayKey(now());
}

export function claimDailyStreak(): { ok: boolean; reason?: string; day?: number } {
  const state = getState();
  const t = now();
  const today = dayKey(t);
  if (state.dailyStreak.lastClaimDay === today) return { ok: false, reason: 'Already claimed today.' };
  const yesterday = dayKey(t - 24 * 60 * 60 * 1000);

  let newCount: number;
  let usedShield = false;
  let shieldAvailable = state.dailyStreak.shieldAvailable;

  if (state.dailyStreak.lastClaimDay === null || state.dailyStreak.lastClaimDay === yesterday) {
    newCount = state.dailyStreak.lastClaimDay === null ? 1 : state.dailyStreak.count + 1;
  } else if (shieldAvailable) {
    newCount = state.dailyStreak.count + 1;
    usedShield = true;
    shieldAvailable = false;
  } else {
    newCount = 1;
  }

  const day = ((newCount - 1) % 7) + 1;
  const reward = dailyRewardForDay(day, netWorth(state));

  setState((s) => {
    let st: GameState = {
      ...s,
      credits: s.credits + reward.credits,
      xp: s.xp + reward.xp,
      boostTokens: s.boostTokens + (reward.boost ? 1 : 0),
      dailyStreak: { count: newCount, lastClaimDay: today, shieldAvailable: newCount % 7 === 0 ? true : shieldAvailable },
    };
    st = applyXpAndRankUps(st);
    return st;
  });

  emit({ type: 'sfx', id: 'quest_claim' });
  emit({ type: 'confetti', power: day === 7 ? 'big' : 'small' });
  if (usedShield) emit({ type: 'toast', text: 'Streak Shield used — we covered for you. Get back out there.', icon: '🛡️' });
  return { ok: true, day };
}

// ---------------------------------------------------------------------------
// Prestige: the Wormhole Run
// ---------------------------------------------------------------------------

export function canPrestige(state: GameState): boolean {
  return state.rank >= 25 || state.lifetimeEarnings >= 1e7;
}

export function prestigePreviewDM(state: GameState): number {
  return darkMatterFromLifetime(state.lifetimeEarnings);
}

export function prestige(): { ok: boolean; dmGained?: number } {
  const state = getState();
  if (!canPrestige(state)) return { ok: false };
  const dmGained = prestigePreviewDM(state);
  const keepClamp = (state.relics['keep_clamp'] || 0) > 0;
  const yardForeman = (state.relics['yard_foreman'] || 0) > 0;
  const headStartLvl = state.relics['head_start'] || 0;

  setState((s) => {
    const fresh = createInitialState();
    const rigs = { ...fresh.rigs };
    if (keepClamp) rigs['vending_drones'] = { owned: 1, managed: true };
    if (yardForeman) {
      for (const id of ['vending_drones', 'scrap_magnets', 'recycler_line']) {
        rigs[id] = { owned: Math.max(rigs[id]?.owned ?? 0, 1), managed: true };
      }
    }
    const startingCredits = fresh.credits + headStartLvl * 5000;
    const t = now();
    const merged: GameState = {
      ...fresh,
      createdAt: s.createdAt,
      runStartedAt: t,
      lastSeen: t,
      lastMarketPulseAt: t,
      lastAmbientEventAt: t,
      lastFuelUpdateAt: t,
      lastIdleSettleAt: t,
      credits: startingCredits,
      rigs,
      relics: s.relics,
      darkMatter: s.darkMatter + dmGained,
      milestones: s.milestones,
      codex: s.codex,
      bests: { ...s.bests, deepestSector: Math.max(s.bests.deepestSector, s.sector) },
      dailyStreak: s.dailyStreak,
      settings: s.settings,
      onboarding: s.onboarding,
      stats: { ...fresh.stats, totalPrestiges: s.stats.totalPrestiges + 1 },
      questIdSeq: s.questIdSeq,
    };
    return { ...merged, quests: generateFullRail(merged, sessionRng, s.questIdSeq) };
  });

  emit({ type: 'sfx', id: 'wormhole' });
  emit({ type: 'confetti', power: 'big' });
  emit({ type: 'haptic', pattern: 'rank_up' });
  return { ok: true, dmGained };
}

export function buyRelic(relicId: string): { ok: boolean; reason?: string } {
  const state = getState();
  const def = RELICS_BY_ID[relicId];
  if (!def) return { ok: false };
  const level = state.relics[relicId] || 0;
  const maxLvl = relicMaxLevel(def);
  if (maxLvl != null && level >= maxLvl) return { ok: false, reason: 'Maxed out.' };
  const cost = relicCost(def, level);
  if (state.darkMatter < cost) return { ok: false, reason: 'Not enough Dark Matter.' };
  setState((s) => ({ ...s, darkMatter: s.darkMatter - cost, relics: { ...s.relics, [relicId]: level + 1 } }));
  emit({ type: 'sfx', id: 'buy' });
  emit({ type: 'confetti', power: 'small' });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sectors
// ---------------------------------------------------------------------------

export function canEnterNextSector(state: GameState): boolean {
  return state.rank >= sectorUnlockRank(state.sector + 1);
}

export function nextSectorToll(state: GameState): number {
  return gateToll(state.sector + 1) * (1 - tollDiscount(state));
}

export function payGateToll(): { ok: boolean; reason?: string } {
  const state = getState();
  const dest = state.sector + 1;
  if (!canEnterNextSector(state)) return { ok: false, reason: `Unlocks at Rank ${sectorUnlockRank(dest)}.` };
  const toll = nextSectorToll(state);
  if (state.credits < toll) return { ok: false, reason: 'Not enough credits.' };
  setState((s) => {
    const newGoods = generateSectorGoods(dest);
    const waves = { ...s.waves };
    for (const g of newGoods) if (!waves[g.id]) waves[g.id] = initWave();
    return {
      ...s,
      credits: s.credits - toll,
      sector: dest,
      maxSectorReached: Math.max(s.maxSectorReached, dest),
      waves,
      bests: { ...s.bests, deepestSector: Math.max(s.bests.deepestSector, dest) },
    };
  });
  emit({ type: 'sfx', id: 'toll' });
  emit({ type: 'confetti', power: 'big' });
  emit({ type: 'toast', text: `SECTOR ${dest} — everything's about to get expensive.`, icon: '🌌' });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export function setOnboardingStep(step: number): void {
  setState((s) => ({ ...s, onboarding: { ...s.onboarding, step } }));
}

export function completeOnboarding(skipped = false): void {
  setState((s) => ({ ...s, onboarding: { step: 99, complete: true, skipped } }));
}

export { codexBonusMult, globalIncomeMult, rigUnitCost };
