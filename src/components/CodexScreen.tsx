import { store } from '../engine/store';
import { CODEX_SETS } from '../config/codex';
import { STATIONS_BY_ID } from '../config/stations';
import { JACKPOTS_BY_ID, ENCOUNTERS_BY_ID, MARKET_EVENTS_BY_ID } from '../config/events';
import { goodById } from '../engine/pricing';
import { emit } from '../engine/bus';

function codexIcon(kind: string, id: string): string {
  if (kind === 'goods') return goodById(id)?.icon ?? '❔';
  if (kind === 'stations') return STATIONS_BY_ID[id]?.icon ?? '❔';
  if (kind === 'jackpots') return JACKPOTS_BY_ID[id]?.icon ?? '❔';
  if (kind === 'encounters') return ENCOUNTERS_BY_ID[id]?.icon ?? '❔';
  if (kind === 'events') return MARKET_EVENTS_BY_ID[id]?.icon ?? '❔';
  return '❔';
}

function codexName(kind: string, id: string): string {
  if (kind === 'goods') return goodById(id)?.name ?? id;
  if (kind === 'stations') return STATIONS_BY_ID[id]?.name ?? id;
  if (kind === 'jackpots') return JACKPOTS_BY_ID[id]?.name ?? id;
  if (kind === 'encounters') return ENCOUNTERS_BY_ID[id]?.name ?? id;
  if (kind === 'events') return MARKET_EVENTS_BY_ID[id]?.name ?? id;
  return id;
}

const CODEX_HINTS: Record<string, string> = {
  goods: 'Undiscovered — sell this good once to log it.',
  stations: 'Undiscovered — dock there once to log it.',
  jackpots: 'Undiscovered — a rare arrival moment. Keep flying.',
  encounters: 'Undiscovered — a chance meeting in the void.',
  events: 'Undiscovered — a market signal you have not witnessed.',
};

export function CodexScreen() {
  const s = store.value;

  return (
    <>
      {CODEX_SETS.map((set) => {
        const bucket = s.codex[set.kind] as Record<string, boolean>;
        const got = set.memberIds.filter((id) => bucket[id]).length;
        return (
          <div key={set.id} class="card">
            <div class="card-header"><span class="ch-icon">{set.icon}</span>{set.name}<span style={{ marginLeft: 'auto', opacity: 0.6 }}>{got}/{set.memberIds.length}</span></div>
            <div class="codex-grid">
              {set.memberIds.map((id) => (
                <div
                  key={id}
                  class={`codex-cell${bucket[id] ? ' got' : ''}`}
                  onClick={() =>
                    emit({
                      type: 'toast',
                      text: bucket[id]
                        ? codexName(set.kind, id)
                        : set.id === 'honor_badges'
                          ? 'A monument. Some things must be walked, not found.'
                          : CODEX_HINTS[set.kind] ?? '???',
                      icon: bucket[id] ? codexIcon(set.kind, id) : '❔',
                    })
                  }
                >
                  {codexIcon(set.kind, id)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
