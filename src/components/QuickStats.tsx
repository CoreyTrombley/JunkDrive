import { store, clockTick } from '../engine/store';
import { xpToNext, titleForRank } from '../config/ranks';
import { resonanceNeeded, SECTOR_CAP } from '../engine/formulas';
import { canClaimDailyStreak } from '../engine/actions';
import { formatDuration, formatNum } from '../engine/num';
import { now } from '../engine/time';

export function QuickStats() {
  const s = store.value;
  void clockTick.value;
  const t = now();
  const need = xpToNext(s.rank);
  const xpPct = Math.min(100, (s.xp / need) * 100);
  const gateNeed = s.sector < SECTOR_CAP ? resonanceNeeded(s.sector + 1) : 0;
  const boostActive = s.activeBoost && s.activeBoost.expiresAt > t;
  const day = ((s.dailyStreak.count) % 7) + (canClaimDailyStreak(s) ? 1 : 0) || 1;
  const liveEvents = s.activeEvents.filter((e) => e.expiresAt > t).length;

  return (
    <div class="quickstats">
      <div class="qs-row">
        <span class="qs-label">Rank {s.rank} · {titleForRank(s.rank)}</span>
        <div class="qs-bar"><div class="qs-fill" style={{ width: `${xpPct}%` }} /></div>
        <span class="mono" style={{ fontSize: 10.5 }}>{formatNum(s.xp)}/{formatNum(need)}</span>
      </div>
      {gateNeed > 0 && (
        <div class="qs-row">
          <span class="qs-label">Gate Resonance</span>
          <span class="mono">⚡ {formatNum(s.gateResonance)}/{formatNum(gateNeed)}</span>
        </div>
      )}
      <div class="qs-row">
        <span class="qs-label">Boost</span>
        <span class="mono">{boostActive ? `🚀 ${formatDuration((s.activeBoost?.expiresAt ?? 0) - t)} left` : s.boostTokens > 0 ? `${s.boostTokens} token${s.boostTokens === 1 ? '' : 's'} ready` : '—'}</span>
      </div>
      <div class="qs-row">
        <span class="qs-label">Daily Streak</span>
        <span class="mono">🎁 Day {day}/7{s.dailyStreak.shieldAvailable ? ' · 🛡️' : ''}</span>
      </div>
      <div class="qs-row">
        <span class="qs-label">Market Signals</span>
        <span class="mono">📈 {liveEvents} active</span>
      </div>
    </div>
  );
}
