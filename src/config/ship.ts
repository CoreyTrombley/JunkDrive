import type { ShipUpgradeDef } from './types';

// Dry Dock upgrades — spec §8.
export const SHIP_UPGRADES: ShipUpgradeDef[] = [
  {
    id: 'cargo_hold',
    name: 'Cargo Hold',
    icon: '📦',
    effectLabel: (lvl) => `+${lvl * 2} hold (currently +${lvl * 2})`,
    baseCost: 800,
    costGrowth: 1.9,
    maxLevel: null,
  },
  {
    id: 'fuel_tank',
    name: 'Fuel Tank',
    icon: '⛽',
    effectLabel: (lvl) => `+${lvl} max fuel`,
    baseCost: 2_500,
    costGrowth: 2.2,
    maxLevel: 12,
  },
  {
    id: 'fuel_recycler',
    name: 'Fuel Recycler',
    icon: '♻️',
    effectLabel: (lvl) => `Regen ${90 - lvl * 9}s / pip`,
    baseCost: 5_000,
    costGrowth: 3,
    maxLevel: 5,
  },
  {
    id: 'market_scanner',
    name: 'Market Scanner',
    icon: '📡',
    effectLabel: (lvl) => ['Locked', 'Live prices at 1 pinned station', 'Live prices everywhere', 'Best-route hint glows on Map'][lvl] ?? 'Maxed',
    costs: [3_000, 40_000, 500_000],
    maxLevel: 3,
  },
  {
    id: 'smuggler_panels',
    name: 'Smuggler Panels',
    icon: '🕳️',
    effectLabel: (lvl) => `-${lvl * 3}% contraband scan chance`,
    baseCost: 10_000,
    costGrowth: 2.5,
    maxLevel: 5,
  },
  {
    id: 'jump_drive',
    name: 'Jump Drive',
    icon: '⚡',
    effectLabel: (lvl) => `Travel ${Math.max(2, 4 - lvl)}s, gate tolls -${lvl * 10}%`,
    baseCost: 25_000,
    costGrowth: 4,
    maxLevel: 3,
  },
];

export const SHIP_UPGRADES_BY_ID: Record<string, ShipUpgradeDef> = Object.fromEntries(
  SHIP_UPGRADES.map((u) => [u.id, u])
);

export function upgradeCost(def: ShipUpgradeDef, currentLevel: number): number {
  if (def.costs) {
    if (currentLevel >= def.costs.length) return Infinity;
    return def.costs[currentLevel];
  }
  const base = def.baseCost ?? 100;
  const growth = def.costGrowth ?? 2;
  return Math.round(base * Math.pow(growth, currentLevel));
}
