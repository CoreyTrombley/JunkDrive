import { describe, it, expect } from 'vitest';
import { GOODS, GOODS_BY_ID } from '../../config/goods';
import { generateSectorGoods } from '../sectorgen';

describe('good masses', () => {
  it('every authored good has a positive mass', () => {
    for (const g of GOODS) expect(g.mass).toBeGreaterThan(0);
  });

  it('authored spot values match the spec', () => {
    expect(GOODS_BY_ID['scrap_metal'].mass).toBe(60);
    expect(GOODS_BY_ID['hull_plates'].mass).toBe(75);
    expect(GOODS_BY_ID['earth_relics'].mass).toBe(9);
    expect(GOODS_BY_ID['ghost_ships'].mass).toBe(45);
    expect(GOODS_BY_ID['time_crystals'].mass).toBe(2.5);
  });

  it('procedural goods roll band masses within range, deterministically', () => {
    const bands = [60, 37.5, 15, 6];
    const a = generateSectorGoods(2, 777);
    const b = generateSectorGoods(2, 777);
    expect(a.map((g) => g.mass)).toEqual(b.map((g) => g.mass));
    a.forEach((g, band) => {
      expect(g.mass).toBeGreaterThanOrEqual(bands[band] * 0.7 - 1e-9);
      expect(g.mass).toBeLessThanOrEqual(bands[band] * 1.3 + 1e-9);
    });
  });

  it('SAVE-COMPAT: mass roll must not shift the legacy rng stream', () => {
    // Pinned from the shipped generator at runSeed 0 — if these change, legacy
    // saves would see renamed/repriced goods. The mass roll must use its own rng.
    const s2 = generateSectorGoods(2, 0);
    expect(s2.map((g) => ({ id: g.id, name: g.name, base: g.base, contraband: !!g.contraband }))).toEqual([
      { id: 's2_g0', name: 'Prismatic Spores', base: 55, contraband: false },
      { id: 's2_g1', name: 'Feral Lattices', base: 544, contraband: true },
      { id: 's2_g2', name: 'Irradiated Cinders', base: 3228, contraband: true },
      { id: 's2_g3', name: 'Synthetic Husks', base: 39159, contraband: false },
    ]);
    const s3 = generateSectorGoods(3, 0);
    expect(s3.map((g) => g.name)).toEqual(['Irradiated Filaments', 'Ancient Husks', 'Crystalline Lattices', 'Phase-Shifted Ingots']);
  });
});
