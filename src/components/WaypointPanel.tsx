import { useState } from 'preact/hooks';
import { store, clockTick } from '../engine/store';
import type { MapNode } from '../engine/mapgen';
import { goodById, getPrice } from '../engine/pricing';
import { buyFuelPip, claimSalvage, payGateToll, canEnterNextSector, nextSectorToll } from '../engine/actions';
import { sectorUnlockRank } from '../engine/formulas';
import { maxFuel, netWorth } from '../engine/derived';
import { formatCredits, formatNum, formatDuration } from '../engine/num';
import { TradeSheet } from './TradeSheet';
import type { Good } from '../config/types';
import { now } from '../engine/time';

export function WaypointPanel({ node }: { node: MapNode }) {
  const s = store.value;
  void clockTick.value;
  const [sheet, setSheet] = useState<{ good: Good; mode: 'buy' | 'sell' } | null>(null);
  const t = now();

  return (
    <>
    <div class="screen">
      <div class="screen-header">
        <span class="icon">{node.icon}</span>
        <div>
          <h1>{node.name}</h1>
          <div class="sub">
            {node.kind === 'outpost' && 'A dim little trade post. No questions, no scans.'}
            {node.kind === 'depot' && 'Fuel by the pip. Prices float with your reputation.'}
            {node.kind === 'salvage' && 'Debris field. Something useful drifts by now and then.'}
            {node.kind === 'beacon' && 'A lonely nav beacon, humming to itself.'}
            {node.kind === 'gate' && 'The way deeper. It costs what it costs.'}
          </div>
        </div>
      </div>

      {node.kind === 'outpost' && (node.goodIds ?? []).map((gid) => {
        const g = goodById(gid, s.runSeed ?? 0);
        if (!g) return null;
        if (g.unlockRank > s.rank) return null;
        const price = getPrice(s, s.currentStation, gid);
        const owned = s.cargo[gid]?.qty ?? 0;
        return (
          <div key={gid} class="good-row">
            <div class="g-icon">{g.icon}</div>
            <div class="g-main">
              <div class="g-name">{g.name}</div>
              <div class="g-price-line"><span class="g-price mono">{formatCredits(price)}</span></div>
              <div class="g-owned">{owned > 0 ? `Owned: ${formatNum(owned)} · ` : ''}{g.mass}t</div>
            </div>
            <div class="g-actions">
              <button class="btn btn-buy" onClick={() => setSheet({ good: g, mode: 'buy' })}>BUY</button>
              <button class="btn btn-sell" disabled={owned <= 0} onClick={() => setSheet({ good: g, mode: 'sell' })}>SELL</button>
            </div>
          </div>
        );
      })}

      {node.kind === 'depot' && (
        <div class="more-section">
          <div class="list-row">
            <span>⛽ {Math.floor(s.fuel)}/{maxFuel(s)} — pip price {formatCredits(Math.max(50, netWorth(s) * 0.02))}</span>
            <button class="btn btn-primary" disabled={s.fuel >= maxFuel(s)} onClick={() => buyFuelPip()}>BUY FUEL</button>
          </div>
        </div>
      )}

      {node.kind === 'salvage' && (() => {
        const last = s.lastSalvageAt[s.currentStation] ?? 0;
        const readyIn = last + 10 * 60_000 - t;
        return (
          <div class="more-section">
            <div class="list-row">
              <span>🛠️ {readyIn > 0 ? `Field regenerating — ${formatDuration(readyIn)}` : 'Something glints in the debris…'}</span>
              <button class="btn btn-primary" disabled={readyIn > 0} onClick={() => claimSalvage()}>GRAB</button>
            </div>
          </div>
        );
      })()}

      {node.kind === 'gate' && (
        <div class="more-section">
          {canEnterNextSector(s) ? (
            <div class="list-row">
              <span>🌀 Sector {s.sector + 1} — toll {formatCredits(nextSectorToll(s))}</span>
              <button class="btn btn-primary" disabled={s.credits < nextSectorToll(s)} onClick={() => payGateToll()}>PAY TOLL</button>
            </div>
          ) : (
            <div class="empty-hint">The gate ignores you. Reach Rank {sectorUnlockRank(s.sector + 1)}.</div>
          )}
        </div>
      )}

      {node.kind === 'beacon' && <div class="empty-hint">Nothing to trade. But you were here, and the beacon knows it.</div>}
    </div>
    {sheet && <TradeSheet good={sheet.good} mode={sheet.mode} onClose={() => setSheet(null)} />}
    </>
  );
}
