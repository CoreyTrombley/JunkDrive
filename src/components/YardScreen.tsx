import { useState } from 'preact/hooks';
import { store, clockTick } from '../engine/store';
import { RIGS } from '../config/rigs';
import {
  rigUnitCost, rigBatchCost, maxAffordableRigQty, milestoneMultiplier, nextMilestone,
  totalYardRatePerSec, globalIncomeMult,
} from '../engine/formulas';
import { buyRig, hireManager, tapRig } from '../engine/actions';
import { formatCredits, formatNum } from '../engine/num';
import { now } from '../engine/time';

type BuyMode = '1' | '10' | '100' | 'max';

export function YardScreen() {
  const s = store.value;
  void clockTick.value;
  const [mode, setMode] = useState<BuyMode>('1');
  const t = now();
  const rate = totalYardRatePerSec(s, RIGS, t);

  const visibleRigs = RIGS.filter((r) => r.order === 0 || (s.rigs[RIGS[r.order - 1].id]?.owned ?? 0) > 0);
  const nextHidden = RIGS.find((r) => !visibleRigs.includes(r));

  return (
    <div class="screen">
      <div class="screen-header">
        <span class="icon">🏗️</span>
        <div>
          <h1>The Yard</h1>
          <div class="sub">Your scrapyard HQ. It earns while you fly.</div>
        </div>
      </div>

      <div class="yard-rate-banner">
        <div class="rate-num mono">{formatCredits(rate)}/s</div>
        <div class="rate-label">Yard Income · ×{globalIncomeMult(s, t).toFixed(2)} global</div>
      </div>

      <div class="buy-mode-toggle">
        {(['1', '10', '100', 'max'] as BuyMode[]).map((m) => (
          <button key={m} class={mode === m ? 'active' : ''} onClick={() => setMode(m)}>×{m.toUpperCase()}</button>
        ))}
      </div>

      {visibleRigs.map((rig) => {
        const r = s.rigs[rig.id] ?? { owned: 0, managed: false };
        const batchQty = mode === 'max' ? maxAffordableRigQty(rig, r.owned, s.credits) : Number(mode);
        const cost = rigBatchCost(rig, r.owned, Math.max(0, batchQty));
        const canBuy = batchQty > 0 && s.credits >= cost;
        const nextM = nextMilestone(r.owned);
        const milestonePct = Math.min(100, (r.owned / nextM) * 100);
        const perUnit = rig.basePayout / rig.cycleSec;
        const tappable = r.owned > 0 && !r.managed;

        return (
          <div
            key={rig.id}
            class={`rig-row${tappable ? ' tappable' : ''}`}
            onClick={tappable ? () => tapRig(rig.id) : undefined}
          >
            <div class="rig-top">
              <div class="rig-icon">{rig.icon}</div>
              <div class="rig-info">
                <div class="rig-name">{rig.name} {r.managed && <span style={{ color: 'var(--profit)', fontSize: 10 }}>● {rig.managerName}</span>}</div>
                <div class="rig-sub">{formatCredits(perUnit)}/s per unit · {rig.cycleSec}s cycle · ×{milestoneMultiplier(r.owned)} milestone</div>
              </div>
              <div class="rig-owned mono">{r.owned}</div>
            </div>

            <div class="rig-milestone">
              <div class="mbar"><div class="mfill" style={{ width: `${milestonePct}%` }} /></div>
              <div class="mlabel">{nextM - r.owned} more to next milestone (×{milestoneMultiplier(nextM)})</div>
            </div>

            <div class="rig-actions">
              <button
                class="btn btn-primary"
                disabled={!canBuy}
                onClick={(e) => { e.stopPropagation(); buyRig(rig.id, mode === 'max' ? 'max' : Number(mode)); }}
              >
                BUY {mode === 'max' ? `MAX (${batchQty})` : mode} · {formatCredits(cost || rigUnitCost(rig, r.owned))}
              </button>
              {r.owned > 0 && !r.managed && (
                <button
                  class="btn btn-ghost"
                  disabled={s.credits < rig.managerCost}
                  onClick={(e) => { e.stopPropagation(); hireManager(rig.id); }}
                >
                  HIRE {rig.managerName} · {formatCredits(rig.managerCost)}
                </button>
              )}
            </div>
            {tappable && (
              <div class="rig-tap-hint">
                👆 Tap anywhere on this card to run a cycle by hand — +{formatCredits(rig.basePayout * r.owned * milestoneMultiplier(r.owned) * globalIncomeMult(s, t))}
              </div>
            )}
          </div>
        );
      })}

      {nextHidden && (
        <div class="rig-row" style={{ opacity: 0.5 }}>
          <div class="rig-top">
            <div class="rig-icon">❓</div>
            <div class="rig-info">
              <div class="rig-name">?????</div>
              <div class="rig-sub">Buy your last rig to reveal this one.</div>
            </div>
            <div class="rig-owned mono">···</div>
          </div>
        </div>
      )}
    </div>
  );
}
