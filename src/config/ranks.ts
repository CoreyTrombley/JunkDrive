// Rank titles & structural unlock flavor — spec §9, §9.1.

export interface TitleThreshold {
  rank: number;
  title: string;
}

export const TITLES: TitleThreshold[] = [
  { rank: 1, title: 'Rust Rat' },
  { rank: 3, title: 'Cargo Monkey' },
  { rank: 5, title: 'Belt Runner' },
  { rank: 8, title: 'Void Trader' },
  { rank: 12, title: 'Junk Baron' },
  { rank: 16, title: 'Salvage King' },
  { rank: 20, title: 'Drift Magnate' },
  { rank: 25, title: 'Star Mogul' },
  { rank: 30, title: 'JUNK GOD' },
];

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function titleForRank(rank: number): string {
  if (rank >= 30) {
    const tier = Math.floor((rank - 30) / 10) + 1;
    if (tier <= 1) return 'JUNK GOD';
    const numeral = tier <= 10 ? ROMAN[tier] : String(tier);
    return `JUNK GOD ${numeral}`;
  }
  let best = TITLES[0];
  for (const t of TITLES) {
    if (t.rank <= rank) best = t;
  }
  return best.title;
}

// Structural unlocks shown on the rank-up toast, keyed by rank. Good/station
// unlocks are derived from their own unlockRank fields (single source of
// truth) — this table is just the flavor label for the celebration card.
export const RANK_UNLOCK_LABELS: Record<number, string> = {
  2: 'Tier 2 goods unlocked',
  3: 'THE YARD is open — idle income begins',
  5: 'Hot Streak system online',
  6: 'HALO COURT + Earth Relics unlocked',
  8: 'Tier 4 goods + contraband unlocked',
  9: 'Warp Cells unlocked',
  10: 'Neutrino Lenses unlocked',
  12: 'THE SIGNAL station unlocked',
  15: 'Tier 5 goods unlocked',
  17: 'Antimatter Vials unlocked',
  19: 'Singularity Shards unlocked',
  20: 'Sector 2 gate now visible on the Map',
  22: 'Tier 6 goods unlocked',
  24: 'Stellar Cores unlocked',
  25: 'WORMHOLE RUN unlocked — prestige is live',
  26: 'Ghost Ships unlocked',
  28: 'Time Crystals unlocked',
  30: 'JUNK GOD — ranks now endless',
};

export function xpToNext(level: number): number {
  return Math.round(12 * Math.pow(level, 1.8));
}

export function saleXp(profit: number): number {
  if (profit <= 0) return 1;
  return Math.max(1, Math.ceil(3 * Math.pow(profit, 0.35)));
}

/** Every rank pays: goodie scaled to net worth (spec §9.1). */
export function rankGoodieCredits(netWorth: number): number {
  return Math.max(20, netWorth * 0.03);
}

export function isBoostRank(rank: number): boolean {
  return rank % 5 === 0;
}
