import type { Station } from './types';

// Sector-1 station roster — spec §4.2 + bias matrix §16.3 (T1/T2 canonical,
// T3-T6 extended here following the archetype rules: each good gets one
// exporter station at 0.55-0.70 and 1-2 importer stations at 1.20-1.70;
// Halo Court imports nearly everything; The Signal flat-rates T4+ at 1.10).
export const STATIONS: Station[] = [
  {
    id: 'rust_harbor',
    name: 'Rust Harbor',
    icon: '🏭',
    unlockRank: 1,
    scanChance: 0.1,
    minGoodTier: 1,
    blurb: 'Home base. Smells like hot metal and opportunity.',
    bias: {
      scrap_metal: 0.55, hull_plates: 0.6, water_ice: 1.0, protein_packs: 1.5,
      copper_coil: 0.7, coolant: 1.4, fuel_rods: 1.0, spore_crates: 1.3,
      med_gel: 1.0, machine_parts: 0.75, circuit_bundles: 1.1, earth_relics: 0.65,
      alien_ceramics: 1.05, banned_ai_chips: 1.15, warp_cells: 1.1, neutrino_lenses: 1.15,
      alien_artifacts: 1.1, cryo_megafauna: 1.1, antimatter_vials: 1.15, singularity_shards: 0.65,
      dark_relics: 0.6, stellar_cores: 1.15, ghost_ships: 1.2, time_crystals: 1.15,
    },
    theme: {
      bg: '#1a1210', surface: '#241a16', accent: '#e05e2b', accent2: '#ffb37a',
      text: '#f5e6dc', glow: '#ff7a3d', particleHue: 25, overlay: 'dust',
      motif: [220, 233, 196], ambienceType: 'thrum',
    },
  },
  {
    id: 'neon_bazaar',
    name: 'Neon Bazaar',
    icon: '🛍️',
    unlockRank: 1,
    scanChance: 0.2,
    minGoodTier: 1,
    blurb: 'Everything is for sale. Especially trouble.',
    bias: {
      scrap_metal: 1.0, hull_plates: 1.0, water_ice: 1.0, protein_packs: 1.0,
      copper_coil: 1.0, coolant: 1.0, fuel_rods: 1.15, spore_crates: 1.0,
      med_gel: 1.05, machine_parts: 1.0, circuit_bundles: 0.6, earth_relics: 1.3,
      alien_ceramics: 1.1, banned_ai_chips: 0.6, warp_cells: 1.15, neutrino_lenses: 0.65,
      alien_artifacts: 1.25, cryo_megafauna: 1.15, antimatter_vials: 1.2, singularity_shards: 1.3,
      dark_relics: 1.3, stellar_cores: 1.2, ghost_ships: 1.25, time_crystals: 1.35,
    },
    theme: {
      bg: '#0d0221', surface: '#180a33', accent: '#ff2ec4', accent2: '#21e6ff',
      text: '#f5e9ff', glow: '#ff2ec4', particleHue: 300, overlay: 'scanlines',
      motif: [523, 587, 659, 784], ambienceType: 'plink',
    },
  },
  {
    id: 'frostdock',
    name: 'Frostdock',
    icon: '❄️',
    unlockRank: 1,
    scanChance: 0.15,
    minGoodTier: 1,
    blurb: 'Ice on the hull, frost on the deals.',
    bias: {
      scrap_metal: 1.35, hull_plates: 1.0, water_ice: 0.5, protein_packs: 1.6,
      copper_coil: 1.0, coolant: 0.6, fuel_rods: 1.3, spore_crates: 1.0,
      med_gel: 1.15, machine_parts: 1.1, circuit_bundles: 1.35, earth_relics: 1.1,
      alien_ceramics: 1.2, banned_ai_chips: 1.2, warp_cells: 1.3, neutrino_lenses: 1.1,
      alien_artifacts: 0.6, cryo_megafauna: 0.65, antimatter_vials: 1.25, singularity_shards: 1.15,
      dark_relics: 1.15, stellar_cores: 1.3, ghost_ships: 0.65, time_crystals: 1.2,
    },
    theme: {
      bg: '#04121f', surface: '#0a2035', accent: '#7fd8ff', accent2: '#d9f4ff',
      text: '#eaf7ff', glow: '#9fe8ff', particleHue: 195, overlay: 'frost',
      motif: [880, 1319], ambienceType: 'bell',
    },
  },
  {
    id: 'greenhouse',
    name: 'The Greenhouse',
    icon: '🌿',
    unlockRank: 1,
    scanChance: 0.1,
    minGoodTier: 1,
    blurb: "Domes of green in a lot of black. Don't ask about the smell.",
    bias: {
      scrap_metal: 1.0, hull_plates: 1.25, water_ice: 1.3, protein_packs: 0.55,
      copper_coil: 1.35, coolant: 1.0, fuel_rods: 1.0, spore_crates: 0.6,
      med_gel: 0.6, machine_parts: 1.3, circuit_bundles: 1.15, earth_relics: 1.15,
      alien_ceramics: 0.6, banned_ai_chips: 1.3, warp_cells: 1.2, neutrino_lenses: 1.25,
      alien_artifacts: 1.2, cryo_megafauna: 1.3, antimatter_vials: 1.15, singularity_shards: 1.2,
      dark_relics: 1.2, stellar_cores: 1.15, ghost_ships: 1.15, time_crystals: 0.6,
    },
    theme: {
      bg: '#071a0d', surface: '#0f2a17', accent: '#6fe86f', accent2: '#c8ffb0',
      text: '#eafff0', glow: '#8bff8b', particleHue: 120, overlay: 'spores',
      motif: [392, 494, 587], ambienceType: 'pad',
    },
  },
  {
    id: 'ember_works',
    name: 'Ember Works',
    icon: '🔥',
    unlockRank: 1,
    scanChance: 0.15,
    minGoodTier: 1,
    blurb: 'The forge never sleeps. Neither do the deals.',
    bias: {
      scrap_metal: 1.0, hull_plates: 0.6, water_ice: 1.55, protein_packs: 1.4,
      copper_coil: 0.6, coolant: 1.5, fuel_rods: 0.65, spore_crates: 1.0,
      med_gel: 1.35, machine_parts: 0.6, circuit_bundles: 1.05, earth_relics: 1.0,
      alien_ceramics: 1.15, banned_ai_chips: 1.25, warp_cells: 0.6, neutrino_lenses: 1.2,
      alien_artifacts: 1.15, cryo_megafauna: 1.2, antimatter_vials: 0.6, singularity_shards: 1.1,
      dark_relics: 1.2, stellar_cores: 0.6, ghost_ships: 1.15, time_crystals: 1.15,
    },
    theme: {
      bg: '#160607', surface: '#260a0c', accent: '#ff5040', accent2: '#ffb100',
      text: '#ffe9df', glow: '#ff6a3d', particleHue: 15, overlay: 'embers',
      motif: [110, 165, 220], ambienceType: 'stab',
    },
  },
  {
    id: 'halo_court',
    name: 'Halo Court',
    icon: '👑',
    unlockRank: 6,
    scanChance: 0.35,
    minGoodTier: 1,
    blurb: 'Money so old it forgot where it came from.',
    bias: {
      scrap_metal: 0.95, hull_plates: 1.1, water_ice: 1.45, protein_packs: 1.35,
      copper_coil: 1.2, coolant: 1.3, fuel_rods: 1.2, spore_crates: 1.7,
      med_gel: 1.3, machine_parts: 1.2, circuit_bundles: 1.4, earth_relics: 1.7,
      alien_ceramics: 1.45, banned_ai_chips: 1.55, warp_cells: 1.35, neutrino_lenses: 1.3,
      alien_artifacts: 1.7, cryo_megafauna: 1.4, antimatter_vials: 1.35, singularity_shards: 1.6,
      dark_relics: 1.65, stellar_cores: 1.4, ghost_ships: 1.55, time_crystals: 1.7,
    },
    theme: {
      bg: '#14101e', surface: '#201a30', accent: '#f5d76e', accent2: '#c9a8ff',
      text: '#fff6e0', glow: '#ffe9a8', particleHue: 45, overlay: 'sparkle',
      motif: [523, 659, 784, 880], ambienceType: 'arp',
    },
  },
  {
    id: 'the_signal',
    name: 'The Signal',
    icon: '📡',
    unlockRank: 12,
    scanChance: 0,
    minGoodTier: 4,
    blurb: "Nobody knows where it broadcasts from. Nobody asks twice.",
    bias: {
      alien_ceramics: 1.1, banned_ai_chips: 1.1, warp_cells: 1.1, neutrino_lenses: 1.1,
      alien_artifacts: 1.1, cryo_megafauna: 1.1, antimatter_vials: 1.1, singularity_shards: 1.1,
      dark_relics: 1.1, stellar_cores: 1.1, ghost_ships: 1.1, time_crystals: 1.1,
    },
    theme: {
      bg: '#0a0a12', surface: '#14141f', accent: '#a06bff', accent2: '#ff6bcb',
      text: '#e8e0ff', glow: '#b98bff', particleHue: 265, overlay: 'glitch',
      motif: [220, 311], ambienceType: 'drone',
    },
  },
];

export const STATIONS_BY_ID: Record<string, Station> = Object.fromEntries(STATIONS.map((s) => [s.id, s]));

export function stationBias(stationId: string, goodId: string): number {
  const st = STATIONS_BY_ID[stationId];
  if (!st) return 1;
  return st.bias[goodId] ?? 1;
}
