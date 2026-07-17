import { describe, it, expect } from 'vitest';
import { shortestPath, routeThrough } from '../routing';
import { generateSectorMap } from '../mapgen';
import type { SectorMap } from '../mapgen';

// Hand-built diamond: A-B(1) B-D(1) A-C(2,pirate) C-D(1) — best A→D is A-B-D (2 fuel)
const DIAMOND: SectorMap = {
  nodes: (['A', 'B', 'C', 'D'] as const).map((id, i) => ({ id, kind: 'beacon' as const, name: id, icon: '·', x: i * 10, y: 0 })),
  lanes: [
    { a: 'A', b: 'B', fuel: 1, trait: 'safe' },
    { a: 'B', b: 'D', fuel: 1, trait: 'safe' },
    { a: 'A', b: 'C', fuel: 2, trait: 'pirate' },
    { a: 'C', b: 'D', fuel: 1, trait: 'safe' },
  ],
};

describe('routing', () => {
  it('finds the cheapest path by fuel', () => {
    const r = shortestPath(DIAMOND, 'A', 'D')!;
    expect(r.path).toEqual(['A', 'B', 'D']);
    expect(r.fuel).toBe(2);
    expect(r.pirates).toBe(0);
  });

  it('counts pirate lanes when the route uses them', () => {
    const r = shortestPath(DIAMOND, 'A', 'C')!;
    expect(r.fuel).toBe(2); // direct pirate lane == B-D-C (1+1+? no: A-B-D-C = 3) → direct wins
    expect(r.pirates).toBe(1);
  });

  it('routes through ordered stops and sums costs', () => {
    const r = routeThrough(DIAMOND, ['A', 'D', 'C'])!;
    expect(r.path).toEqual(['A', 'B', 'D', 'C']);
    expect(r.fuel).toBe(3);
  });

  it('returns null for unknown nodes and same-node trips resolve to zero cost', () => {
    expect(shortestPath(DIAMOND, 'A', 'ZZ')).toBeNull();
    const same = shortestPath(DIAMOND, 'A', 'A')!;
    expect(same.path).toEqual(['A']);
    expect(same.fuel).toBe(0);
  });

  it('every generated map is fully routable from every station', () => {
    const m = generateSectorMap(1, 8888);
    const stations = m.nodes.filter((n) => n.kind === 'station');
    for (const a of stations) for (const b of stations) {
      expect(shortestPath(m, a.id, b.id)).not.toBeNull();
    }
  });
});

describe('rank-lock safety (seed sweep)', () => {
  const LOCKED = new Set(['halo_court', 'the_signal']);
  it('every seed keeps the rank-1 world connected without locked stations', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const m = generateSectorMap(1, seed);
      const blocked = LOCKED;
      const free = m.nodes.filter((n) => !LOCKED.has(n.id));
      for (const target of free) {
        if (target.id === 'rust_harbor') continue;
        const r = shortestPath(m, 'rust_harbor', target.id, blocked);
        expect(r, `seed ${seed} → ${target.id}`).not.toBeNull();
        for (const hop of r!.path) expect(LOCKED.has(hop)).toBe(false);
      }
    }
  });
});
