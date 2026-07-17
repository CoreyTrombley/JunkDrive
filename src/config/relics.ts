import type { RelicDef } from './types';

// Wormhole relic tree, spent with Dark Matter — spec §11.1.
export const RELICS: RelicDef[] = [
  { id: 'head_start', name: 'Head Start', icon: '💼', effectLabel: 'Start each run with ₡5K × 2^level', costs: [10], infinite: true, growth: 2 },
  { id: 'keep_clamp', name: 'Keep CLAMP', icon: '🤖', effectLabel: "Rig 1's manager survives prestige", costs: [25] },
  { id: 'yard_foreman', name: 'Yard Foreman', icon: '👷', effectLabel: 'Rigs 1-3 auto-managed on reset', costs: [100] },
  { id: 'bigger_bones', name: 'Bigger Bones', icon: '📦', effectLabel: '+8t base hold, doubling each level (+8, +16, +32…)', costs: [30], infinite: true, growth: 2 },
  { id: 'deep_tank', name: 'Deep Tank', icon: '⛽', effectLabel: '+2 base max fuel', costs: [35] },
  { id: 'long_haul', name: 'Long Haul', icon: '🌙', effectLabel: 'Offline cap 6h / 12h / 24h', costs: [50, 150, 400] },
  { id: 'lucky_charm', name: 'Lucky Charm', icon: '🍀', effectLabel: 'LUCKY FLIP chance 8% / 12%', costs: [40, 120] },
  { id: 'fast_learner', name: 'Fast Learner', icon: '🧠', effectLabel: '+10% XP × level', costs: [45], infinite: true, growth: 2 },
  { id: 'golden_rolodex', name: 'Golden Rolodex', icon: '🤝', effectLabel: 'Wandering Trader deals always ≤60% avg', costs: [60] },
  { id: 'warm_engines', name: 'Warm Engines', icon: '🔥', effectLabel: 'Travel 2s + SKIP from Rank 1', costs: [55] },
  { id: 'gate_crasher', name: 'Gate Crasher', icon: '🚪', effectLabel: 'Sector tolls -25% / -40%', costs: [80, 240] },
  { id: 'event_magnet', name: 'Event Magnet', icon: '🧲', effectLabel: 'Event chance on jump 62% → 70%', costs: [90] },
];

export const RELICS_BY_ID: Record<string, RelicDef> = Object.fromEntries(RELICS.map((r) => [r.id, r]));

export function relicCost(def: RelicDef, currentLevel: number): number {
  if (currentLevel < def.costs.length) return def.costs[currentLevel];
  if (def.infinite && def.growth) {
    const last = def.costs[def.costs.length - 1];
    const extra = currentLevel - (def.costs.length - 1);
    return Math.round(last * Math.pow(def.growth, extra));
  }
  return Infinity;
}

export function relicMaxLevel(def: RelicDef): number | null {
  return def.infinite ? null : def.costs.length;
}
