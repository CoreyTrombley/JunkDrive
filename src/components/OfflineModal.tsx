import { useEffect, useState } from 'preact/hooks';
import type { PendingOfflineReport } from '../engine/state';
import { claimOfflineReport } from '../engine/actions';
import { formatCredits, formatDuration } from '../engine/num';
import { emit } from '../engine/bus';

export function OfflineModal({ report, onDone }: { report: PendingOfflineReport; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    emit({ type: 'sfx', id: 'coin_cascade' });
    const start = performance.now();
    const dur = 1200;
    let raf = 0;
    function step(t: number) {
      const p = Math.min(1, (t - start) / dur);
      setShown(report.amount * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
      else setReady(true);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [report.amount]);

  function claim() {
    claimOfflineReport();
    onDone();
  }

  return (
    <div class="celebration-overlay">
      <div class="big-icon">🛰️</div>
      <h2>WELCOME BACK, CAPTAIN</h2>
      <p>You were away {formatDuration(report.elapsedMs)}. The Yard kept working.</p>
      <div class="count-up mono">+{formatCredits(shown)}</div>
      {report.capped && <p style={{ marginTop: -12 }}>Offline cap hit — Long Haul relics (Wormhole tree) stretch this further.</p>}
      <button class="btn btn-primary btn-block" disabled={!ready} onClick={claim}>CLAIM</button>
    </div>
  );
}
