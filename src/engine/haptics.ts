import { onUiEvent, type HapticId } from './bus';
import { getState } from './store';

// spec §14.3. Durations floored around ~18ms — many Android ERM vibration motors have
// enough physical spin-up latency that sub-15ms pulses read as weak or go unfelt
// entirely, even though the call itself succeeds.
const PATTERNS: Record<HapticId, number | number[]> = {
  tap: 18,
  sell: 22,
  rank_up: [30, 40, 60],
  jackpot: [40, 30, 40, 30, 80],
  error: 50,
};

export function initHaptics(): void {
  onUiEvent((e) => {
    if (e.type !== 'haptic') return;
    if (!getState().settings.haptics) return;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try {
      // Some Android/Chrome combos return false (rather than throwing) when a call is
      // rejected — e.g. the tab lacks the activation state it thinks it has. Nothing
      // actionable to do differently, but useful to see in remote debugging.
      const ok = navigator.vibrate(PATTERNS[e.pattern]);
      if (!ok) console.debug(`[haptics] vibrate() rejected for pattern "${e.pattern}"`);
    } catch {
      /* iOS Safari silently lacks vibrate — no-op per spec */
    }
  });
}
