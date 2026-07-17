import type { Good, Volatility } from '../config/types';
import { mulberry32, hashSeed, pick, randRange, chance } from './rng';
import { STATIONS_BY_ID } from '../config/stations';

// Procedural sector content — spec §16.4. Sector 1 is the hand-authored
// catalog (config/goods.ts, config/stations.ts). Sector N>=2 keeps the same
// 7 station archetypes (renamed + hue-shifted, cheap but effective) and adds
// 4 new goods per sector so there's always a fresh route to discover.

const MATERIAL_POOL = [
  'Ionized', 'Cracked', 'Fused', 'Molten', 'Void-Touched', 'Quantum', 'Prismatic', 'Corroded',
  'Gravitic', 'Phase-Shifted', 'Irradiated', 'Crystalline', 'Synthetic', 'Ancient', 'Feral', 'Null',
];
const FORM_POOL = [
  'Slag Cores', 'Coils', 'Husks', 'Spores', 'Shards', 'Capacitors', 'Ingots', 'Vials',
  'Filaments', 'Lattices', 'Cinders', 'Nodes', 'Husks', 'Plating', 'Threads', 'Kernels',
];
const TIER_ICON_POOLS = [
  ['🔩', '⚙️', '🧱', '🪨', '🛢️', '📦'],
  ['🔮', '💠', '🧪', '🪙', '🎛️', '🧿'],
  ['🧬', '🦠', '💎', '🧫', '⚗️', '🪬'],
  ['🛰️', '☄️', '🌠', '🪐', '⚛️', '🌌'],
];

const STATION_PREFIX = ['CINDER', 'GLACIER', 'RUSTED', 'GILDED', 'HOLLOW', 'FERAL', 'STATIC', 'DRIFTING', 'BROKEN', 'SILENT'];
const STATION_SUFFIX = ['FORGE', 'DOCK', 'WORKS', 'PIT', 'REACH', 'HOLD', 'YARD', 'SPIRE', 'BELT', 'GATE'];

export function sectorSeed(sector: number, runSeed: number): number {
  return (hashSeed(`junkrun-sector-${sector}`) ^ (runSeed >>> 0)) >>> 0;
}

/** 4 new goods introduced when entering `sector` (sector >= 2), one per tier band. */
export function generateSectorGoods(sector: number, runSeed: number): Good[] {
  const rng = mulberry32(sectorSeed(sector, runSeed));
  const goods: Good[] = [];
  const volatilities: Volatility[] = ['calm', 'choppy', 'wild', 'wild'];
  for (let band = 0; band < 4; band++) {
    const material = pick(rng, MATERIAL_POOL);
    const form = pick(rng, FORM_POOL);
    const name = `${material} ${form}`;
    const tier = band + 1 + (sector - 1) * 0; // goods scale via sectorScale(), tier just drives unlock rank pacing
    const unlockRank = sectorUnlockRankForGood(sector, band);
    const bandMass = [60, 37.5, 15, 6][band];
    // Mass rolls from a per-good side rng — NEVER the main `rng` stream, which
    // must keep emitting the exact legacy sequence for runSeed 0 saves.
    const massRng = mulberry32((hashSeed(`s${sector}_g${band}-mass`) ^ (runSeed >>> 0)) >>> 0);
    const mass = Math.round(bandMass * randRange(massRng, 0.7, 1.3) * 100) / 100;
    // Icon rolls from its own side rng — same isolation rule as the mass roll:
    // the main `rng` stream must keep emitting the exact legacy sequence.
    const iconRng = mulberry32((hashSeed(`s${sector}_g${band}-icon`) ^ (runSeed >>> 0)) >>> 0);
    const icon = TIER_ICON_POOLS[band][Math.floor(iconRng() * TIER_ICON_POOLS[band].length)];
    const anchor = [50, 400, 3000, 40000][band];
    const base = Math.round(anchor * randRange(rng, 0.7, 1.4));
    goods.push({
      id: `s${sector}_g${band}`,
      name,
      icon,
      tier: tier + 2, // keep above sector-1 tiers for sorting/display purposes
      unlockRank,
      base,
      mass,
      volatility: volatilities[band],
      contraband: chance(rng, 0.15),
    });
  }
  return goods;
}

function sectorUnlockRankForGood(sector: number, band: number): number {
  // The rank ladder for goods ends where the gate rank ladder ends (S10 → rank 100);
  // past S10 the real gate is REACHING the sector at all (goodsCatalogForState is
  // bounded by maxSectorReached). Without this cap, normalized ranks (~127 at S99)
  // could never unlock deep-sector goods.
  const sectorBaseRank = Math.min(20 + (sector - 2) * 10, 100);
  return sectorBaseRank + band * 2;
}

export interface SectorStationDressing {
  name: string;
  hueShift: number;
}

/** Cheap-but-effective per-sector reskin: new name + palette hue-rotation, same archetype. */
export function dressStationForSector(baseStationId: string, sector: number, runSeed: number): SectorStationDressing {
  if (sector <= 1) return { name: '', hueShift: 0 };
  const rng = mulberry32((hashSeed(`${baseStationId}-sector-${sector}`) ^ (runSeed >>> 0)) >>> 0);
  const prefix = pick(rng, STATION_PREFIX);
  const suffix = pick(rng, STATION_SUFFIX);
  const hueShift = Math.round(randRange(rng, 20, 340));
  return { name: `${prefix} ${suffix}`, hueShift };
}

/** Canonical user-facing station name: hand-authored in sector 1, per-sector
 *  dressing beyond — every UI surface must use this, not `station.name`. */
export function stationDisplayName(stationId: string, sector: number, runSeed: number): string {
  const dressed = dressStationForSector(stationId, sector, runSeed);
  return dressed.name || STATIONS_BY_ID[stationId]?.name || stationId;
}

/** Re-rolled bias for sector-N goods across the 7 stations — new best routes every sector. */
export function generateSectorBias(stationIds: string[], goods: Good[], sector: number, runSeed: number): Record<string, Record<string, number>> {
  const rng = mulberry32((hashSeed(`bias-sector-${sector}`) ^ (runSeed >>> 0)) >>> 0);
  const bias: Record<string, Record<string, number>> = {};
  for (const st of stationIds) bias[st] = {};
  for (const good of goods) {
    const exporter = pick(rng, stationIds);
    for (const st of stationIds) {
      if (st === exporter) {
        bias[st][good.id] = randRange(rng, 0.50, 0.65);
      } else if (chance(rng, 0.4)) {
        bias[st][good.id] = randRange(rng, 1.35, 1.85);
      } else {
        bias[st][good.id] = randRange(rng, 0.9, 1.1);
      }
    }
  }
  return bias;
}
