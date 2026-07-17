import { useRef, useState } from 'preact/hooks';
import { store, clockTick, getState } from '../engine/store';
import { STATIONS_BY_ID } from '../config/stations';
import { MARKET_EVENTS_BY_ID } from '../config/events';
import { travelDurationMs, canSkipTravel } from '../engine/derived';
import { startJump, completeJump } from '../engine/actions';
import { bestRoute, goodById } from '../engine/pricing';
import { generateSectorMap, nodeById, GATE_NODE_ID, type MapNode } from '../engine/mapgen';
import { routeThrough } from '../engine/routing';
import { formatCredits, formatDuration, formatPct } from '../engine/num';
import { dressStationForSector, stationDisplayName } from '../engine/sectorgen';
import { ContractsPanel } from './ContractsPanel';
import { now } from '../engine/time';

export function MapScreen({ onHyperspace, onArrive }: { onHyperspace: (active: boolean) => void; onArrive: () => void }) {
  const s = store.value;
  void clockTick.value;
  const map = generateSectorMap(s.sector, s.runSeed ?? 0);
  const [stops, setStops] = useState<string[]>([]);
  const [traveling, setTraveling] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hopDoneRef = useRef<(() => void) | null>(null);
  const t = now();

  const scannerLvl = s.shipUpgrades.market_scanner ?? 0;
  const hint = scannerLvl >= 3 ? bestRoute(s) : null;
  const hintGood = hint ? goodById(hint.goodId) : null;

  const plan = stops.length ? routeThrough(map, [s.currentStation, ...stops]) : null;

  function nodeLabel(node: MapNode): string {
    if (node.kind === 'station') {
      const dressing = dressStationForSector(node.id, s.sector, s.runSeed ?? 0);
      const st = STATIONS_BY_ID[node.id];
      const locked = st && st.unlockRank > s.rank;
      return `${dressing.name || node.name}${locked ? ` R${st.unlockRank}` : ''}`;
    }
    return node.name;
  }

  function toggleStop(nodeId: string) {
    if (traveling || nodeId === s.currentStation) return;
    const st = STATIONS_BY_ID[nodeId];
    if (st && st.unlockRank > s.rank) return;
    setStops((prev) => (prev.includes(nodeId) ? prev.filter((x) => x !== nodeId) : [...prev, nodeId]));
  }

  function go() {
    const current = plan;
    if (!current || traveling) return;
    const path = current.path;
    onHyperspace(true);

    const finish = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      hopDoneRef.current = null;
      setTraveling(null);
      setStops([]);
      onHyperspace(false);
      onArrive();
    };

    const runHop = (i: number) => {
      if (i >= path.length) return finish();
      const target = path[i];
      const res = startJump(target);
      if (!res.ok) return finish();
      setTraveling(target);
      const dur = travelDurationMs(getState()) * (res.lane?.trait === 'express' ? 0.5 : 1);
      const complete = () => {
        timeoutRef.current = null;
        hopDoneRef.current = null;
        completeJump(target, { finalStop: i === path.length - 1, laneTrait: res.lane?.trait });
        if (getState().pendingEncounter) return finish(); // ambushed — route aborts here
        runHop(i + 1);
      };
      hopDoneRef.current = complete;
      timeoutRef.current = setTimeout(complete, dur);
    };
    runHop(1);
  }

  function skipHop() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    hopDoneRef.current?.();
  }

  const liveEvents = s.activeEvents.filter((e) => e.expiresAt > t);

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
        <div class="lane-map">
          <svg class="lane-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            {map.lanes.map((l) => {
              const a = nodeById(map, l.a)!;
              const b = nodeById(map, l.b)!;
              return <line key={`${l.a}|${l.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} class={`lane ${l.trait}${l.fuel > 1 ? ' long' : ''}`} />;
            })}
          </svg>
          {map.nodes.map((node) => {
            const st = node.kind === 'station' ? STATIONS_BY_ID[node.id] : undefined;
            const locked = !!st && st.unlockRank > s.rank;
            const evs = liveEvents.filter((e) => e.stationId === node.id);
            const stopIdx = stops.indexOf(node.id);
            const isHint = hint?.stationId === node.id;
            return (
              <button
                key={node.id}
                class={`station-node ${node.kind}${node.id === s.currentStation ? ' current' : ''}${locked ? ' locked' : ''}${stopIdx >= 0 ? ' queued' : ''}${isHint ? ' best-route' : ''}`}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                onClick={() => toggleStop(node.id)}
              >
                {evs.length > 0 && <span class="node-event">{evs.length}📈</span>}
                {stopIdx >= 0 && <span class="node-stop">{stopIdx + 1}</span>}
                {isHint && <span class="node-route">📡</span>}
                <span>{node.icon}</span>
                <span class="node-label">{nodeLabel(node)}</span>
              </button>
            );
          })}
        </div>

        {plan && (
          <div class="route-bar">
            <span class="mono">
              {plan.path.length - 1} hop{plan.path.length !== 2 ? 's' : ''} · {plan.fuel}⛽{plan.pirates > 0 ? ` · ${plan.pirates}☠` : ''}
            </span>
            <button class="btn btn-ghost" onClick={() => setStops([])}>CLEAR</button>
            <button class="btn btn-primary" disabled={!!traveling || s.fuel < plan.fuel} onClick={go}>
              {s.fuel < plan.fuel ? 'NOT ENOUGH FUEL' : 'GO'}
            </button>
          </div>
        )}
        {!plan && <div class="empty-hint" style={{ textAlign: 'center' }}>Tap nodes to plot a route — order matters.</div>}

        {hint && hintGood && (
          <div class="route-hint">
            📡 Best flip: <b>{stationDisplayName(hint.stationId, s.sector, s.runSeed ?? 0)}</b> — {hintGood.icon} {hintGood.name} {formatPct(hint.margin, { signed: true })}
          </div>
        )}
      </div>

      <ContractsPanel />

      <div class="section-label">Active Signals</div>
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
    </div>

    {traveling && (
      <div class="hyperspace-overlay">
        <div style={{ fontSize: 40 }}>🌌</div>
        <div class="hs-label">JUMPING TO {nodeById(map, traveling)?.name.toUpperCase()}…</div>
        {canSkipTravel(s) && <button class="btn btn-ghost" onClick={skipHop}>SKIP ▶</button>}
      </div>
    )}
    </>
  );
}
