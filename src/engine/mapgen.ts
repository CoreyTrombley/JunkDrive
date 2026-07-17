// Per-sector warp-lane graph — spec 2026-07-16 feature 3. 13 nodes (7 stations
// keeping their own ids, 5 waypoints, 1 gate) placed on a jittered 6×5 grid and
// connected by lanes with fuel costs and traits. Deterministic per
// (sector, runSeed); memoized like the pricing tables.
import type { StationTheme } from '../config/types';
import { STATIONS } from '../config/stations';
import { GOODS } from '../config/goods';
import { generateSectorGoods } from './sectorgen';
import { mulberry32, hashSeed, randRange, shuffle, chance, type RngFn } from './rng';

export type NodeKind = 'station' | 'outpost' | 'depot' | 'salvage' | 'beacon' | 'gate';

export interface MapNode {
  id: string;
  kind: NodeKind;
  stationId?: string;
  name: string;
  icon: string;
  x: number; // 0-100 render percentage
  y: number;
  goodIds?: string[]; // outposts only
}

export interface MapLane {
  a: string;
  b: string;
  fuel: number; // 1 short, 2 long
  trait: 'safe' | 'pirate' | 'express';
}

export interface SectorMap {
  nodes: MapNode[];
  lanes: MapLane[];
}

export const GATE_NODE_ID = 'gate';

export const WAYPOINT_THEME: StationTheme = {
  bg: '#05070f', surface: '#0c1120', accent: '#8fa3c8', accent2: '#c8d6f0',
  text: '#e6ecf8', glow: '#8fa3c8', particleHue: 220, overlay: 'dust',
  motif: [196, 261], ambienceType: 'drone',
};

const OUTPOST_NAMES = ['DRIFTER POST', 'KESSLER STOP', 'LONE ANCHOR', 'MOTE MARKET', 'HALFWAY HOLE'];

const COLS = 6, ROWS = 5;

interface Cell { col: number; row: number; }

function cellPos(cell: Cell, rng: RngFn): { x: number; y: number } {
  return {
    x: Math.round((8 + cell.col * 16.8 + randRange(rng, -3, 3)) * 10) / 10,
    y: Math.round((10 + cell.row * 19 + randRange(rng, -4, 4)) * 10) / 10,
  };
}

const dist = (a: MapNode, b: MapNode) => Math.hypot(a.x - b.x, a.y - b.y);

function laneKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

const cache = new Map<string, SectorMap>();

