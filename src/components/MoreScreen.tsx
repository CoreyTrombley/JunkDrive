import { useRef, useState } from 'preact/hooks';
import { store, clockTick } from '../engine/store';
import { CODEX_SETS } from '../config/codex';
import { STATIONS_BY_ID } from '../config/stations';
import { JACKPOTS_BY_ID, ENCOUNTERS_BY_ID, MARKET_EVENTS_BY_ID } from '../config/events';
import { RELICS, relicCost, relicMaxLevel } from '../config/relics';
import { goodById } from '../engine/pricing';
import {
  buyRelic, prestige, canPrestige, prestigePreviewDM, claimDailyStreak, canClaimDailyStreak,
  useBoostToken, updateSettings, exportSave, importSave,
} from '../engine/actions';
import { formatCredits, formatNum, formatDuration, formatPct } from '../engine/num';
import { now } from '../engine/time';

function topEntry(record: Record<string, number>): { id: string; qty: number } | null {
  let best: { id: string; qty: number } | null = null;
  for (const [id, qty] of Object.entries(record)) {
    if (!best || qty > best.qty) best = { id, qty };
  }
  return best;
}

function codexIcon(kind: string, id: string): string {
  if (kind === 'goods') return goodById(id)?.icon ?? '❔';
  if (kind === 'stations') return STATIONS_BY_ID[id]?.icon ?? '❔';
  if (kind === 'jackpots') return JACKPOTS_BY_ID[id]?.icon ?? '❔';
  if (kind === 'encounters') return ENCOUNTERS_BY_ID[id]?.icon ?? '❔';
  if (kind === 'events') return MARKET_EVENTS_BY_ID[id]?.icon ?? '❔';
  return '❔';
}

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

