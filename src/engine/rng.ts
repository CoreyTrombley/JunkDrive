// Deterministic RNG utilities. Used for market waves & event rolls so offline
// catch-up can replay many "ticks" synchronously in a tight loop instead of
// simulating real wall-clock intervals (see spec §15.4).

export type RngFn = () => number;

export function mulberry32(seed: number): RngFn {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randRange(rng: RngFn, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function randInt(rng: RngFn, min: number, max: number): number {
  return Math.floor(randRange(rng, min, max + 1));
}

export function chance(rng: RngFn, probability: number): boolean {
  return rng() < probability;
}

export function pickWeighted<T>(rng: RngFn, items: Array<{ item: T; weight: number }>): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const it of items) {
    if (r < it.weight) return it.item;
    r -= it.weight;
  }
  return items[items.length - 1].item;
}

export function pick<T>(rng: RngFn, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function shuffle<T>(rng: RngFn, items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
