import { describe, it, expect } from 'vitest';
import { biasFor } from '../pricing';
import { GOODS, GOODS_BY_ID } from '../../config/goods';
import { STATIONS, stationBias } from '../../config/stations';

const S1_STATIONS = STATIONS.filter((s) => s.id !== 'the_signal').map((s) => s.id);

describe('per-run sector-1 routes', () => {
  it('runSeed 0 keeps the hand-authored matrix', () => {
    for (const g of GOODS.slice(0, 6)) {
      for (const st of S1_STATIONS) {
        expect(biasFor(st, g, 0)).toBe(stationBias(st, g.id));
      }
    }
  });

  it('a nonzero seed re-rolls routes deterministically', () => {
    const g = GOODS_BY_ID['coolant'];
    const a = S1_STATIONS.map((st) => biasFor(st, g, 777));
    const b = S1_STATIONS.map((st) => biasFor(st, g, 777));
    const c = S1_STATIONS.map((st) => biasFor(st, g, 778));
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('every good keeps the archetype: at least one exporter station', () => {
    // range covers both the pre-Task-5 (0.55-0.7) and post-Task-5 (0.50-0.65)
    // exporter rolls, so this test is order-independent
    for (const g of GOODS) {
      const vals = S1_STATIONS.map((st) => biasFor(st, g, 424242));
      const exporters = vals.filter((v) => v >= 0.5 && v <= 0.7);
      expect(exporters.length).toBeGreaterThanOrEqual(1);
      for (const v of vals) expect(v).toBeLessThanOrEqual(1.85);
    }
  });

  it('the tutorial scrap route is pinned', () => {
    const scrap = GOODS_BY_ID['scrap_metal'];
    expect(biasFor('rust_harbor', scrap, 31337)).toBe(0.55);
    expect(biasFor('neon_bazaar', scrap, 31337)).toBe(1.45);
  });

  it('The Signal keeps hand-authored bias regardless of seed', () => {
    const g = GOODS_BY_ID['warp_cells'];
    expect(biasFor('the_signal', g, 31337)).toBe(stationBias('the_signal', g.id));
  });
});
