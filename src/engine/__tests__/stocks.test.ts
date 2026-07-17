import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';
import { GOODS_BY_ID } from '../../config/goods';
import { stockBaseline, getStock, stockPriceMult, applyStockTrade, regenStocks } from '../stocks';
import { getPrice, biasFor } from '../pricing';

describe('station stocks', () => {
  it('baselines follow station role', () => {
    const scrap = GOODS_BY_ID['scrap_metal'];
    // legacy matrix (runSeed 0): rust_harbor exports scrap at 0.55, frostdock imports at 1.35
    expect(stockBaseline('rust_harbor', scrap, 0)).toBe(120);
    expect(stockBaseline('frostdock', scrap, 0)).toBe(40);
    expect(stockBaseline('neon_bazaar', scrap, 0)).toBe(70); // bias 1.0
  });

  it('price multiplier: scarcity raises, glut lowers, baseline is neutral', () => {
    expect(stockPriceMult(70, 70)).toBe(1);
    expect(stockPriceMult(0, 70)).toBeCloseTo(1.5, 6);
    expect(stockPriceMult(35, 70)).toBeCloseTo(1.25, 6);
    expect(stockPriceMult(140, 70)).toBeCloseTo(0.7, 6);
    expect(stockPriceMult(1000, 70)).toBeCloseTo(0.7, 6); // floored
  });

  it('trading moves stock and getPrice reacts', () => {
    let s = createInitialState();
    s = { ...s, runSeed: 0 }; // hand-authored matrix for a stable exporter
    const before = getPrice(s, 'rust_harbor', 'scrap_metal');
    s = applyStockTrade(s, 'rust_harbor', 'scrap_metal', -60); // buy 60 units
    expect(getStock(s, 'rust_harbor', 'scrap_metal')).toBe(60);
    const after = getPrice(s, 'rust_harbor', 'scrap_metal');
    expect(after).toBeGreaterThan(before); // scarcity
    s = applyStockTrade(s, 'rust_harbor', 'scrap_metal', 200); // dump 200 back
    expect(getPrice(s, 'rust_harbor', 'scrap_metal')).toBeLessThan(before); // glut
  });

  it('stock floors at zero', () => {
    let s = createInitialState();
    s = applyStockTrade(s, 'neon_bazaar', 'coolant', -9999);
    expect(getStock(s, 'neon_bazaar', 'coolant')).toBe(0);
  });

  it('regen drifts toward baseline and prunes near-baseline entries', () => {
    let s = createInitialState();
    s = { ...s, runSeed: 0 };
    s = applyStockTrade(s, 'rust_harbor', 'scrap_metal', -120); // exporter, B=120 -> S=0
    s = regenStocks(s, 1); // exporter regen 20%: 0 + 0.2*120 = 24
    expect(getStock(s, 'rust_harbor', 'scrap_metal')).toBeCloseTo(24, 6);
    s = regenStocks(s, 30); // long offline catch-up converges...
    expect(getStock(s, 'rust_harbor', 'scrap_metal')).toBeCloseTo(120, 0);
    // ...and the entry is pruned once within 1.0 of baseline
    expect(s.stocks['rust_harbor']?.['scrap_metal']).toBeUndefined();
  });
});
