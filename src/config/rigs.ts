import type { Rig } from './types';

// The Yard's rig ladder — spec §7.1. Each ~8x the cost of the last, slower
// cycle, bigger payout. Payback times verified by sim (see spec §16.5).
export const RIGS: Rig[] = [
  { id: 'vending_drones', name: 'Vending Drones', icon: '🤖', order: 0, baseCost: 100, costGrowth: 1.10, cycleSec: 3, basePayout: 14, managerName: 'CLAMP', managerCost: 1_500, managerBlurb: 'A forklift with feelings.' },
  { id: 'scrap_magnets', name: 'Scrap Magnet Array', icon: '🧲', order: 1, baseCost: 750, costGrowth: 1.11, cycleSec: 6, basePayout: 90, managerName: 'MAGDA', managerCost: 9_000, managerBlurb: 'Aggressively magnetic.' },
  { id: 'recycler_line', name: 'Recycler Line', icon: '♻️', order: 2, baseCost: 6_000, costGrowth: 1.12, cycleSec: 12, basePayout: 640, managerName: 'THE SHREDDER', managerCost: 60_000, managerBlurb: 'A retired wrestler.' },
  { id: 'fuel_still', name: 'Fuel Still', icon: '⛽', order: 3, baseCost: 45_000, costGrowth: 1.12, cycleSec: 24, basePayout: 4_300, managerName: 'GRANNY OCTANE', managerCost: 400_000, managerBlurb: 'Runs on rumor and regret.' },
  { id: 'drone_foundry', name: 'Drone Foundry', icon: '🏭', order: 4, baseCost: 300_000, costGrowth: 1.13, cycleSec: 45, basePayout: 26_000, managerName: 'UNIT-7', managerCost: 2_500_000, managerBlurb: 'Builds its own coworkers.' },
  { id: 'salvage_fleet', name: 'Salvage Fleet', icon: '🚀', order: 5, baseCost: 2_000_000, costGrowth: 1.13, cycleSec: 90, basePayout: 160_000, managerName: 'CAPTAIN ECHO', managerCost: 15_000_000, managerBlurb: 'Your biggest fan.' },
  { id: 'orbital_casino', name: 'Orbital Casino', icon: '🎰', order: 6, baseCost: 14_000_000, costGrowth: 1.14, cycleSec: 150, basePayout: 1_050_000, managerName: 'LUCKY LUX', managerCost: 90_000_000, managerBlurb: 'Three eyes. All winking.' },
  { id: 'asteroid_cracker', name: 'Asteroid Cracker', icon: '☄️', order: 7, baseCost: 100_000_000, costGrowth: 1.14, cycleSec: 300, basePayout: 7_000_000, managerName: 'BOOMBOX BETTY', managerCost: 600_000_000, managerBlurb: 'Cracks rocks, blasts riffs.' },
  { id: 'nebula_refinery', name: 'Nebula Refinery', icon: '🌌', order: 8, baseCost: 800_000_000, costGrowth: 1.15, cycleSec: 600, basePayout: 52_000_000, managerName: 'DR. HAZE', managerCost: 4_500_000_000, managerBlurb: 'Probably a gas cloud.' },
  { id: 'dyson_scaffold', name: 'Dyson Scaffold', icon: '☀️', order: 9, baseCost: 6_500_000_000, costGrowth: 1.15, cycleSec: 1200, basePayout: 400_000_000, managerName: 'THE ARCHITECT', managerCost: 35_000_000_000, managerBlurb: 'No further questions.' },
];

export const RIGS_BY_ID: Record<string, Rig> = Object.fromEntries(RIGS.map((r) => [r.id, r]));
export const MILESTONES = [10, 25, 50, 100, 200];
export function milestoneStep(): number {
  return 100;
}
