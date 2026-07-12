import { useState } from 'preact/hooks';
import { ENCOUNTERS_BY_ID } from '../config/events';
import { resolveEncounter } from '../engine/actions';

export function EncounterModal({ encounterId, onDone }: { encounterId: string; onDone: () => void }) {
  const def = ENCOUNTERS_BY_ID[encounterId];
  const [result, setResult] = useState<string | null>(null);

  if (!def) {
    onDone();
    return null;
  }

  function choose(choiceId: string) {
    const r = resolveEncounter(choiceId);
    setResult(r.text || '…');
  }

  return (
    <div class="sheet-backdrop center">
      <div class="card-modal">
        <div style={{ fontSize: 42, textAlign: 'center' }}>{def.icon}</div>
        <div class="sheet-title" style={{ justifyContent: 'center' }}>{def.name}</div>
        <div class="sheet-sub" style={{ textAlign: 'center' }}>{result ?? def.copy}</div>
        {!result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {def.choices.map((c) => (
              <button key={c.id} class="btn btn-primary btn-block" onClick={() => choose(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
        ) : (
          <button class="btn btn-block btn-primary" style={{ marginTop: 12 }} onClick={onDone}>
            CONTINUE
          </button>
        )}
      </div>
    </div>
  );
}
