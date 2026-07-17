import { useState } from 'preact/hooks';
import { store } from '../engine/store';
import { getPrice } from '../engine/pricing';
import { maxHold, usedHold, freeCapacityUnits } from '../engine/derived';
import { formatCredits, formatSignedCredits, formatNum } from '../engine/num';
import { buyGood, sellGood } from '../engine/actions';
import type { Good } from '../config/types';

interface Props {
  good: Good;
  mode: 'buy' | 'sell';
  onClose: () => void;
}

export function TradeSheet({ good, mode, onClose }: Props) {
  const s = store.value;
  const price = getPrice(s, s.currentStation, good.id);
  const entry = s.cargo[good.id];
  const owned = entry?.qty ?? 0;
  const maxQty = mode === 'buy'
    ? Math.max(0, Math.min(freeCapacityUnits(s, good.id), Math.floor(s.credits / Math.max(0.01, price))))
    : owned;

  const [qty, setQty] = useState(Math.min(Math.max(1, maxQty), Math.max(1, maxQty)));
  const clampedQty = Math.max(0, Math.min(qty, Math.max(maxQty, 0)));

  const totalCost = price * clampedQty;
  const profit = mode === 'sell' && entry ? (price - entry.avgCost) * clampedQty : 0;

  function commit() {
    if (clampedQty <= 0) return;
    const result = mode === 'buy' ? buyGood(good.id, clampedQty) : sellGood(good.id, clampedQty);
    if (result.ok) onClose();
  }

  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-handle" />
        <div class="sheet-title">
          <span>{good.icon}</span>
          <span>{mode === 'buy' ? 'Buy' : 'Sell'} {good.name}</span>
        </div>
        <div class="sheet-sub mono">
          {formatCredits(price)} / unit{` · ${good.mass}m³/unit`} {good.contraband ? '· ⚠️ CONTRABAND' : ''}
          {mode === 'sell' && entry ? ` · avg cost ${formatCredits(entry.avgCost)}` : ''}
        </div>

        <div class="stepper">
          <button onClick={() => setQty((q) => Math.max(0, q - 1))}>−</button>
          <input
            type="range"
            min={0}
            max={Math.max(maxQty, 0)}
            step={Math.max(1, Math.floor(Math.max(maxQty, 0) / 1000))}
            value={clampedQty}
            onInput={(e) => setQty(Number((e.target as HTMLInputElement).value))}
          />
          <button onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>+</button>
          <div class="qty-display mono">{formatNum(clampedQty)}</div>
        </div>
        <div class="pct-row">
          {[0.25, 0.5, 0.75, 1].map((pct) => {
            const n = Math.max(0, Math.floor(maxQty * pct));
            return (
              <button
                key={pct}
                class={`btn btn-ghost pct-btn${clampedQty === n && n > 0 ? ' active' : ''}`}
                disabled={maxQty <= 0}
                onClick={() => setQty(n)}
              >
                <span class="pct-label">{Math.round(pct * 100)}%</span>
                <span class="pct-count mono">{formatNum(n)}</span>
              </button>
            );
          })}
        </div>

        <div class="pl-line">
          <span>{mode === 'buy' ? 'Total cost' : 'Total revenue'}</span>
          <span class="val mono">{formatCredits(totalCost)}</span>
        </div>
        {mode === 'sell' && (
          <div class="pl-line">
            <span>Profit</span>
            <span class={`val mono ${profit >= 0 ? 'profit' : 'loss'}`}>{formatSignedCredits(profit)}</span>
          </div>
        )}
        {mode === 'buy' && (
          <div class="pl-line">
            <span>Cargo hold</span>
            <span class="val mono">{formatNum(usedHold(s) + clampedQty * good.mass)}m³ / {formatNum(maxHold(s))}m³</span>
          </div>
        )}

        <button
          class={`btn btn-block ${mode === 'buy' ? 'btn-buy' : 'btn-sell'}`}
          disabled={clampedQty <= 0}
          onClick={commit}
          style={{ marginTop: 10 }}
        >
          {mode === 'buy' ? `BUY ${clampedQty}` : `SELL ${clampedQty}`}
        </button>
      </div>
    </div>
  );
}
