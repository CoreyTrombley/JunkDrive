import type { GameState } from './state';
import { SECTOR_CAP } from './formulas';

const SAVE_KEY = 'junkrun_save_v1';
export const SCHEMA_VERSION = 1;

export function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSave(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // storage full/unavailable — fail silently, next autosave will retry
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function exportSaveCode(state: GameState): string {
  const json = JSON.stringify(state);
  return btoa(unescape(encodeURIComponent(json)));
}

export function importSaveCode(code: string): GameState {
  const json = decodeURIComponent(escape(atob(code.trim())));
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || typeof parsed.credits !== 'number') {
    throw new Error('Not a valid JUNKRUN save code.');
  }
  if (typeof (parsed as Record<string, unknown>).runSeed !== 'number') {
    (parsed as Record<string, unknown>).runSeed = 0;
  }
  if (typeof (parsed as Record<string, unknown>).stocks !== 'object' || (parsed as Record<string, unknown>).stocks === null) {
    (parsed as Record<string, unknown>).stocks = {};
  }
  if (!Array.isArray((parsed as Record<string, unknown>).manifests)) (parsed as Record<string, unknown>).manifests = [];
  if (typeof (parsed as Record<string, unknown>).manifestSeq !== 'number') (parsed as Record<string, unknown>).manifestSeq = 1;
  if (typeof (parsed as Record<string, unknown>).lastSalvageAt !== 'object' || (parsed as Record<string, unknown>).lastSalvageAt === null) (parsed as Record<string, unknown>).lastSalvageAt = {};
  if (!Array.isArray((parsed as Record<string, unknown>).visitedBeacons)) (parsed as Record<string, unknown>).visitedBeacons = [];
  if (typeof (parsed as Record<string, unknown>).gateResonance !== 'number') (parsed as Record<string, unknown>).gateResonance = 0;
  if (typeof (parsed as Record<string, unknown>).flipProgress !== 'object' || (parsed as Record<string, unknown>).flipProgress === null) (parsed as Record<string, unknown>).flipProgress = {};
  if (typeof (parsed as Record<string, unknown>).pendingRimClamp !== 'boolean') (parsed as Record<string, unknown>).pendingRimClamp = false;

  const p = parsed as Record<string, any>;
  if (typeof p.sector === 'number' && p.sector > SECTOR_CAP) {
    p.sector = SECTOR_CAP;
    if (typeof p.maxSectorReached === 'number') p.maxSectorReached = Math.min(p.maxSectorReached, SECTOR_CAP);
    if (p.bests && typeof p.bests.deepestSector === 'number') p.bests.deepestSector = Math.min(p.bests.deepestSector, SECTOR_CAP);
    if (typeof p.currentStation === 'string' && p.currentStation.startsWith('wp-')) p.currentStation = 'rust_harbor';
    if (p.codex && p.codex.jackpots) {
      p.codex.jackpots['rim_walker'] = true;
      p.codex.jackpots['beyond_the_rim'] = true;
    }
    p.pendingRimClamp = true;
  }

  return parsed as GameState;
}
