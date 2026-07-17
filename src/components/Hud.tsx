import { useEffect, useState } from 'preact/hooks';
import { store, clockTick } from '../engine/store';
import { maxFuel, fuelRegenSec } from '../engine/derived';
import { formatCredits, formatDuration } from '../engine/num';
import { titleForRank } from '../config/ranks';
import { STATIONS_BY_ID } from '../config/stations';
import { goodById } from '../engine/pricing';
import { canClaimDailyStreak } from '../engine/actions';
import { stationDisplayName } from '../engine/sectorgen';

export function Hud({ onOpenTicker }: { onOpenTicker?: () => void }) {
  const s = store.value;
  void clockTick.value; // subscribe to the 250ms clock for live countdowns

  const mf = maxFuel(s);
  const fuelFull = Math.floor(s.fuel);
  const t = Date.now();

  const regenSec = fuelRegenSec(s);
  const fracToNextPip = s.fuel < mf ? s.fuel - Math.floor(s.fuel) : 1;
  const secToNextPip = s.fuel < mf ? Math.max(0, Math.round(regenSec * (1 - fracToNextPip))) : 0;

  const tickerItems: string[] = [];
  if (s.fuel < mf) tickerItems.push(`⛽ next pip in ${formatDuration(secToNextPip * 1000)}`);
  const questReady = s.quests.some((q) => q.progress >= q.goal);
  if (questReady) tickerItems.push('✅ A quest is ready to claim!');
  if (s.boostTokens > 0) tickerItems.push(`🚀 ${s.boostTokens} Boost Token${s.boostTokens > 1 ? 's' : ''} ready — MORE tab`);
  const readyManifest = s.manifests?.find((m) => m.expiresAt > t && s.currentStation === m.stationId && m.items.every((it) => (s.cargo[it.goodId]?.qty ?? 0) >= it.qty));
  if (readyManifest) tickerItems.push('📦 Contract ready to deliver HERE — MAP tab');
  if (canClaimDailyStreak(s)) tickerItems.push('🎁 Daily crate ready — MORE tab');
  for (const ev of s.activeEvents.filter((e) => e.expiresAt > t).slice(0, 3)) {
    const station = STATIONS_BY_ID[ev.stationId];
    const good = ev.goodId ? goodById(ev.goodId) : null;
    const label = good ? `${good.icon} ${good.name}` : 'Everything';
    tickerItems.push(`📈 ${label} ${ev.disables ? 'blocked' : `×${ev.multiplier.toFixed(1)}`} @ ${station ? stationDisplayName(station.id, s.sector, s.runSeed ?? 0) : '?'} — ${formatDuration(ev.expiresAt - t)}`);
  }
  if (tickerItems.length === 0) tickerItems.push('🛰️ All quiet in The Drift…');

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => i + 1), 3500);
    return () => clearInterval(id);
  }, []);

  const tickerText = tickerItems[idx % tickerItems.length];

  return (
    <div class="hud">
      <div class="hud-row">
        <div class="hud-credits mono">{formatCredits(s.credits)}</div>
        <div class="hud-mid">
          <div class="hud-fuel mono">
            ⛽{' '}
            {mf >= 10 ? (
              <div class="fuel-bar-wrap">
                <div class="fuel-bar-track">
                  <div class="fuel-bar-fill" style={{ width: `${Math.min(100, Math.max(0, (s.fuel / mf) * 100))}%` }} />
                </div>
                <span class="fuel-bar-label">{fuelFull}/{mf}</span>
              </div>
            ) : (
              Array.from({ length: Math.max(mf, 1) }, (_, i) => (
                <span key={i} class={`fuel-pip${i < fuelFull ? ' full' : ''}`} />
              ))
            )}
          </div>
        </div>
        <div class="hud-rank" title={titleForRank(s.rank)}>
          R{s.rank}
        </div>
      </div>
      <div class="ticker" onClick={onOpenTicker}>{tickerText}</div>
    </div>
  );
}
