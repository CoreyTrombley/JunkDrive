import { useEffect, useRef, useState } from 'preact/hooks';
import { store, clockTick, getState } from '../engine/store';
import { STATIONS, STATIONS_BY_ID } from '../config/stations';
import { travelDurationMs, canSkipTravel } from '../engine/derived';
import { startJump, completeJump, refundFuel } from '../engine/actions';
import { bestRoute, goodById } from '../engine/pricing';
import { generateSectorMap, nodeById, type MapNode } from '../engine/mapgen';
import { routeThrough } from '../engine/routing';
import { formatPct } from '../engine/num';
import { dressStationForSector, stationDisplayName } from '../engine/sectorgen';
import { now } from '../engine/time';
import { emit } from '../engine/bus';
import type { MapSubId } from './nav';
import { SubHeader } from './SubHeader';
import { ContractsScreen } from './ContractsScreen';
import { SignalsScreen } from './SignalsScreen';

export function MapScreen({ sub, openSub, closeSub, onHyperspace, onArrive }: { sub: MapSubId | null; openSub: (id: MapSubId) => void; closeSub: () => void; onHyperspace: (active: boolean) => void; onArrive: () => void }) {
  const s = store.value;
  void clockTick.value;
  const map = generateSectorMap(s.sector, s.runSeed ?? 0);
  const [stops, setStops] = useState<string[]>([]);
  const [traveling, setTraveling] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hopDoneRef = useRef<(() => void) | null>(null);
  const inFlightFuelRef = useRef(0);

  // If the user leaves the Map mid-route, drop the pending hop: the ship simply
  // stays at its last committed node. Without this, the stale timeout would fire
  // after unmount, mutate state, and snap the user back to the market tab. A hop
  // cancelled this way never arrives, so its fuel spend is refunded.
  useEffect(() => () => {
    if (timeoutRef.current) refundFuel(inFlightFuelRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    hopDoneRef.current = null;
    onHyperspace(false);
  }, []);

  if (sub) {
    return (
      <div class="screen anim-slide" key={sub}>
        <SubHeader
          icon={sub === 'contracts' ? '⚡' : '📈'}
          title={sub === 'contracts' ? 'Contracts' : 'Signals'}
          onBack={closeSub}
        />
        {sub === 'contracts' ? <ContractsScreen /> : <SignalsScreen />}
      </div>
    );
  }

  const t = now();

  const scannerLvl = s.shipUpgrades.market_scanner ?? 0;
  const hint = scannerLvl >= 3 ? bestRoute(s) : null;
  const hintGood = hint ? goodById(hint.goodId) : null;

  const blocked = new Set(STATIONS.filter((st) => st.unlockRank > s.rank).map((st) => st.id));
  const plan = stops.length ? routeThrough(map, [s.currentStation, ...stops], blocked) : null;

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
      inFlightFuelRef.current = 0;
      setTraveling(null);
      setStops([]);
      onHyperspace(false);
      onArrive();
    };

    const runHop = (i: number) => {
      if (i >= path.length) return finish();
      const target = path[i];
      const res = startJump(target);
      if (!res.ok) {
        emit({ type: 'toast', text: `Route interrupted — ${res.reason ?? 'no lane'}`, icon: '🛑' });
        return finish();
      }
      inFlightFuelRef.current = res.lane?.fuel ?? 0;
      setTraveling(target);
      const dur = travelDurationMs(getState()) * (res.lane?.trait === 'express' ? 0.5 : 1);
      const complete = () => {
        timeoutRef.current = null;
        hopDoneRef.current = null;
        inFlightFuelRef.current = 0;
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
    <div class="screen anim-fade">
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

      {(() => {
        const liveManifests = s.manifests.filter((m) => m.expiresAt > t);
        const readyHere = liveManifests.some((m) => s.currentStation === m.stationId && m.items.every((it) => (s.cargo[it.goodId]?.qty ?? 0) >= it.qty));
        return (
          <div class="pill-row">
            <button class={`pill-btn${readyHere ? ' alert' : ''}`} onClick={() => openSub('contracts')}>
              ⚡ Contracts <span class="pill-count">({liveManifests.length}{readyHere ? ' · ready!' : ''})</span>
            </button>
            <button class="pill-btn" onClick={() => openSub('signals')}>
              📈 Signals <span class="pill-count">({liveEvents.length})</span>
            </button>
          </div>
        );
      })()}
    </div>

    {traveling && (
      <div class="hyperspace-overlay">
        <div style={{ fontSize: 40 }}>🌌</div>
        <div class="hs-label">JUMPING TO {(() => {
          const n = nodeById(map, traveling);
          const label = n?.kind === 'station' ? stationDisplayName(n.id, s.sector, s.runSeed ?? 0) : n?.name ?? '';
          return label.toUpperCase();
        })()}…</div>
        {canSkipTravel(s) && <button class="btn btn-ghost" onClick={skipHop}>SKIP ▶</button>}
      </div>
    )}
    </>
  );
}
