import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';
import { store } from '../store';
import { tick, importSave } from '../actions';

describe('active play time', () => {
  it('accumulates elapsed foreground time on tick', () => {
    const s = createInitialState();
    s.lastSeen = Date.now() - 1000;
    store.value = s;
    tick();
    expect(store.value.stats.activePlayMs).toBeGreaterThanOrEqual(900);
    expect(store.value.stats.activePlayMs).toBeLessThanOrEqual(2500);
  });

  it('ignores long gaps (app was closed / device slept)', () => {
    const s = createInitialState();
    s.lastSeen = Date.now() - 60_000;
    store.value = s;
    tick();
    expect(store.value.stats.activePlayMs).toBe(0);
  });

  it('importing a pre-update save code backfills activePlayMs (no NaN)', () => {
    const legacy = createInitialState() as unknown as Record<string, unknown>;
    delete (legacy.stats as Record<string, unknown>).activePlayMs;
    delete legacy.runSeed;
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(legacy))));
    const res = importSave(code);
    expect(res.ok).toBe(true);
    expect(store.value.stats.activePlayMs).toBe(0);
    store.value = { ...store.value, lastSeen: Date.now() - 1000 };
    tick();
    expect(Number.isFinite(store.value.stats.activePlayMs)).toBe(true);
    expect(store.value.stats.activePlayMs).toBeGreaterThan(0);
  });
});
