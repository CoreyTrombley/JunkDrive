import type { GameState, Quest } from './state';
import type { QuestSize } from '../config/types';
import { templatesForSize, QUEST_XP_BY_SIZE, QUEST_CREDIT_PCT_BY_SIZE } from '../config/quests';
import { GOODS } from '../config/goods';
import { STATIONS } from '../config/stations';
import { type RngFn, randInt, randRange, pick, chance } from './rng';
import { netWorth, maxHold } from './derived';
import { allUnlockedGoods } from './pricing';
import { stationDisplayName } from './sectorgen';

function fillLabel(tpl: string, params: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
}

export function generateQuest(size: QuestSize, state: GameState, rng: RngFn, seq: number): Quest {
  const templates = templatesForSize(size);
  const tpl = pick(rng, templates);
  const unlockedGoods = allUnlockedGoods(state);
  const good = unlockedGoods.length ? pick(rng, unlockedGoods) : GOODS[0];
  const otherStations = STATIONS.filter((s) => s.unlockRank <= state.rank && s.id !== state.currentStation);
  const station = otherStations.length ? pick(rng, otherStations) : STATIONS[0];
  const nw = Math.max(netWorth(state), 100);

  let goal = 1;
  let label = tpl.label;
  let goodId: string | undefined;
  let stationId: string | undefined;

  switch (tpl.kind) {
    case 'flip_units': {
      // Tonnage-aware: keep tiny quests tiny for heavy goods (≈ ≤2 full holds).
      const unitsPerHold = Math.max(1, Math.floor(maxHold(state) / good.mass));
      const cap = Math.max(3, Math.min(16, unitsPerHold * 2));
      goal = randInt(rng, Math.min(5, cap), cap);
      goodId = good.id;
      label = fillLabel(tpl.label, { n: goal, good: good.name });
      break;
    }
    case 'visit_station':
      stationId = station.id;
      label = fillLabel(tpl.label, { station: stationDisplayName(station.id, state.sector, state.runSeed ?? 0) });
      break;
    case 'jump_n':
      goal = randInt(rng, 2, 5);
      label = fillLabel(tpl.label, { n: goal });
      break;
    case 'bank_sale':
      goal = Math.round(Math.max(30, nw * randRange(rng, 0.06, 0.18)));
      label = fillLabel(tpl.label, { n: goal });
      break;
    case 'hot_streak':
      goal = randInt(rng, 3, 5);
      label = fillLabel(tpl.label, { n: goal });
      break;
    case 'buy_rig':
      goal = randInt(rng, 5, 15);
      label = fillLabel(tpl.label, { n: goal });
      break;
    default:
      goal = 1;
      label = tpl.label;
  }

  const [xMin, xMax] = QUEST_XP_BY_SIZE[size];
  const [pMin, pMax] = QUEST_CREDIT_PCT_BY_SIZE[size];
  // Scale with rank so quests stay a real XP source deep into the game
  const rewardXp = Math.round(randInt(rng, xMin, xMax) * (1 + 0.10 * state.rank));
  const rewardCredits = Math.round(Math.max(15, nw * randRange(rng, pMin, pMax)));
  const rewardBoost = size !== 'tiny' && chance(rng, 0.2);

  return {
    id: `q${seq}`,
    kind: tpl.kind,
    size,
    label,
    goal,
    progress: 0,
    rewardCredits,
    rewardXp,
    rewardBoost,
    goodId,
    stationId,
  };
}

export function generateFullRail(state: GameState, rng: RngFn, seqStart: number): Quest[] {
  return [
    generateQuest('tiny', state, rng, seqStart),
    generateQuest('medium', state, rng, seqStart + 1),
    generateQuest('session', state, rng, seqStart + 2),
  ];
}
