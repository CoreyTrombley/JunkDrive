// Tiny pub/sub so game logic (actions.ts) can trigger UI juice (floaters,
// SFX, haptics, screenshake, confetti) without the reducer knowing anything
// about the DOM. Components subscribe once from a top-level FxLayer.

export type SfxId =
  | 'tap' | 'buy' | 'sell' | 'lucky_flip' | 'streak_up' | 'streak_break'
  | 'rank_up' | 'quest_claim' | 'jump' | 'arrival' | 'event_card'
  | 'jackpot' | 'coin_cascade' | 'cant_afford' | 'wormhole' | 'toll'
  | 'upgrade' | 'manager_hire' | 'milestone' | 'daily_claim' | 'boost'
  | 'encounter_good' | 'encounter_bad' | 'manifest_new' | 'manifest_deliver';

export type HapticId = 'tap' | 'sell' | 'rank_up' | 'jackpot' | 'error';

export type UiEvent =
  | { type: 'floater'; text: string; kind: 'profit' | 'loss' | 'xp' | 'info' }
  | { type: 'sfx'; id: SfxId; stationMotif?: number[]; data?: number }
  | { type: 'haptic'; pattern: HapticId }
  | { type: 'shake' }
  | { type: 'confetti'; power?: 'small' | 'big' }
  | { type: 'toast'; text: string; icon?: string }
  | { type: 'theme_flash'; color?: string };

type Listener = (e: UiEvent) => void;

const listeners = new Set<Listener>();

export function emit(e: UiEvent): void {
  listeners.forEach((l) => l(e));
}

export function onUiEvent(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
