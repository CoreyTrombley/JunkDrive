import { JACKPOTS_BY_ID } from '../config/events';
import { dismissPendingJackpot } from '../engine/actions';

export function JackpotModal({ jackpotId, onDone }: { jackpotId: string; onDone: () => void }) {
  const def = JACKPOTS_BY_ID[jackpotId];
  function close() {
    dismissPendingJackpot();
    onDone();
  }
  return (
    <div class="celebration-overlay">
      <div class="big-icon">{def?.icon ?? '🎉'}</div>
      <h2>{def?.name ?? 'JACKPOT'}</h2>
      <p>{def?.copy ?? ''}</p>
      <button class="btn btn-primary btn-block" onClick={close}>NICE</button>
    </div>
  );
}
