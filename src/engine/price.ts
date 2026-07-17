import type { RngFn } from './rng';
import { clamp } from './num';

export type Volatility = 'calm' | 'choppy' | 'wild';

export const PULSE_INTERVAL_MS = 180_000; // 3 min, per spec §5.2

export const VOLATILITY_BANDS: Record<Volatility, { step: number; min: number; max: number }> = {
  calm: { step: 0.08, min: 0.75, max: 1.25 },
  choppy: { step: 0.2, min: 0.5, max: 1.5 },
  wild: { step: 0.45, min: 0.25, max: 1.75 },
};

export interface WaveState {
  value: number;
  history: number[]; // last 8 pulses, oldest first — feeds the sparkline
}

export function initWave(): WaveState {
  return { value: 1, history: [1, 1, 1, 1, 1, 1, 1, 1] };
}

/** Advance a good's market wave by one pulse (~180s of sim time). */
export function pulseWave(wave: WaveState, volatility: Volatility, rng: RngFn): void {
  const band = VOLATILITY_BANDS[volatility];
  const delta = (rng() * 2 - 1) * band.step;
  const next = clamp(wave.value * (1 + delta), band.min, band.max);
  wave.history.push(next);
  if (wave.history.length > 8) wave.history.shift();
  wave.value = next;
}

/** Fast-forward N pulses synchronously — used for offline catch-up on load. */
export function fastForwardWave(wave: WaveState, volatility: Volatility, pulses: number, rng: RngFn): void {
  const capped = Math.min(pulses, 5000); // sanity cap; galactic markets don't need 5000+ pulses to feel "moved"
  for (let i = 0; i < capped; i++) pulseWave(wave, volatility, rng);
}

export interface ActiveMarketEvent {
  id: string;
  kind: string;
  stationId: string;
  goodId: string | null; // null = affects all goods at the station (e.g. MARKET_CRASH)
  multiplier: number;
  startedAt: number;
  expiresAt: number;
  disables?: boolean; // EMBARGO: trade blocked outright rather than price-shifted
}

/** Combined event multiplier for a given (station, good) from all active events. */
export function eventMultiplier(events: ActiveMarketEvent[], stationId: string, goodId: string, atTime: number): number {
  let mult = 1;
  for (const ev of events) {
    if (ev.stationId !== stationId) continue;
    if (ev.expiresAt <= atTime) continue;
    if (ev.goodId !== null && ev.goodId !== goodId) continue;
    mult *= ev.multiplier;
  }
  return mult;
}

export function sectorScale(sector: number): number {
  // Full ×8 jumps through S10, then +60%/sector — the D2-style taper that keeps
  // endgame numbers meaningful (S99 ≈ 2e26 instead of 8^98 ≈ 3e88). Spec 2026-07-17.
  return Math.pow(8, Math.min(sector, 10) - 1) * Math.pow(1.6, Math.max(0, sector - 10));
}

export function computePrice(params: {
  base: number;
  bias: number;
  waveValue: number;
  eventMult: number;
  sector: number;
}): number {
  const { base, bias, waveValue, eventMult, sector } = params;
  return base * bias * waveValue * eventMult * sectorScale(sector);
}

/** "vs galactic average" badge value — bias & events, wave-neutral so it reads as a stable route signal. */
export function routeBadge(bias: number, eventMult: number): number {
  return bias * eventMult - 1;
}
