import { store } from '../engine/store';
import { RIGS } from '../config/rigs';
import { SHIP_UPGRADES } from '../config/ship';
import { upgradeCost } from '../config/ship';
import { maxAffordableRigQty } from '../engine/formulas';
import { canClaimDailyStreak, canPrestige } from '../engine/actions';

export type TabId = 'market' | 'map' | 'ship' | 'yard' | 'more';

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'market', icon: '🏪', label: 'MARKET' },
  { id: 'map', icon: '🗺️', label: 'MAP' },
  { id: 'ship', icon: '🚀', label: 'SHIP' },
  { id: 'yard', icon: '🏗️', label: 'YARD' },
  { id: 'more', icon: '☰', label: 'MORE' },
];

export function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  const s = store.value;

  const yardBadge = RIGS.some((rig) => {
    const r = s.rigs[rig.id];
    if (r && r.owned > 0 && !r.managed && s.credits >= rig.managerCost) return true;
    return maxAffordableRigQty(rig, r?.owned ?? 0, s.credits) > 0 && (r?.owned ?? 0) === 0 && s.credits >= rig.baseCost;
  });

  const shipBadge = SHIP_UPGRADES.some((u) => {
    const level = s.shipUpgrades[u.id] || 0;
    if (u.maxLevel != null && level >= u.maxLevel) return false;
    return s.credits >= upgradeCost(u, level);
  });

  const questBadge = s.quests.some((q) => q.progress >= q.goal);
  const moreBadge = questBadge || canClaimDailyStreak(s) || s.boostTokens > 0 || canPrestige(s);

  const badges: Record<TabId, boolean> = {
    market: false,
    map: !!s.pendingJackpot,
    ship: shipBadge,
    yard: yardBadge,
    more: moreBadge,
  };

  return (
    <div class="tabbar">
      {TABS.map((t) => (
        <button key={t.id} class={`tab${active === t.id ? ' active' : ''}`} onClick={() => onChange(t.id)}>
          <span class="tab-icon">
            {t.icon}
            {badges[t.id] && <span class="tab-badge" />}
          </span>
          {t.label}
        </button>
      ))}
    </div>
  );
}
