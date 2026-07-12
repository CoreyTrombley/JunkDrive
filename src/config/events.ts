import type { EncounterDef, JackpotDef, MarketEventDef } from './types';

// Market events — spec §6.1.
export const MARKET_EVENTS: MarketEventDef[] = [
  {
    id: 'demand_spike', kind: 'spike', name: 'DEMAND SPIKE', icon: '📈',
    copyTemplate: '{station} IS BUYING — {good} ×{mult} 🔥',
    minMult: 3, maxMult: 5, scope: 'single', goodCount: 1,
    minDurationMs: 8 * 60_000, maxDurationMs: 20 * 60_000, weight: 26,
  },
  {
    id: 'supply_glut', kind: 'glut', name: 'SUPPLY GLUT', icon: '📉',
    copyTemplate: '{good} avalanche at {station} — prices gutted.',
    minMult: 0.2, maxMult: 0.4, scope: 'single', goodCount: 1,
    minDurationMs: 8 * 60_000, maxDurationMs: 20 * 60_000, weight: 22,
  },
  {
    id: 'solar_flare', kind: 'flare', name: 'SOLAR FLARE', icon: '🌞',
    copyTemplate: 'Flare fried the grid — {good} ×{mult} sector-wide 🌞',
    minMult: 3, maxMult: 4, scope: 'sector-wide-good', goodCount: 1,
    minDurationMs: 5 * 60_000, maxDurationMs: 10 * 60_000, weight: 12,
  },
  {
    id: 'market_crash', kind: 'crash', name: 'MARKET CRASH', icon: '💥',
    copyTemplate: 'Panic at {station}. Everything is on sale.',
    minMult: 0.5, maxMult: 0.7, scope: 'all-goods-one-station', goodCount: 0,
    minDurationMs: 5 * 60_000, maxDurationMs: 12 * 60_000, weight: 14,
  },
  {
    id: 'festival', kind: 'festival', name: 'FESTIVAL', icon: '🎉',
    copyTemplate: 'Festival at {station}! Buying {good} ×{mult} 🎉',
    minMult: 2, maxMult: 3, scope: 'multi-good', goodCount: 2,
    minDurationMs: 10 * 60_000, maxDurationMs: 30 * 60_000, weight: 14,
  },
  {
    id: 'embargo', kind: 'embargo', name: 'EMBARGO', icon: '🚫',
    copyTemplate: '{station} locked down. No {good} sales.',
    minMult: 1, maxMult: 1, scope: 'single', goodCount: 1, disables: true,
    minDurationMs: 5 * 60_000, maxDurationMs: 15 * 60_000, weight: 12,
  },
];

export const MARKET_EVENTS_BY_ID: Record<string, MarketEventDef> = Object.fromEntries(
  MARKET_EVENTS.map((e) => [e.id, e])
);

// Encounter cards — spec §6.2. Effects are resolved by bespoke logic in
// engine/actions.ts keyed on (encounter id, choice id); the params below are
// the tunable numbers that logic reads.
export const ENCOUNTERS: EncounterDef[] = [
  {
    id: 'pirate_toll', name: 'PIRATE TOLL', icon: '🏴‍☠️', weight: 20,
    copy: "The Rustfang Gang wants a cut. 'Nice cargo. Shame if it drifted.'",
    choices: [
      { id: 'pay', label: 'Pay 10% of cargo value', params: { pct: 0.1 } },
      { id: 'run', label: 'Run for it', successChance: 0.5, params: { xpOnEscape: 30, lossPctOnFail: 0.3 } },
    ],
  },
  {
    id: 'derelict', name: 'DERELICT', icon: '✨', weight: 20,
    copy: 'A dead freighter, cargo doors ajar. Too easy?',
    choices: [
      { id: 'board', label: 'Board it', successChance: 0.7, params: { gainMinQty: 2, gainMaxQty: 6, fuelLossOnFail: 1 } },
      { id: 'flypast', label: 'Fly past', params: { xp: 5 } },
    ],
  },
  {
    id: 'wandering_trader', name: 'WANDERING TRADER', icon: '🤝', weight: 18,
    copy: "'One-time deal, friend.'",
    choices: [
      { id: 'deal', label: 'Hear the deal', params: { minPct: 0.55, maxPct: 0.75, goodOdds: 0.8 } },
      { id: 'pass', label: 'Pass' },
    ],
  },
  {
    id: 'customs_scan', name: 'CUSTOMS SCAN', icon: '🚨', weight: 0, requiresContraband: true,
    copy: "'Routine inspection. Open the hold.'",
    choices: [
      { id: 'payfine', label: 'Pay the fine', params: { pct: 0.4 } },
      { id: 'bribe', label: 'Bribe the officer', params: { pct: 0.15, backfireChance: 0.25, backfirePct: 0.35 } },
      { id: 'jettison', label: 'Jettison it', params: { xp: 10 } },
    ],
  },
  {
    id: 'distress_call', name: 'DISTRESS CALL', icon: '📻', weight: 14,
    copy: "Weak signal: '…anyone…'",
    choices: [
      { id: 'respond', label: 'Respond', successChance: 0.8, params: { fuelCost: 1 } },
      { id: 'ignore', label: 'Ignore' },
    ],
  },
  {
    id: 'rich_collector', name: 'RICH COLLECTOR', icon: '💎', weight: 10, requiresGood: 'earth_relics',
    copy: "'I MUST have Earth Relics. Name your price.'",
    choices: [
      { id: 'sell', label: 'Sell now at ×6', params: { mult: 6, goodId: 'earth_relics' } },
      { id: 'decline', label: 'Decline' },
    ],
  },
  {
    id: 'stowaway', name: 'STOWAWAY', icon: '🐀', weight: 14,
    copy: "Something's eating the Protein Packs.",
    choices: [
      { id: 'hunt', label: 'Hunt it down', params: { xp: 15 } },
      { id: 'ignoreit', label: 'Ignore it', params: { lossQty: 3, goodId: 'protein_packs' } },
    ],
  },
];

export const ENCOUNTERS_BY_ID: Record<string, EncounterDef> = Object.fromEntries(
  ENCOUNTERS.map((e) => [e.id, e])
);

// Jackpots — spec §6.3.
export const JACKPOTS: JackpotDef[] = [
  { id: 'motherlode', name: 'MOTHERLODE', icon: '🌟', copy: 'A pristine derelict. Hold FULL.' },
  { id: 'golden_buyer', name: 'GOLDEN BUYER', icon: '👑', copy: 'An eccentric trillionaire is docked HERE for 60 seconds.' },
  { id: 'wormhole_echo', name: 'WORMHOLE ECHO', icon: '🕳️', copy: 'The void winks at you.' },
  { id: 'ghost_frequency', name: 'GHOST FREQUENCY', icon: '👻', copy: "You shouldn't have heard that." },
];

export const JACKPOTS_BY_ID: Record<string, JackpotDef> = Object.fromEntries(JACKPOTS.map((j) => [j.id, j]));

// Arrival roll table — spec §6.
export const ARRIVAL_ROLL_WEIGHTS = {
  clean: 38,
  market_event: 30,
  encounter: 22,
  petty_salvage: 6,
  hq_ping: 3,
  jackpot: 1,
};
