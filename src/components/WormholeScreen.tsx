import { useRef, useState } from 'preact/hooks';
import { store } from '../engine/store';
import { RELICS, relicCost, relicMaxLevel } from '../config/relics';
import { buyRelic, prestige, canPrestige, prestigePreviewDM } from '../engine/actions';
import { formatNum } from '../engine/num';

function PrestigeButton() {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);
  const startRef = useRef(0);

  function start() {
    startRef.current = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - startRef.current) / 3000);
      setProgress(p);
      if (p >= 1) {
        prestige();
        setProgress(0);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }
  function cancel() {
    setProgress(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }

  return (
    <button
      class="btn btn-block btn-primary"
      style={{ position: 'relative', overflow: 'hidden' }}
      onMouseDown={start} onMouseUp={cancel} onMouseLeave={cancel}
      onTouchStart={start} onTouchEnd={cancel}
    >
      <div style={{ position: 'absolute', inset: 0, width: `${progress * 100}%`, background: 'rgba(255,255,255,0.3)', transition: progress === 0 ? 'width .15s' : 'none' }} />
      <span style={{ position: 'relative' }}>{progress > 0 ? 'HOLD…' : 'HOLD TO COLLAPSE 🌀'}</span>
    </button>
  );
}

export function WormholeScreen() {
  const s = store.value;
  const dmPreview = prestigePreviewDM(s);

  return (
    <>
      <div class="prestige-banner">
        <div>Collapse this run into Dark Matter.</div>
        <div class="dm-preview mono">+{formatNum(dmPreview)} 💠</div>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 10 }}>You have {formatNum(s.darkMatter)} 💠 · +{(s.darkMatter * 2).toFixed(0)}% income</div>
        {canPrestige(s) ? (
          <>
            <div class="unlock-reason">
              {s.rank >= 25 ? `Unlocked at Rank ${s.rank}.` : `Unlocked early via ₡10M+ lifetime earnings (still Rank ${s.rank}).`}
            </div>
            <PrestigeButton />
          </>
        ) : (
          <div class="empty-hint">Reach Rank 25 or ₡10M lifetime earnings to unlock.</div>
        )}
      </div>
      <div class="card">
        <div class="card-header"><span class="ch-icon">💠</span>RELICS</div>
        {RELICS.map((r) => {
          const level = s.relics[r.id] || 0;
          const maxLvl = relicMaxLevel(r);
          const maxed = maxLvl != null && level >= maxLvl;
          const cost = maxed ? 0 : relicCost(r, level);
          return (
            <div key={r.id} class="relic-row">
              <div class="r-icon">{r.icon}</div>
              <div class="r-info">
                <div class="r-name">{r.name} {maxLvl ? `(${level}/${maxLvl})` : `(Lv.${level})`}</div>
                <div class="r-effect">{r.effectLabel}</div>
              </div>
              <button class="btn btn-primary" disabled={maxed || s.darkMatter < cost} onClick={() => buyRelic(r.id)}>
                {maxed ? 'MAXED' : `${formatNum(cost)} 💠`}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