export function generateSectorMap(sector: number, runSeed: number): SectorMap {
  const key = `${sector}:${runSeed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const rng = mulberry32((hashSeed(`map-sector-${sector}`) ^ (runSeed >>> 0)) >>> 0);

  // 1) choose 12 spread cells + a gate cell on the right edge
  const all: Cell[] = [];
  for (let col = 0; col < COLS; col++) for (let row = 0; row < ROWS; row++) all.push({ col, row });
  const shuffled = shuffle(rng, all);
  const chosen: Cell[] = [];
  for (const c of shuffled) {
    if (chosen.length >= 12) break;
    if (chosen.every((o) => Math.abs(o.col - c.col) + Math.abs(o.row - c.row) >= 2)) chosen.push(c);
  }
  for (const c of shuffled) {
    if (chosen.length >= 12) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  const gateCell = shuffled.find((c) => !chosen.includes(c) && c.col >= COLS - 2) ?? shuffled.find((c) => !chosen.includes(c))!;

  // 2) assign roles: first 7 cells → stations (fixed STATIONS order), rest → shuffled waypoints
  const nodes: MapNode[] = [];
  STATIONS.forEach((st, i) => {
    nodes.push({ id: st.id, kind: 'station', stationId: st.id, name: st.name, icon: st.icon, ...cellPos(chosen[i], rng) });
  });
  const sectorGoods = sector >= 2 ? generateSectorGoods(sector, runSeed) : [];
  const catalog = [...GOODS, ...sectorGoods];
  const wpKinds = shuffle(rng, ['outpost', 'outpost', 'depot', 'salvage', 'beacon'] as const);
  wpKinds.forEach((kind, i) => {
    const id = `wp-s${sector}-${i}`;
    const pos = cellPos(chosen[7 + i], rng);
    if (kind === 'outpost') {
      nodes.push({
        id, kind, name: OUTPOST_NAMES[Math.floor(rng() * OUTPOST_NAMES.length)], icon: '🏪', ...pos,
        goodIds: shuffle(rng, catalog).slice(0, 5).map((g) => g.id),
      });
    } else if (kind === 'depot') {
      nodes.push({ id, kind, name: 'FUEL DEPOT', icon: '⛽', ...pos });
    } else if (kind === 'salvage') {
      nodes.push({ id, kind, name: 'SALVAGE FIELD', icon: '🛠️', ...pos });
    } else {
      nodes.push({ id, kind, name: 'BEACON', icon: '📍', ...pos });
    }
  });
  nodes.push({ id: GATE_NODE_ID, kind: 'gate', name: 'SECTOR GATE', icon: '🌀', ...cellPos(gateCell, rng) });

  // 3) lanes: nearest-2 per node, then connectivity repair, then 2 long shortcuts
  const laneSet = new Map<string, MapLane>();
  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);
  const addLane = (a: MapNode, b: MapNode) => {
    const k = laneKey(a.id, b.id);
    if (laneSet.has(k)) return;
    const d = dist(a, b);
    const gateSide = a.kind === 'gate' || b.kind === 'gate';
    const trait: MapLane['trait'] = gateSide ? 'safe' : chance(rng, 0.2) ? 'pirate' : chance(rng, 0.125) ? 'express' : 'safe';
    laneSet.set(k, { a: a.id, b: b.id, fuel: d <= 24 ? 1 : 2, trait });
    bump(a.id); bump(b.id);
  };

  for (const n of nodes) {
    const nearest = nodes.filter((o) => o !== n).sort((p, q) => dist(n, p) - dist(n, q)).slice(0, 2);
    for (const o of nearest) addLane(n, o);
  }

  // union-find connectivity repair — two-stage: first make the unlocked (rank-1)
  // subgraph connected on its own lanes, then attach the locked stations. This
  // guarantees a lock-free path always exists between rank-1 nodes, regardless
  // of where rank-locked stations (e.g. halo_court R6, the_signal R12) land.
  //
  // Each pass builds its own union-find scoped to the eligible pool, seeded only
  // from lanes whose BOTH endpoints are in that pool. A shared/global union-find
  // (unioned once over every lane up front) would leak connectivity through
  // locked stations into the unlocked-only pass — e.g. two unlocked nodes that
  // are only bridged via a locked station would be reported as already
  // connected, silently skipping the repair they need.
  const lockedIds = new Set(STATIONS.filter((s) => s.unlockRank > 1).map((s) => s.id));
  const repair = (eligible: (n: MapNode) => boolean) => {
    const pool = nodes.filter(eligible);
    const poolIds = new Set(pool.map((n) => n.id));
    const parent = new Map<string, string>(pool.map((n) => [n.id, n.id]));
    const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
    const union = (x: string, y: string) => parent.set(find(x), find(y));
    for (const l of laneSet.values()) {
      if (poolIds.has(l.a) && poolIds.has(l.b)) union(l.a, l.b);
    }
    for (let guard = 0; guard < 30; guard++) {
      const roots = new Set(pool.map((n) => find(n.id)));
      if (roots.size <= 1) break;
      let best: [MapNode, MapNode] | null = null;
      for (const p of pool) for (const q of pool) {
        if (find(p.id) === find(q.id)) continue;
        if (!best || dist(p, q) < dist(best[0], best[1])) best = [p, q];
      }
      if (!best) break;
      addLane(best[0], best[1]);
      union(best[0].id, best[1].id);
    }
  };
  repair((n) => !lockedIds.has(n.id));
  repair(() => true);

  // two long shortcuts for route choice
  const candidates = [] as Array<[MapNode, MapNode, number]>;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const k = laneKey(nodes[i].id, nodes[j].id);
    if (laneSet.has(k)) continue;
    candidates.push([nodes[i], nodes[j], dist(nodes[i], nodes[j])]);
  }
  candidates.sort((p, q) => q[2] - p[2]);
  let added = 0;
  for (const [p, q] of candidates) {
    if (added >= 2) break;
    if ((degree.get(p.id) ?? 0) >= 4 || (degree.get(q.id) ?? 0) >= 4) continue;
    addLane(p, q);
    added++;
  }

  const map: SectorMap = { nodes, lanes: [...laneSet.values()] };
  cache.set(key, map);
  return map;
}

export function nodeById(map: SectorMap, id: string): MapNode | undefined {
  return map.nodes.find((n) => n.id === id);
}

export function laneBetween(map: SectorMap, a: string, b: string): MapLane | undefined {
  const k = laneKey(a, b);
  return map.lanes.find((l) => laneKey(l.a, l.b) === k);
}

export function lanesFrom(map: SectorMap, id: string): MapLane[] {
  return map.lanes.filter((l) => l.a === id || l.b === id);
}
