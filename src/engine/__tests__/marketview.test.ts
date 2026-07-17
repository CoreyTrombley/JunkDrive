import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';
import { GOODS_BY_ID } from '../../config/goods';
import { applyMarketView, type MarketFilters } from '../marketview';

const NO_FILTERS: MarketFilters = { owned: false, affordable: false, hideContraband: false, tier: null };

describe('market view', () => {
  it('filters to owned goods', () => {
    const s = createInitialState();
    s.rank = 10;
    s.cargo = { coolant: { qty: 2, avgCost: 50 } };
    const goods = [GOODS_BY_ID['coolant'], GOODS_BY_ID['med_gel']];
    const out = applyMarketView(goods, s, 'default', { ...NO_FILTERS, owned: true });
    expect(out.map((g) => g.id)).toEqual(['coolant']);
  });

  it('hides contraband and filters by tier', () => {
    const s = createInitialState();
    s.rank = 30;
    const goods = [GOODS_BY_ID['banned_ai_chips'], GOODS_BY_ID['warp_cells'], GOODS_BY_ID['coolant']];
    const noBan = applyMarketView(goods, s, 'default', { ...NO_FILTERS, hideContraband: true });
    expect(noBan.every((g) => !g.contraband)).toBe(true);
    const t4 = applyMarketView(goods, s, 'default', { ...NO_FILTERS, tier: 4 });
    expect(t4.map((g) => g.id).sort()).toEqual(['banned_ai_chips', 'warp_cells']);
  });

  it('sorts by price descending and by value density (₡/ton)', () => {
    const s = createInitialState();
    s.rank = 30;
    const goods = [GOODS_BY_ID['scrap_metal'], GOODS_BY_ID['time_crystals'], GOODS_BY_ID['coolant']];
    const byPrice = applyMarketView(goods, s, 'price', NO_FILTERS);
    expect(byPrice[0].id).toBe('time_crystals');
    const byDensity = applyMarketView(goods, s, 'perTon', NO_FILTERS);
    expect(byDensity[0].id).toBe('time_crystals'); // 2.5M / 0.25t
    expect(byDensity[byDensity.length - 1].id).toBe('scrap_metal'); // 10 / 6t
  });

  it('locked goods always sink below unlocked ones', () => {
    const s = createInitialState(); // rank 1
    const goods = [GOODS_BY_ID['time_crystals'], GOODS_BY_ID['scrap_metal']];
    const out = applyMarketView(goods, s, 'price', NO_FILTERS);
    expect(out[0].id).toBe('scrap_metal');
  });

  it('sorts by profit-if-sold-here using cargo avgCost', () => {
    const s = createInitialState();
    s.rank = 10;
    s.cargo = { coolant: { qty: 5, avgCost: 1 }, med_gel: { qty: 5, avgCost: 1e9 } };
    const goods = [GOODS_BY_ID['med_gel'], GOODS_BY_ID['coolant']];
    const out = applyMarketView(goods, s, 'profit', NO_FILTERS);
    expect(out[0].id).toBe('coolant');
  });
});
