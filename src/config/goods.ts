import type { Good } from './types';

// Canonical Sector-1 goods catalog — spec §5.1. Sectors 2+ layer on procedurally
// generated goods (see engine/sectorgen.ts) using the same shape.
export const GOODS: Good[] = [
  { id: 'scrap_metal', name: 'Scrap Metal', icon: '⚙️', tier: 1, unlockRank: 1, base: 10, mass: 60, volatility: 'calm' },
  { id: 'water_ice', name: 'Water Ice', icon: '🧊', tier: 1, unlockRank: 1, base: 14, mass: 45, volatility: 'calm' },
  { id: 'protein_packs', name: 'Protein Packs', icon: '🍱', tier: 1, unlockRank: 1, base: 22, mass: 30, volatility: 'calm' },
  { id: 'hull_plates', name: 'Hull Plates', icon: '🛡️', tier: 1, unlockRank: 1, base: 35, mass: 75, volatility: 'calm' },

  { id: 'copper_coil', name: 'Copper Coil', icon: '➿', tier: 2, unlockRank: 2, base: 60, mass: 45, volatility: 'calm' },
  { id: 'coolant', name: 'Coolant', icon: '🧪', tier: 2, unlockRank: 2, base: 90, mass: 37.5, volatility: 'choppy' },
  { id: 'fuel_rods', name: 'Fuel Rods', icon: '🔋', tier: 2, unlockRank: 3, base: 120, mass: 45, volatility: 'choppy' },
  { id: 'spore_crates', name: 'Spore Crates', icon: '🍄', tier: 2, unlockRank: 3, base: 150, mass: 22.5, volatility: 'choppy', flavor: 'Halo Court pays through the nose for these.' },

  { id: 'med_gel', name: 'Med-Gel', icon: '💊', tier: 3, unlockRank: 4, base: 320, mass: 15, volatility: 'choppy' },
  { id: 'machine_parts', name: 'Machine Parts', icon: '🦾', tier: 3, unlockRank: 4, base: 450, mass: 37.5, volatility: 'choppy' },
  { id: 'circuit_bundles', name: 'Circuit Bundles', icon: '💾', tier: 3, unlockRank: 5, base: 600, mass: 12, volatility: 'wild' },
  { id: 'earth_relics', name: 'Earth Relics', icon: '📀', tier: 3, unlockRank: 6, base: 900, mass: 9, volatility: 'wild', flavor: 'Vintage vinyl. Priceless out here.' },

  { id: 'alien_ceramics', name: 'Alien Ceramics', icon: '🏺', tier: 4, unlockRank: 8, base: 3000, mass: 18, volatility: 'choppy' },
  { id: 'banned_ai_chips', name: 'Banned AI Chips', icon: '🧠', tier: 4, unlockRank: 8, base: 4000, mass: 6, volatility: 'wild', contraband: true },
  { id: 'warp_cells', name: 'Warp Cells', icon: '⚡', tier: 4, unlockRank: 9, base: 6500, mass: 12, volatility: 'wild' },
  { id: 'neutrino_lenses', name: 'Neutrino Lenses', icon: '🔍', tier: 4, unlockRank: 10, base: 9000, mass: 7.5, volatility: 'choppy' },

  { id: 'alien_artifacts', name: 'Alien Artifacts', icon: '👁️', tier: 5, unlockRank: 15, base: 45000, mass: 9, volatility: 'wild', contraband: true },
  { id: 'cryo_megafauna', name: 'Cryo Megafauna', icon: '🦖', tier: 5, unlockRank: 15, base: 60000, mass: 30, volatility: 'choppy', flavor: "It's asleep. Probably." },
  { id: 'antimatter_vials', name: 'Antimatter Vials', icon: '⚛️', tier: 5, unlockRank: 17, base: 90000, mass: 4.5, volatility: 'wild' },
  { id: 'singularity_shards', name: 'Singularity Shards', icon: '💠', tier: 5, unlockRank: 19, base: 140000, mass: 4, volatility: 'wild' },

  { id: 'dark_relics', name: 'Dark Relics', icon: '🕳️', tier: 6, unlockRank: 22, base: 500000, mass: 4.5, volatility: 'wild', contraband: true },
  { id: 'stellar_cores', name: 'Stellar Cores', icon: '☀️', tier: 6, unlockRank: 24, base: 900000, mass: 15, volatility: 'choppy' },
  { id: 'ghost_ships', name: 'Ghost Ships', icon: '👻', tier: 6, unlockRank: 26, base: 1500000, mass: 45, volatility: 'wild', flavor: "Yes, you fit ships in your ship. Don't ask." },
  { id: 'time_crystals', name: 'Time Crystals', icon: '⏳', tier: 6, unlockRank: 28, base: 2500000, mass: 2.5, volatility: 'wild' },
];

export const GOODS_BY_ID: Record<string, Good> = Object.fromEntries(GOODS.map((g) => [g.id, g]));

export function goodsUnlockedAt(rank: number): Good[] {
  return GOODS.filter((g) => g.unlockRank <= rank);
}
