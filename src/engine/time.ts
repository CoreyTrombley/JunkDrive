export function now(): number {
  return Date.now();
}

/** Clamp elapsed time to be non-negative (defends against clock rewinds). */
export function elapsedSince(ts: number): number {
  const d = now() - ts;
  return d > 0 ? d : 0;
}

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
