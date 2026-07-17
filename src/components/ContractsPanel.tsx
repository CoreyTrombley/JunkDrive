import { store, clockTick } from '../engine/store';
import { canDeliver } from '../engine/manifests';
import { deliverManifest } from '../engine/actions';
import { goodById, getPrice } from '../engine/pricing';
import { STATIONS_BY_ID, STATIONS } from '../config/stations';
import { formatCredits, formatDuration, formatNum } from '../engine/num';
import { now } from '../engine/time';
import { stationDisplayName } from '../engine/sectorgen';

export function ContractsPanel() {
  const s = store.value;
  void clockTick.value;
  const t = now();

  return (
    <div class="contracts">
      <div class="section-label">Trade Contracts</div>
      {s.manifests.filter((m) => m.expiresAt > t).map((m) => {
        const station = STATIONS_BY_ID[m.stationId];
        const ready = canDeliver(s, m);
        const cheapestSource = (goodId: string): string | null => {
          let best: { id: string; price: number } | null = null;
          for (const st of STATIONS) {
            if (st.unlockRank > s.rank) continue;
            const p = getPrice(s, st.id, goodId);
            if (!best || p < best.price) best = { id: st.id, price: p };
          }
          return best ? stationDisplayName(best.id, s.sector, s.runSeed ?? 0) : null;
        };
        return (
          <div key={m.id} class={`contract-row${ready ? ' ready' : ''}`}>
            <div class="c-main">
              <div class="c-dest">{station?.icon} {station ? stationDisplayName(station.id, s.sector, s.runSeed ?? 0) : m.stationId} · ⏱ {formatDuration(m.expiresAt - t)}</div>
              <div class="c-items">
                {m.items.map((it) => {
                  const g = goodById(it.goodId, s.runSeed ?? 0);
                  const have = s.cargo[it.goodId]?.qty ?? 0;
                  return (
                    <span key={it.goodId} class={`c-item${have >= it.qty ? ' have' : ''}`}>
                      {g?.icon} {g?.name ?? it.goodId} {formatNum(have)}/{formatNum(it.qty)}
                      {have < it.qty && <span class="c-src"> · 📍 {cheapestSource(it.goodId) ?? '?'}</span>}
                    </span>
                  );
                })}
              </div>
            </div>
            <button class="btn btn-primary" disabled={!ready} onClick={() => deliverManifest(m.id)}>
              {formatCredits(m.rewardCredits)}
            </button>
          </div>
        );
      })}
      {s.manifests.filter((m) => m.expiresAt > t).length === 0 && <div class="empty-hint">New contracts incoming…</div>}
    </div>
  );
}
