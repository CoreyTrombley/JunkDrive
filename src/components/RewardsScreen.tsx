import { store, clockTick } from '../engine/store';
import { claimDailyStreak, canClaimDailyStreak, useBoostToken } from '../engine/actions';
import { formatDuration } from '../engine/num';
import { now } from '../engine/time';

export function RewardsScreen() {
  const s = store.value;
  void clockTick.value;
  const t = now();
  const day = ((s.dailyStreak.count) % 7) + (canClaimDailyStreak(s) ? 1 : 0) || 1;
  const boostActive = s.activeBoost && s.activeBoost.expiresAt > t;

  return (
    <div class="card">
      <div class="card-header"><span class="ch-icon">🎁</span>DAILY & BOOSTS</div>
      <div class="list-row">
        <span>🎁 Daily Streak — Day {day}/7 {s.dailyStreak.shieldAvailable ? '· 🛡️ shield ready' : ''}</span>
        <button class="btn btn-primary" disabled={!canClaimDailyStreak(s)} onClick={() => claimDailyStreak()}>
          {canClaimDailyStreak(s) ? 'CLAIM' : 'DONE'}
        </button>
      </div>
      <div class="list-row">
        <span>🚀 Boost Tokens — {s.boostTokens} available {boostActive ? `· ACTIVE ${formatDuration((s.activeBoost?.expiresAt ?? 0) - t)}` : ''}</span>
        <button class="btn btn-primary" disabled={s.boostTokens <= 0 || !!boostActive} onClick={() => useBoostToken()}>USE</button>
      </div>
    </div>
  );
}
