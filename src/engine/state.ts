import { STATIONS } from '../config/stations';
import { GOODS } from '../config/goods';
import { RIGS } from '../config/rigs';
import type { ActiveMarketEvent, WaveState } from './price';
import { initWave, fastForwardWave } from './price';
import { mulberry32, hashSeed } from './rng';
import type { QuestKind, QuestSize } from '../config/types';
import { SCHEMA_VERSION } from './save';
import type { MarketSort, MarketFilters } from './marketview';
import type { Manifest } from './manifests';

export const BASE_HOLD_TONS = 20;
export const BASE_MAX_FUEL = 5;
export const BASE_FUEL_REGEN_SEC = 75;
export const STARTING_CREDITS = 500;
export const STARTING_STATION = 'rust_harbor';

export interface CargoEntry {
  qty: number;
  avgCost: number;
}

export interface RigState {
  owned: number;
  managed: boolean;
}

export interface HotStreakState {
  count: number;
  expiresAt: number;
}

export interface ActiveBoost {
  expiresAt: number;
}

export interface Quest {
  id: string;
  kind: QuestKind;
  size: QuestSize;
  label: string;
  goal: number;
  progress: number;
  rewardCredits: number;
  rewardXp: number;
  rewardBoost: boolean;
  goodId?: string;
  stationId?: string;
}

export interface DailyStreakState {
  count: number;
  lastClaimDay: string | null;
  shieldAvailable: boolean;
}

export interface PersonalBests {
  bestFlipMargin: number;
  biggestSale: number;
  deepestSector: number;
  fastestMillionMs: number | null;
}

export interface CodexState {
  goods: Record<string, boolean>;
  stations: Record<string, boolean>;
  jackpots: Record<string, boolean>;
  encounters: Record<string, boolean>;
  events: Record<string, boolean>;
}

export interface Settings {
  chillMode: boolean;
  reducedMotion: boolean;
  sfxVolume: number;
  ambienceVolume: number;
  musicVolume: number;
  haptics: boolean;
  muted: boolean;
  marketSort: MarketSort;
  marketFilters: MarketFilters;
}

export interface PendingEncounter {
  encounterId: string;
  rolledAt: number;
}

export interface PendingOfflineReport {
  amount: number;
  elapsedMs: number;
  capped: boolean;
}

export interface JackpotCelebration {
  jackpotId: string;
  triggeredAt: number;
  stationId: string;
}

export interface GameState {
  schemaVersion: number;
  createdAt: number;
  runStartedAt: number; // resets on prestige; drives "fastest ₡1M" personal best
  lastSeen: number;
  lastMarketPulseAt: number;
  lastAmbientEventAt: number;
  lastFuelUpdateAt: number;
  lastIdleSettleAt: number;

  credits: number;
  lifetimeEarnings: number;
  rank: number;
  xp: number;
  fuel: number;
  currentStation: string;
  sector: number;
  maxSectorReached: number;

  cargo: Record<string, CargoEntry>;
  shipUpgrades: Record<string, number>;
  rigs: Record<string, RigState>;
  relics: Record<string, number>;
  darkMatter: number;

  hotStreak: HotStreakState;
  activeBoost: ActiveBoost | null;
  boostTokens: number;

  quests: Quest[];
  dailyStreak: DailyStreakState;
  milestones: number[];
  codex: CodexState;
  bests: PersonalBests;

  waves: Record<string, WaveState>;
  activeEvents: ActiveMarketEvent[];
  pendingEncounter: PendingEncounter | null;
  pendingOfflineReport: PendingOfflineReport | null;
  pendingJackpot: JackpotCelebration | null;

  extraSectorGoods: Record<number, string[]>; // sector -> good ids generated for it

  /** Sparse per-station stock levels; missing entry = baseline (see engine/stocks.ts). */
  stocks: Record<string, Record<string, number>>;

  manifests: Manifest[];
  manifestSeq: number;

  settings: Settings;
  onboarding: { step: number; complete: boolean; skipped: boolean };
  stats: {
    totalJumps: number; totalSales: number; totalTaps: number; totalPrestiges: number;
    goodsSold: Record<string, number>; goodsBought: Record<string, number>;
    creditsSpent: number; creditsEarned: number;
    activePlayMs: number;
  };

  questIdSeq: number;

  /** Per-run seed for procedural goods/routes. 0 = legacy save (pre-seed behavior). */
  runSeed: number;
}

export function newRunSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}

export function createInitialState(): GameState {
  const now = Date.now();
  const runSeed = newRunSeed();
  const waves: Record<string, WaveState> = {};
  for (const g of GOODS) {
    const w = initWave();
    // Pre-churn so a new run's market opens mid-motion instead of perfectly flat.
    const rng = mulberry32((hashSeed(g.id) ^ runSeed) >>> 0);
    fastForwardWave(w, g.volatility, 8 + Math.floor(rng() * 8), rng);
    waves[g.id] = w;
  }

  const rigs: Record<string, RigState> = {};
  for (const r of RIGS) rigs[r.id] = { owned: 0, managed: false };

  const codex: CodexState = { goods: {}, stations: {}, jackpots: {}, encounters: {}, events: {} };
  codex.stations[STARTING_STATION] = true;

  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    runStartedAt: now,
    lastSeen: now,
    lastMarketPulseAt: now,
    lastAmbientEventAt: now,
    lastFuelUpdateAt: now,
    lastIdleSettleAt: now,

    credits: STARTING_CREDITS,
    lifetimeEarnings: 0,
    rank: 1,
    xp: 0,
    fuel: BASE_MAX_FUEL,
    currentStation: STARTING_STATION,
    sector: 1,
    maxSectorReached: 1,

    cargo: {},
    shipUpgrades: {},
    rigs,
    relics: {},
    darkMatter: 0,

    hotStreak: { count: 0, expiresAt: 0 },
    activeBoost: null,
    boostTokens: 0,

    quests: [],
    dailyStreak: { count: 0, lastClaimDay: null, shieldAvailable: true },
    milestones: [],
    codex,
    bests: { bestFlipMargin: 0, biggestSale: 0, deepestSector: 1, fastestMillionMs: null },

    waves,
    activeEvents: [],
    pendingEncounter: null,
    pendingOfflineReport: null,
    pendingJackpot: null,

    extraSectorGoods: {},

    stocks: {},

    manifests: [],
    manifestSeq: 1,

    settings: {
      chillMode: false,
      reducedMotion: false,
      sfxVolume: 0.7,
      ambienceVolume: 0.2,
      musicVolume: 0.2,
      haptics: true,
      muted: false,
      marketSort: 'default',
      marketFilters: { owned: false, affordable: false, hideContraband: false, tier: null },
    },
    onboarding: { step: 0, complete: false, skipped: false },
    stats: {
      totalJumps: 0, totalSales: 0, totalTaps: 0, totalPrestiges: 0,
      goodsSold: {}, goodsBought: {}, creditsSpent: 0, creditsEarned: 0,
      activePlayMs: 0,
    },

    questIdSeq: 1,

    runSeed,
  };
}

export function allStationIds(): string[] {
  return STATIONS.map((s) => s.id);
}
