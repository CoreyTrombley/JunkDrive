import { store, clockTick } from '../engine/store';
import { STATIONS_BY_ID } from '../config/stations';
import { MARKET_EVENTS_BY_ID } from '../config/events';
import { goodById } from '../engine/pricing';
import { formatDuration } from '../engine/num';
import { dressStationForSector } from '../engine/sectorgen';
import { now } from '../engine/time';

export function SignalsScreen() {
  const s = store.value;
  void clockTick.value;
  const t = now();
  const liveEvents = s.activeEvents.filter((e) => e.expiresAt > t);

  return (
    <>
      {liveEvents.length === 0 && <div class="empty-hint">Nothing spiking right now. Fly and find out.</div>}
      {liveEvents.map((e) => {
        const st = STATIONS_BY_ID[e.stationId];
        const def = MARKET_EVENTS_BY_ID[e.kind];
        const good = e.goodId ? goodById(e.goodId) : null;
        const dressing = st ? dressStationForSector(st.id, s.sector, s.runSeed ?? 0) : null;
        const stationName = dressing?.name || st?.name || '?';
        const desc = def
          ? def.copyTemplate.replace('{station}', stationName).replace('{good}', good?.name ?? 'everything').replace('{mult}', e.multiplier.toFixed(1))
          : '';
        const direction = e.disables ? 'blocked' : e.multiplier >= 1 ? 'up' : 'down';
        return (
          <div key={e.id} class={`signal-row ${direction}`}>
            <div class="signal-icon">{def?.icon ?? '📡'}</div>
            <div class="signal-body">
              <div class="signal-title">
                {def?.name ?? 'MARKET SIGNAL'}
                <span class="signal-loc"> · {st?.icon} {stationName}{st?.id === s.currentStation ? ' (here)' : ''}</span>
              </div>
              <div class="signal-desc">{desc}</div>
            </div>
            <div class="signal-meta">
              <span class={`signal-badge ${direction}`}>{e.disables ? '🚫 BLOCKED' : `${e.multiplier >= 1 ? '▲' : '▼'} ×${e.multiplier.toFixed(1)}`}</span>
              <span class="signal-timer mono">⏱ {formatDuration(e.expiresAt - t)}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}
