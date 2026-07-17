// Dijkstra over warp lanes (13 nodes — plain arrays are plenty).
import type { SectorMap, MapLane } from './mapgen';

export interface RoutePlan {
  path: string[];
  fuel: number;
  pirates: number;
}

function neighbors(map: SectorMap, id: string): Array<{ id: string; lane: MapLane }> {
  const out: Array<{ id: string; lane: MapLane }> = [];
  for (const l of map.lanes) {
    if (l.a === id) out.push({ id: l.b, lane: l });
    else if (l.b === id) out.push({ id: l.a, lane: l });
  }
  return out;
}

export function shortestPath(map: SectorMap, from: string, to: string, blocked?: Set<string>): RoutePlan | null {
  const ids = map.nodes.map((n) => n.id);
  if (!ids.includes(from) || !ids.includes(to)) return null;
  const fuel = new Map<string, number>(ids.map((i) => [i, Infinity]));
  const hops = new Map<string, number>(ids.map((i) => [i, Infinity]));
  const prev = new Map<string, { id: string; lane: MapLane }>();
  const done = new Set<string>();
  fuel.set(from, 0);
  hops.set(from, 0);

  while (done.size < ids.length) {
    let cur: string | null = null;
    for (const id of ids) {
      if (done.has(id)) continue;
      if (cur === null || fuel.get(id)! < fuel.get(cur)! ||
        (fuel.get(id)! === fuel.get(cur)! && hops.get(id)! < hops.get(cur)!)) cur = id;
    }
    if (cur === null || fuel.get(cur) === Infinity) break;
    done.add(cur);
    if (cur === to) break;
    for (const { id: nb, lane } of neighbors(map, cur)) {
      if (done.has(nb)) continue;
      if (blocked?.has(nb) && nb !== to) continue;
      const nf = fuel.get(cur)! + lane.fuel;
      const nh = hops.get(cur)! + 1;
      if (nf < fuel.get(nb)! || (nf === fuel.get(nb)! && nh < hops.get(nb)!)) {
        fuel.set(nb, nf);
        hops.set(nb, nh);
        prev.set(nb, { id: cur, lane });
      }
    }
  }

  if (fuel.get(to) === Infinity) return null;
  const path = [to];
  let pirates = 0;
  let walker = to;
  while (walker !== from) {
    const p = prev.get(walker);
    if (!p) return null;
    if (p.lane.trait === 'pirate') pirates++;
    path.unshift(p.id);
    walker = p.id;
  }
  return { path, fuel: fuel.get(to)!, pirates };
}

export function routeThrough(map: SectorMap, stops: string[], blocked?: Set<string>): RoutePlan | null {
  if (stops.length < 2) return stops.length === 1 ? { path: [stops[0]], fuel: 0, pirates: 0 } : null;
  const total: RoutePlan = { path: [stops[0]], fuel: 0, pirates: 0 };
  for (let i = 1; i < stops.length; i++) {
    const leg = shortestPath(map, stops[i - 1], stops[i], blocked);
    if (!leg) return null;
    total.path.push(...leg.path.slice(1));
    total.fuel += leg.fuel;
    total.pirates += leg.pirates;
  }
  return total;
}