export function MoreScreen() {
  const s = store.value;
  void clockTick.value;
  const [saveCode, setSaveCode] = useState('');
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState('');

  const dmPreview = prestigePreviewDM(s);
  const day = ((s.dailyStreak.count) % 7) + (canClaimDailyStreak(s) ? 1 : 0) || 1;
  const t = now();
  const boostActive = s.activeBoost && s.activeBoost.expiresAt > t;

  return (
    <div class="screen">
      <div class="screen-header">
        <span class="icon">☰</span>
        <div><h1>Command</h1><div class="sub">Codex, streaks, and the long game.</div></div>
      </div>

      {(canPrestige(s) || s.darkMatter > 0) && (
        <div class="more-section">
          <div class="section-label">Wormhole Run</div>
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
      )}

      <div class="more-section">
        <div class="section-label">Rewards</div>
        <div class="list-row">
          <span>🎁 Daily Streak — Day {day}/7 {s.dailyStreak.shieldAvailable ? '· 🛡️ shield ready' : ''}</span>
          <button class="btn btn-primary" disabled={!canClaimDailyStreak(s)} onClick={() => claimDailyStreak()}>
            {canClaimDailyStreak(s) ? 'CLAIM' : 'DONE'}
          </button>
        </div>
        <div class="list-row">
          <span>🚀 Boost Tokens — {s.boostTokens} available {boostActive ? `· ACTIVE ${formatDuration((s.activeBoost?.expiresAt ?? 0) - t)}` : ''}</span>
          <button class="btn btn-primary" disabled={s.boostTokens <= 0 || !!boostActive} onClick={() => useBoostToken()}>USE</button>
        </div>
      </div>

      <div class="more-section">
        <div class="section-label">Milestone Wall</div>
        {s.milestones.length === 0 ? (
          <div class="empty-hint">Cross ₡10 net worth to start the wall.</div>
        ) : (
          <div class="codex-grid">
            {s.milestones.slice().sort((a, b) => a - b).map((p) => (
              <div key={p} class="codex-cell got" title={`10^${p}`}>🏆</div>
            ))}
          </div>
        )}
      </div>

      <div class="more-section">
        <div class="section-label">Codex</div>
        {CODEX_SETS.map((set) => {
          const bucket = s.codex[set.kind] as Record<string, boolean>;
          const got = set.memberIds.filter((id) => bucket[id]).length;
          return (
            <div key={set.id} class="codex-set-row">
              <div class="cs-title"><span>{set.icon} {set.name}</span><span class="pct">{got}/{set.memberIds.length}</span></div>
              <div class="codex-grid">
                {set.memberIds.map((id) => (
                  <div key={id} class={`codex-cell${bucket[id] ? ' got' : ''}`}>{codexIcon(set.kind, id)}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div class="more-section">
        <div class="section-label">Stats</div>
        <div class="bests-grid">
          <div class="best-tile"><div class="bt-label">Jumps</div><div class="bt-val mono">{formatNum(s.stats.totalJumps)}</div></div>
          <div class="best-tile"><div class="bt-label">Sales</div><div class="bt-val mono">{formatNum(s.stats.totalSales)}</div></div>
          <div class="best-tile"><div class="bt-label">Rig Taps</div><div class="bt-val mono">{formatNum(s.stats.totalTaps)}</div></div>
          <div class="best-tile"><div class="bt-label">Wormhole Runs</div><div class="bt-val mono">{formatNum(s.stats.totalPrestiges)}</div></div>
          {(() => {
            const sold = topEntry(s.stats.goodsSold);
            const soldGood = sold ? goodById(sold.id) : null;
            return (
              <div class="best-tile">
                <div class="bt-label">Most Sold</div>
                <div class="bt-val mono">{sold ? `${soldGood?.icon ?? ''} ${formatNum(sold.qty)}` : '—'}</div>
                {sold && <div class="bt-sub">{soldGood?.name ?? sold.id}</div>}
              </div>
            );
          })()}
          {(() => {
            const bought = topEntry(s.stats.goodsBought);
            const boughtGood = bought ? goodById(bought.id) : null;
            return (
              <div class="best-tile">
                <div class="bt-label">Most Bought</div>
                <div class="bt-val mono">{bought ? `${boughtGood?.icon ?? ''} ${formatNum(bought.qty)}` : '—'}</div>
                {bought && <div class="bt-sub">{boughtGood?.name ?? bought.id}</div>}
              </div>
            );
          })()}
          <div class="best-tile"><div class="bt-label">Credits Earned</div><div class="bt-val mono">{formatCredits(s.stats.creditsEarned)}</div></div>
          <div class="best-tile"><div class="bt-label">Credits Spent</div><div class="bt-val mono">{formatCredits(s.stats.creditsSpent)}</div></div>
          <div class="best-tile"><div class="bt-label">Biggest Sale</div><div class="bt-val mono">{formatCredits(s.bests.biggestSale)}</div></div>
          <div class="best-tile"><div class="bt-label">Best Flip Margin</div><div class="bt-val mono">{formatPct(s.bests.bestFlipMargin, { signed: true })}</div></div>
          <div class="best-tile"><div class="bt-label">Deepest Sector</div><div class="bt-val mono">{s.bests.deepestSector}</div></div>
          <div class="best-tile"><div class="bt-label">Fastest ₡1M</div><div class="bt-val mono">{s.bests.fastestMillionMs != null ? formatDuration(s.bests.fastestMillionMs) : '—'}</div></div>
        </div>
      </div>

      <div class="more-section">
        <div class="section-label">Settings</div>
        <div class="toggle-row">
          <span>Chill Mode (softer FOMO)</span>
          <button class={`toggle${s.settings.chillMode ? ' on' : ''}`} onClick={() => updateSettings({ chillMode: !s.settings.chillMode })}><span class="knob" /></button>
        </div>
        <div class="toggle-row">
          <span>Reduced Motion</span>
          <button class={`toggle${s.settings.reducedMotion ? ' on' : ''}`} onClick={() => updateSettings({ reducedMotion: !s.settings.reducedMotion })}><span class="knob" /></button>
        </div>
        <div class="toggle-row">
          <span>Haptics</span>
          <button class={`toggle${s.settings.haptics ? ' on' : ''}`} onClick={() => updateSettings({ haptics: !s.settings.haptics })}><span class="knob" /></button>
        </div>
        <div class="toggle-row">
          <span>Mute All Audio</span>
          <button class={`toggle${s.settings.muted ? ' on' : ''}`} onClick={() => updateSettings({ muted: !s.settings.muted })}><span class="knob" /></button>
        </div>
        <div class="toggle-row">
          <span style={{ flex: 1 }}>SFX Volume</span>
          <input type="range" min={0} max={1} step={0.05} value={s.settings.sfxVolume} style={{ width: 110 }}
            onInput={(e) => updateSettings({ sfxVolume: Number((e.target as HTMLInputElement).value) })} />
        </div>
        <div class="toggle-row">
          <span style={{ flex: 1 }}>Ambience Volume</span>
          <input type="range" min={0} max={1} step={0.05} value={s.settings.ambienceVolume} style={{ width: 110 }}
            onInput={(e) => updateSettings({ ambienceVolume: Number((e.target as HTMLInputElement).value) })} />
        </div>
        <div class="toggle-row">
          <span style={{ flex: 1 }}>Music Volume</span>
          <input type="range" min={0} max={1} step={0.05} value={s.settings.musicVolume} style={{ width: 110 }}
            onInput={(e) => updateSettings({ musicVolume: Number((e.target as HTMLInputElement).value) })} />
        </div>

        <div class="section-label">Save</div>
        <button class="btn btn-ghost btn-block" onClick={() => setSaveCode(exportSave())}>EXPORT SAVE CODE</button>
        {saveCode && <textarea readOnly value={saveCode} style={{ width: '100%', marginTop: 8, fontSize: 10 }} rows={4} onClick={(e) => (e.target as HTMLTextAreaElement).select()} />}
        <textarea placeholder="Paste a save code to import…" value={importText} style={{ width: '100%', marginTop: 10, fontSize: 10 }} rows={3}
          onInput={(e) => setImportText((e.target as HTMLTextAreaElement).value)} />
        <button class="btn btn-danger btn-block" style={{ marginTop: 6 }} onClick={() => {
          const r = importSave(importText);
          setImportMsg(r.ok ? 'Imported!' : r.reason ?? 'Failed.');
        }}>IMPORT SAVE CODE</button>
        {importMsg && <div class="empty-hint">{importMsg}</div>}
      </div>

      <div class="more-section">
        <div class="section-label">About</div>
        <div class="empty-hint">JUNKRUN v1.0 · Buy junk. Jump stars. Get rich. Endless.</div>
      </div>
    </div>
  );
}
