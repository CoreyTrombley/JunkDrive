import { store } from '../engine/store';
import { goodById } from '../engine/pricing';
import { formatCredits, formatNum, formatDuration, formatPct } from '../engine/num';
import { emit } from '../engine/bus';

function topEntry(record: Record<string, number>): { id: string; qty: number } | null {
  let best: { id: string; qty: number } | null = null;
  for (const [id, qty] of Object.entries(record)) {
    if (!best || qty > best.qty) best = { id, qty };
  }
  return best;
}

export function StatsScreen() {
  const s = store.value;

  return (
    <>
      <div class="card">
        <div class="card-header"><span class="ch-icon">🏆</span>CAREER</div>
        <div class="bests-grid">
          <div class="best-tile"><div class="bt-label">Jumps</div><div class="bt-val mono">{formatNum(s.stats.totalJumps)}</div></div>
          <div class="best-tile"><div class="bt-label">Sales</div><div class="bt-val mono">{formatNum(s.stats.totalSales)}</div></div>
          <div class="best-tile"><div class="bt-label">Rig Taps</div><div class="bt-val mono">{formatNum(s.stats.totalTaps)}</div></div>
          <div class="best-tile"><div class="bt-label">Wormhole Runs</div><div class="bt-val mono">{formatNum(s.stats.totalPrestiges)}</div></div>
          <div class="best-tile"><div class="bt-label">Active Time</div><div class="bt-val mono">{formatDuration(s.stats.activePlayMs)}</div></div>
          {(() => {
            const sold = topEntry(s.stats.goodsSold);
            const soldGood = sold ? goodById(sold.id) : null;
            return (
              <div class="best-tile">
                <div class="bt-label">Most Sold</div>
                <div class="bt-val mono">{sold ? `${soldGood?.icon ?? ''} ${formatNum(sold.qty)}` : '—'}</div>
                {sold && <div class="bt-sub">{soldGood?.name ?? sold.id}</div>}
              </div>
            );
          })()}
          {(() => {
            const bought = topEntry(s.stats.goodsBought);
            const boughtGood = bought ? goodById(bought.id) : null;
            return (
              <div class="best-tile">
                <div class="bt-label">Most Bought</div>
                <div class="bt-val mono">{bought ? `${boughtGood?.icon ?? ''} ${formatNum(bought.qty)}` : '—'}</div>
                {bought && <div class="bt-sub">{boughtGood?.name ?? bought.id}</div>}
              </div>
            );
          })()}
          <div class="best-tile"><div class="bt-label">Credits Earned</div><div class="bt-val mono">{formatCredits(s.stats.creditsEarned)}</div></div>
          <div class="best-tile"><div class="bt-label">Credits Spent</div><div class="bt-val mono">{formatCredits(s.stats.creditsSpent)}</div></div>
          <div class="best-tile"><div class="bt-label">Biggest Sale</div><div class="bt-val mono">{formatCredits(s.bests.biggestSale)}</div></div>
          <div class="best-tile"><div class="bt-label">Best Flip Margin</div><div class="bt-val mono">{formatPct(s.bests.bestFlipMargin, { signed: true })}</div></div>
          <div class="best-tile"><div class="bt-label">Deepest Sector</div><div class="bt-val mono">{s.bests.deepestSector}</div></div>
          <div class="best-tile"><div class="bt-label">Fastest ₡1M</div><div class="bt-val mono">{s.bests.fastestMillionMs != null ? formatDuration(s.bests.fastestMillionMs) : '—'}</div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="ch-icon">🪙</span>MILESTONE WALL</div>
        {s.milestones.length === 0 ? (
          <div class="empty-hint">Cross ₡10 net worth to start the wall.</div>
        ) : (
          <div class="codex-grid">
            {s.milestones.slice().sort((a, b) => a - b).map((p) => (
              <div key={p} class="codex-cell got" onClick={() => emit({ type: 'toast', text: `Milestone — crossed ₡10^${p} net worth`, icon: '🏆' })}>🏆</div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
