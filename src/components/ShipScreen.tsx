import { store } from '../engine/store';
import { SHIP_UPGRADES, upgradeCost } from '../config/ship';
import { buyShipUpgrade } from '../engine/actions';
import { formatCredits, formatNum, formatDuration } from '../engine/num';
import { maxHold, usedHold, maxFuel } from '../engine/derived';

export function ShipScreen() {
  const s = store.value;
  const ownedMods = SHIP_UPGRADES.filter((u) => (s.shipUpgrades[u.id] || 0) > 0);

  return (
    <div class="screen">
      <div class="screen-header">
        <span class="icon">🚀</span>
        <div>
          <h1>Dry Dock</h1>
          <div class="sub">Cargo {formatNum(usedHold(s))}m³ / {formatNum(maxHold(s))}m³ · Fuel {maxFuel(s)} max</div>
        </div>
      </div>

      <div class="ship-diagram">
        <span class="hull">🚀</span>
        {ownedMods.map((u) => (
          <span key={u.id} class="mod-chip" title={u.name}>{u.icon}</span>
        ))}
      </div>

      <div class="card"><div class="card-header"><span class="ch-icon">🛠️</span>UPGRADES</div>
      {SHIP_UPGRADES.map((u) => {
        const level = s.shipUpgrades[u.id] || 0;
        const maxed = u.maxLevel != null && level >= u.maxLevel;
        const cost = maxed ? 0 : upgradeCost(u, level);
        return (
          <div key={u.id} class="upgrade-row">
            <div class="u-icon">{u.icon}</div>
            <div class="u-info">
              <div class="u-name">{u.name}</div>
              <div class="u-effect">{u.effectLabel(level)}</div>
              <div class="u-level">{u.maxLevel != null ? `Level ${level}/${u.maxLevel}` : `Level ${level}`}</div>
            </div>
            <button class="btn btn-primary" disabled={maxed || s.credits < cost} onClick={() => buyShipUpgrade(u.id)}>
              {maxed ? 'MAXED' : formatCredits(cost)}
            </button>
          </div>
        );
      })}
      </div>

      <div class="card"><div class="card-header"><span class="ch-icon">🏆</span>PERSONAL BESTS</div>
      <div class="bests-grid">
        <div class="best-tile">
          <div class="bt-label">Best Margin</div>
          <div class="bt-val mono">+{Math.round(s.bests.bestFlipMargin * 100)}%</div>
        </div>
        <div class="best-tile">
          <div class="bt-label">Biggest Sale</div>
          <div class="bt-val mono">{formatCredits(s.bests.biggestSale)}</div>
        </div>
        <div class="best-tile">
          <div class="bt-label">Deepest Sector</div>
          <div class="bt-val mono">{formatNum(s.bests.deepestSector)}</div>
        </div>
        <div class="best-tile">
          <div class="bt-label">Fastest ₡1M</div>
          <div class="bt-val mono">{s.bests.fastestMillionMs ? formatDuration(s.bests.fastestMillionMs) : '—'}</div>
        </div>
      </div>
      </div>
    </div>
  );
}
