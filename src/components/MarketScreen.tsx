import { useState } from 'preact/hooks';
import { store, clockTick } from '../engine/store';
import { STATIONS_BY_ID } from '../config/stations';
import { goodsCatalogForState, getPrice, isTradeDisabled } from '../engine/pricing';
import { formatCredits, formatNum, formatPct } from '../engine/num';
import { VOLATILITY_BANDS, sectorScale } from '../engine/price';
import { TradeSheet } from './TradeSheet';
import type { Good } from '../config/types';
import { now } from '../engine/time';

function Sparkline({ history, volatility }: { history: number[]; volatility: keyof typeof VOLATILITY_BANDS }) {
  const band = VOLATILITY_BANDS[volatility];
  return (
    <div class="sparkline">
      {history.map((v, i) => {
        const pct = Math.max(0.08, (v - band.min) / (band.max - band.min));
        return <i key={i} style={{ height: `${Math.round(pct * 100)}%` }} />;
      })}
    </div>
  );
}

export function MarketScreen() {
  const s = store.value;
  void clockTick.value;
  const [sheet, setSheet] = useState<{ good: Good; mode: 'buy' | 'sell' } | null>(null);
  const station = STATIONS_BY_ID[s.currentStation];
  const t = now();

  const goods = goodsCatalogForState(s)
    .filter((g) => g.tier >= station.minGoodTier)
    .sort((a, b) => a.unlockRank - b.unlockRank || a.base - b.base);

  return (
    <>
    <div class="screen">
      <div class="screen-header">
        <span class="icon">{station.icon}</span>
        <div>
          <h1>{station.name}</h1>
          <div class="sub">{station.blurb}</div>
        </div>
      </div>

      <div class="section-label">Goods</div>
      {goods.map((g) => {
        const locked = g.unlockRank > s.rank;
        const price = locked ? 0 : getPrice(s, s.currentStation, g.id);
        const neutral = g.base * sectorScale(s.sector);
        const pct = neutral > 0 ? price / neutral - 1 : 0;
        const owned = s.cargo[g.id]?.qty ?? 0;
        const wave = s.waves[g.id];
        const disabled = isTradeDisabled(s.activeEvents, s.currentStation, g.id, t);

        return (
          <div key={g.id} class={`good-row${locked ? ' locked' : ''}`}>
            <div class="g-icon">{locked ? '🔒' : g.icon}</div>
            <div class="g-main">
              <div class="g-name">
                {g.name} {g.contraband && !locked && <span class="g-contraband">⚠ ILLEGAL</span>}
              </div>
              {locked ? (
                <div class="g-owned">Unlocks at Rank {g.unlockRank}</div>
              ) : (
                <>
                  <div class="g-price-line">
                    <span class="g-price mono">{formatCredits(price)}</span>
                    <span class={`g-badge ${pct >= 0 ? 'up' : 'down'}`}>{pct >= 0 ? '▲' : '▼'} {formatPct(Math.abs(pct))}</span>
                  </div>
                  {wave && <Sparkline history={wave.history} volatility={g.volatility} />}
                  <div class="g-owned">{owned > 0 ? `Owned: ${formatNum(owned)}` : disabled ? 'Embargoed here' : ' '}</div>
                </>
              )}
            </div>
            {!locked && (
              <div class="g-actions">
                <button class="btn btn-buy" disabled={disabled} onClick={() => setSheet({ good: g, mode: 'buy' })}>BUY</button>
                <button class="btn btn-sell" disabled={disabled || owned <= 0} onClick={() => setSheet({ good: g, mode: 'sell' })}>SELL</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
    {/* Rendered as a sibling of .screen, not nested inside it — .screen scrolls and is
        position:relative, so a position:absolute sheet nested inside it would anchor to
        the scrolled content instead of the viewport, landing off-screen when the list is
        scrolled down. Being a sibling anchors it to .app-shell instead, which never scrolls. */}
    {sheet && <TradeSheet good={sheet.good} mode={sheet.mode} onClose={() => setSheet(null)} />}
    </>
  );
}
