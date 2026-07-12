import { store } from '../engine/store';
import { claimQuest } from '../engine/actions';
import { formatNum } from '../engine/num';

const SIZE_ICON: Record<string, string> = { tiny: '🐜', medium: '🐕', session: '🐘' };

export function QuestRailStrip() {
  const s = store.value;
  if (!s.quests || s.quests.length === 0) return null;

  return (
    <div class="quest-rail">
      {s.quests.map((q, i) => {
        const done = q.progress >= q.goal;
        const pct = Math.min(100, (q.progress / Math.max(1, q.goal)) * 100);
        return (
          <div key={q.id} class={`quest-chip${done ? ' done' : ''}`}>
            <div class="qlabel">{SIZE_ICON[q.size]} {q.label}</div>
            <div class="qprogress-bar"><div class="qprogress-fill" style={{ width: `${pct}%` }} /></div>
            <div class="qreward">+{formatNum(q.rewardXp)} XP · +{formatNum(q.rewardCredits)}₡{q.rewardBoost ? ' · 🚀' : ''}</div>
            {done && <button class="btn btn-primary" onClick={() => claimQuest(i)}>CLAIM</button>}
          </div>
        );
      })}
    </div>
  );
}
