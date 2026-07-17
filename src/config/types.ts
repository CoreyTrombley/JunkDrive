export type Volatility = 'calm' | 'choppy' | 'wild';
export type Overlay = 'dust' | 'scanlines' | 'frost' | 'spores' | 'embers' | 'sparkle' | 'glitch';
export type Ambience = 'thrum' | 'plink' | 'bell' | 'pad' | 'stab' | 'arp' | 'drone';

export interface Good {
  id: string;
  name: string;
  icon: string;
  tier: number;
  unlockRank: number;
  base: number;
  mass: number; // tons per unit — tonnage hold currency (spec 2026-07-16)
  volatility: Volatility;
  contraband?: boolean;
  flavor?: string;
}

export interface StationTheme {
  bg: string;
  surface: string;
  accent: string;
  accent2: string;
  text: string;
  glow: string;
  particleHue: number;
  overlay: Overlay;
  motif: number[];
  ambienceType: Ambience;
}

export interface Station {
  id: string;
  name: string;
  icon: string;
  unlockRank: number;
  scanChance: number;
  minGoodTier: number; // stations only stock goods at/above this tier (Signal = 4)
  bias: Record<string, number>;
  theme: StationTheme;
  isGate?: boolean;
  blurb: string;
}

export interface Rig {
  id: string;
  name: string;
  icon: string;
  order: number;
  baseCost: number;
  costGrowth: number;
  cycleSec: number;
  basePayout: number;
  managerName: string;
  managerCost: number;
  managerBlurb: string;
}

export interface MarketEventDef {
  id: string;
  kind: 'spike' | 'glut' | 'flare' | 'crash' | 'festival' | 'embargo';
  name: string;
  copyTemplate: string;
  icon: string;
  minMult: number;
  maxMult: number;
  scope: 'single' | 'all-goods-one-station' | 'sector-wide-good' | 'multi-good';
  goodCount: number;
  disables?: boolean;
  minDurationMs: number;
  maxDurationMs: number;
  weight: number;
}

export interface EncounterChoiceDef {
  id: string;
  label: string;
  successChance?: number;
  params?: Record<string, number | string>;
}

export interface EncounterDef {
  id: string;
  name: string;
  icon: string;
  copy: string;
  requiresContraband?: boolean;
  requiresGood?: string;
  weight: number;
  choices: EncounterChoiceDef[];
}

export interface JackpotDef {
  id: string;
  name: string;
  icon: string;
  copy: string;
}

export interface RelicDef {
  id: string;
  name: string;
  icon: string;
  effectLabel: string;
  costs: number[]; // explicit cost per level; last level repeats via growth if infinite
  infinite?: boolean;
  growth?: number; // used when infinite, continuing past costs[]
}

export interface ShipUpgradeDef {
  id: string;
  name: string;
  icon: string;
  effectLabel: (level: number) => string;
  costs?: number[]; // explicit (e.g. Market Scanner tiers)
  baseCost?: number;
  costGrowth?: number;
  maxLevel: number | null;
}

export type QuestKind =
  | 'flip_units'
  | 'bank_sale'
  | 'visit_station'
  | 'hot_streak'
  | 'pirate_toll'
  | 'buy_rig'
  | 'hire_manager'
  | 'claim_offline'
  | 'lucky_flip'
  | 'codex_set'
  | 'jump_n'
  | 'deliver_manifest';

export type QuestSize = 'tiny' | 'medium' | 'session';

export interface QuestDef {
  kind: QuestKind;
  size: QuestSize;
  label: string; // may contain {n} / {good} / {station} tokens
}
