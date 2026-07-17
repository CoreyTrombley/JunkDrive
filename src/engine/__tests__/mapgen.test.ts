import { describe, it, expect } from 'vitest';
import { generateSectorMap, laneBetween, GATE_NODE_ID } from '../mapgen';
import { STATIONS } from '../../config/stations';

function reachable(map: ReturnType<typeof generateSectorMap>): Set<string> {
  const adj = new Map<string, string[]>();
  for (const l of map.lanes) {
    adj.set(l.a, [...(adj.get(l.a) ?? []), l.b]);
    adj.set(l.b, [...(adj.get(l.b) ?? []), l.a]);
  }
  const seen = new Set<string>([map.nodes[0].id]);
  const queue = [map.nodes[0].id];
  while (queue.length) {
    for (const n of adj.get(queue.pop()!) ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  }
  return seen;
}

describe('sector map generation', () => {
  it('is deterministic per (sector, runSeed) and differs across seeds', () => {
    const a = generateSectorMap(1, 123);
    const b = generateSectorMap(1, 123);
    expect(a).toBe(b); // memoized — same object
    const c = generateSectorMap(1, 456);
    expect(JSON.stringify(a.lanes)).not.toBe(JSON.stringify(c.lanes));
  });

  it('has 13 nodes: all 7 stations by their own ids, 5 waypoints, 1 gate', () => {
    const m = generateSectorMap(1, 777);
    expect(m.nodes.length).toBe(13);
    for (const st of STATIONS) {
      const n = m.nodes.find((x) => x.id === st.id);
      expect(n?.kind).toBe('station');
      expect(n?.stationId).toBe(st.id);
    }
    const kinds = m.nodes.map((n) => n.kind);
    expect(kinds.filter((k) => k === 'outpost').length).toBe(2);
    expect(kinds.filter((k) => k === 'depot').length).toBe(1);
    expect(kinds.filter((k) => k === 'salvage').length).toBe(1);
    expect(kinds.filter((k) => k === 'beacon').length).toBe(1);
    expect(m.nodes.find((n) => n.id === GATE_NODE_ID)?.kind).toBe('gate');
  });

  it('the graph is fully connected with sane lanes', () => {
    for (const seed of [1, 99, 424242]) {
      const m = generateSectorMap(1, seed);
      expect(reachable(m).size).toBe(m.nodes.length);
      const ids = new Set(m.nodes.map((n) => n.id));
      for (const l of m.lanes) {
        expect(ids.has(l.a)).toBe(true);
        expect(ids.has(l.b)).toBe(true);
        expect([1, 2]).toContain(l.fuel);
        expect(['safe', 'pirate', 'express']).toContain(l.trait);
        expect(l.a).not.toBe(l.b);
      }
      // degree cap
      const deg = new Map<string, number>();
      for (const l of m.lanes) {
        deg.set(l.a, (deg.get(l.a) ?? 0) + 1);
        deg.set(l.b, (deg.get(l.b) ?? 0) + 1);
      }
      for (const d of deg.values()) expect(d).toBeLessThanOrEqual(6);
      // no duplicate lanes
      const keys = m.lanes.map((l) => [l.a, l.b].sort().join('|'));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('outposts stock 5 goods; positions are on-canvas percentages', () => {
    const m = generateSectorMap(2, 31337);
    for (const n of m.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(100);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(100);
      if (n.kind === 'outpost') expect(n.goodIds?.length).toBe(5);
    }
  });
});
