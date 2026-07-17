// Pure sort/filter for the market goods list — spec 2026-07-16 feature 1.
import type { Good } from '../config/types';
import type { GameState } from './state';
import { getPrice } from './pricing';
import { sectorScale } from './price';

export type MarketSort = 'default' | 'price' | 'vsAvg' | 'owned' | 'profit' | 'perTon';

export interface MarketFilters {
  owned: boolean;
  affordable: boolean;
  hideContraband: boolean;
  tier: number | null;
}

export const DEFAULT_FILTERS: MarketFilters = { owned: false, affordable: false, hideContraband: false, tier: null };

export const SORT_LABELS: Record<MarketSort, string> = {
  default: 'Tier', price: 'Price', vsAvg: 'vs Avg', owned: 'Owned', profit: 'Profit', perTon: '₡/m³',
};

export function applyMarketView(goods: Good[], state: GameState, sort: MarketSort, filters: MarketFilters): Good[] {
  const price = (g: Good) => getPrice(state, state.currentStation, g.id);
  const unlocked = (g: Good) => g.unlockRank <= state.rank;

  let list = goods.filter((g) => {
    if (!unlocked(g)) return true; // locked rows stay visible (sunk below) unless a filter drops them
    if (filters.owned && !(state.cargo[g.id]?.qty > 0)) return false;
    if (filters.affordable && price(g) > state.credits) return false;
    if (filters.hideContraband && g.contraband) return false;
    if (filters.tier !== null && g.tier !== filters.tier) return false;
    return true;
  });
  if (filters.owned || filters.affordable) list = list.filter(unlocked); // those filters imply "usable now"
  if (filters.tier !== null) list = list.filter((g) => g.tier === filters.tier);

  const key = (g: Good): number => {
    switch (sort) {
      case 'price': return price(g);
      case 'vsAvg': {
        const neutral = g.base * sectorScale(state.sector);
        return neutral > 0 ? price(g) / neutral : 0;
      }
      case 'owned': return state.cargo[g.id]?.qty ?? 0;
      case 'profit': {
        const entry = state.cargo[g.id];
        return entry && entry.qty > 0 ? (price(g) - entry.avgCost) * entry.qty : -Infinity;
      }
      case 'perTon': return price(g) / Math.max(0.01, g.mass);
      default: return 0;
    }
  };

  return [...list].sort((a, b) => {
    const ua = unlocked(a) ? 0 : 1;
    const ub = unlocked(b) ? 0 : 1;
    if (ua !== ub) return ua - ub;
    if (sort === 'default' || ua === 1) return a.unlockRank - b.unlockRank || a.base - b.base;
    return key(b) - key(a); // all non-default sorts are descending (biggest first)
  });
}
