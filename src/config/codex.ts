import { GOODS } from './goods';
import { STATIONS } from './stations';
import { JACKPOTS } from './events';
import { ENCOUNTERS, MARKET_EVENTS } from './events';

export interface CodexSet {
  id: string;
  name: string;
  icon: string;
  kind: 'goods' | 'stations' | 'jackpots' | 'encounters' | 'events';
  memberIds: string[];
}

function tierSet(tier: number, name: string, icon: string): CodexSet {
  return {
    id: `tier${tier}_goods`,
    name,
    icon,
    kind: 'goods',
    memberIds: GOODS.filter((g) => g.tier === tier).map((g) => g.id),
  };
}

// Codex sets — spec §10.4. Each completed set = permanent +1% global income.
export const CODEX_SETS: CodexSet[] = [
  tierSet(1, 'Tier I Goods', '⚙️'),
  tierSet(2, 'Tier II Goods', '🔋'),
  tierSet(3, 'Tier III Goods', '💾'),
  tierSet(4, 'Tier IV Goods', '🏺'),
  tierSet(5, 'Tier V Goods', '👁️'),
  tierSet(6, 'Tier VI Goods', '🕳️'),
  { id: 'all_stations', name: 'Every Dock', icon: '🗺️', kind: 'stations', memberIds: STATIONS.map((s) => s.id) },
  { id: 'all_jackpots', name: 'Jackpot Legend', icon: '🎰', kind: 'jackpots', memberIds: JACKPOTS.map((j) => j.id) },
  { id: 'all_encounters', name: 'Seen It All', icon: '🃏', kind: 'encounters', memberIds: ENCOUNTERS.map((e) => e.id) },
  { id: 'all_events', name: 'Market Watcher', icon: '📊', kind: 'events', memberIds: MARKET_EVENTS.map((e) => e.id) },
];

export const CODEX_SETS_BY_ID: Record<string, CodexSet> = Object.fromEntries(CODEX_SETS.map((s) => [s.id, s]));
