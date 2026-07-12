import { useRef, useState } from 'preact/hooks';
import { store, clockTick } from '../engine/store';
import { STATIONS } from '../config/stations';
import { MARKET_EVENTS_BY_ID } from '../config/events';
import { travelDurationMs, canSkipTravel } from '../engine/derived';
import { startJump, completeJump, canEnterNextSector, nextSectorToll, payGateToll } from '../engine/actions';
import { sectorUnlockRank } from '../engine/formulas';
import { bestRoute, goodById } from '../engine/pricing';
import { formatCredits, formatDuration, formatPct } from '../engine/num';
import { dressStationForSector } from '../engine/sectorgen';
import { now } from '../engine/time';

export function MapScreen({ onHyperspace, onArrive }: { onHyperspace: (active: boolean) => void; onArrive: () => void }) {
  const s = store.value;
  void clockTick.value;
  const [selected, setSelected] = useState<string | null>(null);
  const [traveling, setTraveling] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = now();

  const positioned = STATIONS.map((st, i) => {
    const angle = (i / STATIONS.length) * Math.PI * 2 - Math.PI / 2;
    const r = 42;
    return { st, x: 50 + r * Math.cos(angle), y: 50 + r * Math.sin(angle) };
  });

  // Market Scanner III — spec §8: "Scanner III makes the best-margin route glow."
  const scannerLvl = s.shipUpgrades.market_scanner ?? 0;
  const route = scannerLvl >= 3 ? bestRoute(s) : null;
  const routeGood = route ? goodById(route.goodId) : null;

  function eventsFor(stationId: string) {
    return s.activeEvents.filter((e) => e.stationId === stationId && e.expiresAt > t);
  }

  function beginJump(stationId: string) {
    const res = startJump(stationId);
    if (!res.ok) return;
    setSelected(null);
    setTraveling(stationId);
    onHyperspace(true);
    const dur = travelDurationMs(s);
    timeoutRef.current = setTimeout(() => finish(stationId), dur);
  }

  function finish(stationId: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    completeJump(stationId);
    setTraveling(null);
    onHyperspace(false);
    onArrive();
  }

  const selectedStation = selected ? STATIONS.find((x) => x.id === selected) : null;
  const dest = s.sector + 1;
  const gateReady = canEnterNextSector(s);
  const toll = nextSectorToll(s);

  return (
    <>
    <div class="screen">
      <div class="screen-header">
        <span class="icon">🗺️</span>
        <div>
          <h1>The Drift</h1>
          <div class="sub">Sector {s.sector} · {s.fuel < 1 ? 'Out of fuel' : `${Math.floor(s.fuel)} ⛽ ready`}</div>
        </div>
      </div>

      <div class="map-wrap">
        <div class="map-ring">
          {positioned.map(({ st, x, y }) => {
            const locked = st.unlockRank > s.rank;
            const evs = eventsFor(st.id);
            const dressing = dressStationForSector(st.id, s.sector);
            const isBestRoute = route?.stationId === st.id;
            return (
              <button
                key={st.id}
                class={`station-node${st.id === s.currentStation ? ' current' : ''}${locked ? ' locked' : ''}${isBestRoute ? ' best-route' : ''}`}
                style={{ left: `${x}%`, top: `${y}%` }}
                onClick={() => !locked && st.id !== s.currentStation && setSelected(st.id)}
              >
                {evs.length > 0 && <span class="node-event">{evs.length}📈</span>}
                {isBestRoute && <span class="node-route">📡</span>}
                <span>{st.icon}</span>
                <span class="node-label">{dressing.name || st.name}{locked ? ` R${st.unlockRank}` : ''}</span>
              </button>
            );
          })}
          <div class="gate-node" onClick={() => gateReady && payGateToll()}>
            🌀
            <div class="gate-toll">
              {gateReady ? `SECTOR ${dest}\n${formatCredits(toll)}` : `Rank ${sectorUnlockRank(dest)}`}
            </div>
          </div>
        </div>
        {route && routeGood && (
          <div class="route-hint">
            📡 Best route: <b>{STATIONS.find((x) => x.id === route.stationId)?.name}</b> — {routeGood.icon} {routeGood.name} {formatPct(route.margin, { signed: true })}
          </div>
        )}
      </div>

      <div class="section-label">Active Signals</div>
      {s.activeEvents.filter((e) => e.expiresAt > t).length === 0 && <div class="empty-hint">Nothing spiking right now. Fly and find out.</div>}
      {s.activeEvents.filter((e) => e.expiresAt > t).map((e) => {
        const st = STATIONS.find((x) => x.id === e.stationId);
        const def = MARKET_EVENTS_BY_ID[e.kind];
        const good = e.goodId ? goodById(e.goodId) : null;
        const dressing = st ? dressStationForSector(st.id, s.sector) : null;
        const stationName = dressing?.name || st?.name || '?';
        const desc = def
          ? def.copyTemplate
              .replace('{station}', stationName)
              .replace('{good}', good?.name ?? 'everything')
              .replace('{mult}', e.multiplier.toFixed(1)) // templates already carry a literal × before {mult}
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

    </div>
    {/* Rendered as siblings of .screen, not nested inside it — see the same note in
        MarketScreen.tsx. Nested here, both the confirm-jump sheet and the hyperspace
        travel overlay (with its SKIP button) would anchor to .screen's scrolled content
        and land off-screen whenever this list was scrolled down before opening them. */}
    {selectedStation && (
      <div class="sheet-backdrop" onClick={() => setSelected(null)}>
        <div class="sheet" onClick={(e) => e.stopPropagation()}>
          <div class="sheet-handle" />
          <div class="sheet-title"><span>{selectedStation.icon}</span><span>Jump to {selectedStation.name}</span></div>
          <div class="sheet-sub">{selectedStation.blurb}</div>
          <div class="pl-line"><span>Fuel cost</span><span class="val mono">1 ⛽ ({Math.floor(s.fuel)} available)</span></div>
          <div class="pl-line"><span>Travel time</span><span class="val mono">{(travelDurationMs(s) / 1000).toFixed(0)}s</span></div>
          <button class="btn btn-block btn-primary" style={{ marginTop: 10 }} disabled={s.fuel < 1} onClick={() => beginJump(selectedStation.id)}>
            {s.fuel < 1 ? 'OUT OF FUEL' : 'CONFIRM JUMP'}
          </button>
        </div>
      </div>
    )}

    {traveling && (
      <div class="hyperspace-overlay">
        <div style={{ fontSize: 40 }}>🌌</div>
        <div class="hs-label">JUMPING TO {STATIONS.find((x) => x.id === traveling)?.name.toUpperCase()}…</div>
        {canSkipTravel(s) && <button class="btn btn-ghost" onClick={() => finish(traveling)}>SKIP ▶</button>}
      </div>
    )}
    </>
  );
}
