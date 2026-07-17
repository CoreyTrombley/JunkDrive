import type { QuestKind, QuestSize } from './types';

export interface QuestTemplate {
  kind: QuestKind;
  size: QuestSize;
  label: string; // {n}/{good}/{station} tokens filled at generation time
}

// Quest rail templates — spec §10.1. Always exactly 3 slots: tiny/medium/session.
export const QUEST_TEMPLATES: QuestTemplate[] = [
  { kind: 'flip_units', size: 'tiny', label: 'Flip {n} units of {good}' },
  { kind: 'visit_station', size: 'tiny', label: 'Visit {station}' },
  { kind: 'jump_n', size: 'tiny', label: 'Make {n} jumps' },
  { kind: 'bank_sale', size: 'medium', label: 'Bank ₡{n} in one sale' },
  { kind: 'hot_streak', size: 'medium', label: 'Hit a ×{n} Hot Streak' },
  { kind: 'buy_rig', size: 'medium', label: 'Buy {n} rig units at The Yard' },
  { kind: 'lucky_flip', size: 'medium', label: 'Trigger a LUCKY FLIP' },
  { kind: 'pirate_toll', size: 'session', label: 'Survive a Pirate Toll' },
  { kind: 'hire_manager', size: 'session', label: 'Hire a rig manager' },
  { kind: 'claim_offline', size: 'session', label: 'Claim offline earnings' },
  { kind: 'codex_set', size: 'session', label: 'Complete a Codex set' },
  { kind: 'deliver_manifest', size: 'session', label: 'Deliver a trade manifest' },
];

export function templatesForSize(size: QuestSize): QuestTemplate[] {
  return QUEST_TEMPLATES.filter((t) => t.size === size);
}

export const QUEST_XP_BY_SIZE: Record<QuestSize, [number, number]> = {
  tiny: [15, 30],
  medium: [40, 80],
  session: [100, 220],
};

export const QUEST_CREDIT_PCT_BY_SIZE: Record<QuestSize, [number, number]> = {
  tiny: [0.02, 0.03],
  medium: [0.03, 0.05],
  session: [0.04, 0.06],
};
