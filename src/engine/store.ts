import { signal } from '@preact/signals';
import type { GameState } from './state';
import { createInitialState } from './state';

export const store = signal<GameState>(createInitialState());

/** Increments every 250ms; time-derived UI (countdowns, sparklines, pips) subscribes to this to re-render. */
export const clockTick = signal<number>(0);

export function getState(): GameState {
  return store.value;
}

export function setState(updater: (s: GameState) => GameState): void {
  store.value = updater(store.value);
}
