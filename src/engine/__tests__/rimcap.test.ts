import { describe, it, expect } from 'vitest';
import { importSaveCode } from '../save';
import { createInitialState } from '../state';
import { HONOR_BADGES, JACKPOTS, JACKPOTS_BY_ID } from '../../config/events';
import { CODEX_SETS } from '../../config/codex';
import { SECTOR_CAP } from '../formulas';

function encode(save: unknown): string {
  // mirrors exportSaveCode (save.ts) and the existing activetime.test pattern;
  // btoa is typed by the DOM lib — do NOT use Buffer (no @types/node in this repo)
  return btoa(unescape(encodeURIComponent(JSON.stringify(save))));
}

describe('sector 99 cap + legacy clamp', () => {
  it('badges resolve in JACKPOTS_BY_ID but stay out of the arrival pool', () => {
    expect(JACKPOTS_BY_ID['rim_walker']).toBeDefined();
    expect(JACKPOTS_BY_ID['beyond_the_rim']).toBeDefined();
    expect(JACKPOTS.some((j) => j.id === 'rim_walker' || j.id === 'beyond_the_rim')).toBe(false);
    const monuments = CODEX_SETS.find((s) => s.id === 'honor_badges');
    expect(monuments?.memberIds.sort()).toEqual(['beyond_the_rim', 'rim_walker']);
    expect(HONOR_BADGES.length).toBe(2);
  });

  it('imported god-saves clamp to S99, fix waypoint positions, and earn both badges', () => {
    const god = createInitialState();
    god.sector = 121;
    god.maxSectorReached = 121;
    god.bests.deepestSector = 121;
    god.currentStation = 'wp-s121-3';
    const loaded = importSaveCode(encode(god));
    expect(loaded.sector).toBe(SECTOR_CAP);
    expect(loaded.maxSectorReached).toBe(SECTOR_CAP);
    expect(loaded.bests.deepestSector).toBe(SECTOR_CAP);
    expect(loaded.currentStation).toBe('rust_harbor');
    expect(loaded.codex.jackpots['rim_walker']).toBe(true);
    expect(loaded.codex.jackpots['beyond_the_rim']).toBe(true);
    expect((loaded as unknown as Record<string, unknown>).pendingRimClamp).toBe(true);
  });

  it('normal saves pass through the clamp untouched', () => {
    const s = createInitialState();
    s.sector = 12;
    s.maxSectorReached = 12;
    const loaded = importSaveCode(encode(s));
    expect(loaded.sector).toBe(12);
    expect(loaded.codex.jackpots['rim_walker']).toBeUndefined();
  });
});
