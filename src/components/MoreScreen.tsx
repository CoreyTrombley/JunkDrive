import { store, clockTick } from '../engine/store';
import { CODEX_SETS } from '../config/codex';
import { prestigePreviewDM, canPrestige, canClaimDailyStreak } from '../engine/actions';
import { formatNum, formatDuration } from '../engine/num';
import { now } from '../engine/time';
import type { MoreSubId } from './nav';
import { SubHeader } from './SubHeader';
import { WormholeScreen } from './WormholeScreen';
import { RewardsScreen } from './RewardsScreen';
import { StatsScreen } from './StatsScreen';
import { CodexScreen } from './CodexScreen';
import { OptionsScreen } from './OptionsScreen';
import { SaveScreen } from './SaveScreen';

const SUB_META: Record<MoreSubId, { icon: string; title: string }> = {
  wormhole: { icon: '🌀', title: 'Wormhole Run' },
  rewards: { icon: '🎁', title: 'Rewards' },
  stats: { icon: '🏆', title: 'Stats' },
  codex: { icon: '📖', title: 'Codex' },
  options: { icon: '⚙️', title: 'Options' },
  save: { icon: '💾', title: 'Save' },
};

export function MoreScreen({ sub, openSub, closeSub }: { sub: MoreSubId | null; openSub: (id: MoreSubId) => void; closeSub: () => void }) {
  const s = store.value;
  void clockTick.value;

  if (sub) {
    return (
      <div class="screen anim-slide" key={sub}>
        <SubHeader icon={SUB_META[sub].icon} title={SUB_META[sub].title} onBack={closeSub} />
        {sub === 'wormhole' && <WormholeScreen />}
        {sub === 'rewards' && <RewardsScreen />}
        {sub === 'stats' && <StatsScreen />}
        {sub === 'codex' && <CodexScreen />}
        {sub === 'options' && <OptionsScreen />}
        {sub === 'save' && <SaveScreen />}
      </div>
    );
  }

  const t = now();
  const dmPreview = prestigePreviewDM(s);
  const boostActive = s.activeBoost && s.activeBoost.expiresAt > t;
  const dailyReady = canClaimDailyStreak(s);
  const codexTotal = CODEX_SETS.reduce((n, set) => n + set.memberIds.length, 0);
  const codexGot = CODEX_SETS.reduce((n, set) => {
    const bucket = s.codex[set.kind] as Record<string, boolean>;
    return n + set.memberIds.filter((id) => bucket[id]).length;
  }, 0);

  const wormholeHint = canPrestige(s)
    ? `Collapse for +${formatNum(dmPreview)} 💠`
    : s.darkMatter > 0
      ? `${formatNum(s.darkMatter)} 💠 banked · +${(s.darkMatter * 2).toFixed(0)}% income`
      : 'Locked — Rank 25 or ₡10M lifetime';
  const rewardsHint = dailyReady
    ? 'Daily crate ready!'
    : boostActive
      ? `Boost active · ${formatDuration((s.activeBoost?.expiresAt ?? 0) - t)}`
      : `${s.boostTokens} boost token${s.boostTokens === 1 ? '' : 's'} banked`;

  return (
    <div class="screen anim-fade">
      <div class="screen-header">
        <span class="icon">☰</span>
        <div><h1>Command</h1><div class="sub">Everything beyond the flight deck.</div></div>
      </div>

      <div class="hub-grid">
        <button class="hub-card wide" onClick={() => openSub('wormhole')}>
          {canPrestige(s) && <span class="hc-badge" />}
          <span class="hc-top"><span class="hc-icon">🌀</span>WORMHOLE</span>
          <span class="hc-hint">{wormholeHint}</span>
          <span class="hc-chevron">›</span>
        </button>
        <button class="hub-card" onClick={() => openSub('rewards')}>
          {dailyReady && <span class="hc-badge" />}
          <span class="hc-top"><span class="hc-icon">🎁</span>REWARDS</span>
          <span class="hc-hint">{rewardsHint}</span>
        </button>
        <button class="hub-card" onClick={() => openSub('stats')}>
          <span class="hc-top"><span class="hc-icon">🏆</span>STATS</span>
          <span class="hc-hint">Deepest sector {s.bests.deepestSector}</span>
        </button>
        <button class="hub-card" onClick={() => openSub('codex')}>
          <span class="hc-top"><span class="hc-icon">📖</span>CODEX</span>
          <span class="hc-hint">{codexGot}/{codexTotal} discovered</span>
        </button>
        <button class="hub-card" onClick={() => openSub('options')}>
          <span class="hc-top"><span class="hc-icon">⚙️</span>OPTIONS</span>
          <span class="hc-hint">Audio · motion · haptics</span>
        </button>
        <button class="hub-card" onClick={() => openSub('save')}>
          <span class="hc-top"><span class="hc-icon">💾</span>SAVE</span>
          <span class="hc-hint">Export or import a save code</span>
        </button>
      </div>

      <div class="empty-hint" style={{ paddingTop: 40 }}>JUNKRUN v2.3 · Buy junk. Plot routes. Work the market. Endless.</div>
    </div>
  );
}
