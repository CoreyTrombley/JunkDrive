# JUNKRUN Trade & Travel Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tonnage-based cargo, market sort/filter, a living economy (station stocks + trade manifests), and a per-run warp-lane graph map with multi-stop route planning.

**Architecture:** Three shippable phases. Phase 1 converts the cargo hold to tonnage and adds market view controls. Phase 2 adds station stock levels that react to trades (dynamic pricing) and manifest contracts (buy-combinations objective) — on the existing ring map. Phase 3 replaces the ring with a seeded 13-node warp-lane graph per sector (7 stations + 5 waypoints + gate), Dijkstra routing, and a multi-stop route queue. New pure engines get their own modules (`marketview.ts`, `stocks.ts`, `manifests.ts`, `mapgen.ts`, `routing.ts`); reducers stay in `actions.ts`.

**Tech Stack:** Preact + @preact/signals, strict TypeScript, vitest (already set up: `npm test`), Web Audio (synth only), Node balance sim (`npm run balance`).

**Spec:** `docs/superpowers/specs/2026-07-16-trade-travel-overhaul-design.md` — read it once before Task 1 if you want context; every number you need is also inlined below.

## Global Constraints

- **Never break old saves.** New top-level state fields (`stocks`, `manifests`, `manifestSeq`, `lastSalvageAt`, `settings.marketSort`, `settings.marketFilters`) must backfill in BOTH `bootGame` (actions.ts) and `importSave`/`importSaveCode` paths. Goods keep their ids. **The procedural-goods rng stream must not shift**: for `runSeed 0`, `generateSectorGoods(2, 0)` must still produce exactly `Prismatic Spores(55)/Feral Lattices(544,contraband)/Irradiated Cinders(3228,contraband)/Synthetic Husks(39159)` — the new `mass` roll therefore uses its own per-good rng, never the main stream.
- Exact sim-verified constants — copy verbatim, do not re-tune: hold base **20t**, cargo_hold **+5t/level** (cost 800 × 1.65^lvl unchanged), Graviton Frame **×(1 + 0.25·lvl)**, max 5, cost **250,000 × 5^lvl**; bigger_bones relic **+8t × 2^(lvl−1)** (lvl 1 = +8t, doubling each level — Task 2's code and test are authoritative); goods masses as listed in Task 1; stock baselines **120/40/70** (exporter/importer/neutral), regen **12%** of gap per pulse (**20%** at exporters), price mult `S≤B → 1 + 0.5·(1 − S/B)`, `S>B → max(0.7, 1 − 0.3·(S/B − 1))`; manifest premium **1.7–2.2×**, expiry **20–40 min**, 3 slots, XP `Math.round(1.5 * saleXp(rewardCredits * 0.45))`; lanes fuel **1 or 2** (long lanes 2), traits safe/pirate/express at **70/20/10%**, pirate-lane toll chance **0.3**; `BASE_MAX_FUEL` **8**, `BASE_FUEL_REGEN_SEC` **65**, recycler **−6s/lvl**, floor **35s**; depot fuel price `max(50, netWorth × 0.02)`; salvage cooldown **10 min**.
- `npm run typecheck` (strict tsc) must exit 0 after every task; `npm test` must be green after every task.
- No new runtime dependencies. Audio stays 100% synthesized.
- `npm run balance` keeps passing mid-plan (it models the OLD system until Task 15 swaps the model — that is expected and fine).
- Work on branch `trade-travel-overhaul` (created in Task 1). Commit messages end with:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Codebase orientation (read once)

- State shape + initial values: `src/engine/state.ts` (`GameState`, `createInitialState`). All mutations flow through `src/engine/actions.ts` reducers; UI reads `store.value` (`src/engine/store.ts`).
- Prices: `getPrice(state, stationId, goodId)` in `src/engine/pricing.ts` = `base × bias × wave × events × sectorScale` (`computePrice` in `price.ts`). `biasFor` handles hand-authored sector-1, per-run re-rolls, and procedural sectors. `runSeed` (0 = legacy save) threads through all procedural generators via XOR.
- Cargo is `state.cargo: Record<goodId, { qty, avgCost }>`; hold math in `src/engine/derived.ts` (`maxHold`, `usedHold`).
- Fuel: pips, regen in `derived.ts`; constants in `state.ts`.
- Save backfills: `bootGame` in actions.ts does `{ ...loaded, settings: {...fresh…}, stats: {...fresh…}, runSeed: … }`; `importSave` mirrors it; `importSaveCode` (save.ts) backfills `runSeed`.
- Tests live in `src/engine/__tests__/*.test.ts` (vitest, node env — no `document`).

---

# PHASE 1 — Tonnage cargo + market controls

### Task 1: Goods gain mass

**Files:**
- Modify: `src/config/types.ts` (Good interface)
- Modify: `src/config/goods.ts` (24 authored masses)
- Modify: `src/engine/sectorgen.ts` (procedural masses via side-channel rng)
- Test: `src/engine/__tests__/mass.test.ts`

**Interfaces:**
- Produces: `Good.mass: number` (tons per unit) on every good, authored and procedural. Procedural masses are id-stable per (sector, runSeed) and DO NOT consume the main generator rng stream.

- [ ] **Step 1: Write the failing test** — create `src/engine/__tests__/mass.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GOODS, GOODS_BY_ID } from '../../config/goods';
import { generateSectorGoods } from '../sectorgen';

describe('good masses', () => {
  it('every authored good has a positive mass', () => {
    for (const g of GOODS) expect(g.mass).toBeGreaterThan(0);
  });

  it('authored spot values match the spec', () => {
    expect(GOODS_BY_ID['scrap_metal'].mass).toBe(6);
    expect(GOODS_BY_ID['hull_plates'].mass).toBe(7.5);
    expect(GOODS_BY_ID['earth_relics'].mass).toBe(0.9);
    expect(GOODS_BY_ID['ghost_ships'].mass).toBe(4.5);
    expect(GOODS_BY_ID['time_crystals'].mass).toBe(0.25);
  });

  it('procedural goods roll band masses within range, deterministically', () => {
    const bands = [6, 3.75, 1.5, 0.6];
    const a = generateSectorGoods(2, 777);
    const b = generateSectorGoods(2, 777);
    expect(a.map((g) => g.mass)).toEqual(b.map((g) => g.mass));
    a.forEach((g, band) => {
      expect(g.mass).toBeGreaterThanOrEqual(bands[band] * 0.7 - 1e-9);
      expect(g.mass).toBeLessThanOrEqual(bands[band] * 1.3 + 1e-9);
    });
  });

  it('SAVE-COMPAT: mass roll must not shift the legacy rng stream', () => {
    // Pinned from the shipped generator at runSeed 0 — if these change, legacy
    // saves would see renamed/repriced goods. The mass roll must use its own rng.
    const s2 = generateSectorGoods(2, 0);
    expect(s2.map((g) => ({ id: g.id, name: g.name, base: g.base, contraband: !!g.contraband }))).toEqual([
      { id: 's2_g0', name: 'Prismatic Spores', base: 55, contraband: false },
      { id: 's2_g1', name: 'Feral Lattices', base: 544, contraband: true },
      { id: 's2_g2', name: 'Irradiated Cinders', base: 3228, contraband: true },
      { id: 's2_g3', name: 'Synthetic Husks', base: 39159, contraband: false },
    ]);
    const s3 = generateSectorGoods(3, 0);
    expect(s3.map((g) => g.name)).toEqual(['Irradiated Filaments', 'Ancient Husks', 'Crystalline Lattices', 'Phase-Shifted Ingots']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/engine/__tests__/mass.test.ts`
Expected: FAIL — `mass` is undefined (and a TS error until Step 3 lands; a compile failure IS the expected RED here).

- [ ] **Step 3: Add the field** — in `src/config/types.ts`, `interface Good`, after `base: number;` add:

```ts
  mass: number; // tons per unit — tonnage hold currency (spec 2026-07-16)
```

- [ ] **Step 4: Author the 24 masses** — in `src/config/goods.ts`, add `mass` to each entry (after `base`). Exact values:

```
scrap_metal 6 · water_ice 4.5 · protein_packs 3 · hull_plates 7.5
copper_coil 4.5 · coolant 3.75 · fuel_rods 4.5 · spore_crates 2.25
med_gel 1.5 · machine_parts 3.75 · circuit_bundles 1.2 · earth_relics 0.9
alien_ceramics 1.8 · banned_ai_chips 0.6 · warp_cells 1.2 · neutrino_lenses 0.75
alien_artifacts 0.9 · cryo_megafauna 3.0 · antimatter_vials 0.45 · singularity_shards 0.4
dark_relics 0.45 · stellar_cores 1.5 · ghost_ships 4.5 · time_crystals 0.25
```

e.g. the first line becomes:

```ts
  { id: 'scrap_metal', name: 'Scrap Metal', icon: '⚙️', tier: 1, unlockRank: 1, base: 10, mass: 6, volatility: 'calm' },
```

- [ ] **Step 5: Procedural masses (side-channel rng)** — in `src/engine/sectorgen.ts`, inside `generateSectorGoods`'s band loop, after `const unlockRank = …` and before `goods.push(…)`, add:

```ts
    const bandMass = [6, 3.75, 1.5, 0.6][band];
    // Mass rolls from a per-good side rng — NEVER the main `rng` stream, which
    // must keep emitting the exact legacy sequence for runSeed 0 saves.
    const massRng = mulberry32((hashSeed(`s${sector}_g${band}-mass`) ^ (runSeed >>> 0)) >>> 0);
    const mass = Math.round(bandMass * randRange(massRng, 0.7, 1.3) * 100) / 100;
```

and add `mass,` to the pushed object literal (after `base,`).

- [ ] **Step 6: Verify**

Run: `npx vitest run src/engine/__tests__/mass.test.ts` — Expected: PASS (all 4, including the pinned legacy snapshot).
Run: `npm test` then `npm run typecheck` — Expected: green / exit 0.

- [ ] **Step 7: Create the branch and commit**

```bash
git checkout -b trade-travel-overhaul
git add src/config/types.ts src/config/goods.ts src/engine/sectorgen.ts src/engine/__tests__/mass.test.ts
git commit -m "feat: goods carry mass (tons) — authored + side-channel procedural rolls

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Tonnage hold engine

**Files:**
- Modify: `src/engine/state.ts` (BASE_HOLD → BASE_HOLD_TONS)
- Modify: `src/engine/derived.ts` (`maxHold` in tons, `usedHold` mass-weighted, new `freeCapacityUnits`)
- Modify: `src/config/ship.ts` (cargo_hold label, new `graviton_frame`)
- Modify: `src/config/relics.ts` (bigger_bones label)
- Modify: `src/engine/actions.ts` (every free-capacity call site)
- Modify: `src/engine/quests.ts` (flip_units goals become mass-aware)
- Modify: `src/engine/__tests__/tuning.test.ts` (its old hold test pins the unit model)
- Test: `src/engine/__tests__/tonnage.test.ts`

**Interfaces:**
- Produces: `maxHold(state): number` now returns TONS; `usedHold(state): number` returns tons carried (Σ qty × mass); `freeCapacityUnits(state, goodId): number` = whole units of that good that still fit. All later tasks and UI use these three.
- Consumes: `Good.mass` (Task 1); `goodById` from `./pricing`.

- [ ] **Step 1: Write the failing test** — create `src/engine/__tests__/tonnage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';
import { maxHold, usedHold, freeCapacityUnits } from '../derived';
import { SHIP_UPGRADES_BY_ID, upgradeCost } from '../../config/ship';

describe('tonnage hold', () => {
  it('base hold is 20 tons; cargo_hold adds 5t/level; graviton multiplies', () => {
    const s = createInitialState();
    expect(maxHold(s)).toBe(20);
    s.shipUpgrades['cargo_hold'] = 4;
    expect(maxHold(s)).toBe(40);
    s.shipUpgrades['graviton_frame'] = 2;
    expect(maxHold(s)).toBeCloseTo(40 * 1.5, 6);
  });

  it('bigger_bones adds 8t × 2^(level-1) — level 1 = +8, level 2 = +16 total', () => {
    const s = createInitialState();
    s.relics['bigger_bones'] = 1;
    expect(maxHold(s)).toBe(28);
    s.relics['bigger_bones'] = 2;
    expect(maxHold(s)).toBe(36);
  });

  it('usedHold weighs cargo by mass', () => {
    const s = createInitialState();
    s.cargo = { scrap_metal: { qty: 2, avgCost: 5 }, earth_relics: { qty: 3, avgCost: 500 } };
    expect(usedHold(s)).toBeCloseTo(2 * 6 + 3 * 0.9, 6);
  });

  it('freeCapacityUnits floors by the good mass and never goes negative', () => {
    const s = createInitialState(); // 20t free
    expect(freeCapacityUnits(s, 'hull_plates')).toBe(2); // 7.5t each
    expect(freeCapacityUnits(s, 'time_crystals')).toBe(80); // 0.25t each
    s.cargo = { scrap_metal: { qty: 4, avgCost: 5 } }; // 24t used — over cap is legal for legacy saves
    expect(freeCapacityUnits(s, 'med_gel')).toBe(0);
  });

  it('graviton_frame upgrade def matches spec', () => {
    const def = SHIP_UPGRADES_BY_ID['graviton_frame'];
    expect(def.maxLevel).toBe(5);
    expect(upgradeCost(def, 0)).toBe(250_000);
    expect(upgradeCost(def, 1)).toBe(1_250_000);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/engine/__tests__/tonnage.test.ts` — Expected: FAIL (`freeCapacityUnits` missing; maxHold returns 10-based units).

- [ ] **Step 3: Constants** — `src/engine/state.ts`: replace `export const BASE_HOLD = 10;` with:

```ts
export const BASE_HOLD_TONS = 20;
```

- [ ] **Step 4: Derived math** — `src/engine/derived.ts`: update the import from `./state` to `BASE_HOLD_TONS`, add `import { goodById } from './pricing';`, and replace `maxHold`/`usedHold` with:

```ts
export function maxHold(state: GameState): number {
  const cargoLevel = state.shipUpgrades['cargo_hold'] || 0;
  const relicLevel = state.relics['bigger_bones'] || 0;
  const gravLevel = state.shipUpgrades['graviton_frame'] || 0;
  const relicTons = relicLevel > 0 ? 8 * Math.pow(2, relicLevel - 1) : 0;
  return (BASE_HOLD_TONS + cargoLevel * 5 + relicTons) * (1 + 0.25 * gravLevel);
}

/** Tons currently carried. */
export function usedHold(state: GameState): number {
  let tons = 0;
  for (const key in state.cargo) tons += state.cargo[key].qty * (goodById(key)?.mass ?? 1);
  return tons;
}

/** Whole units of `goodId` that still fit in the hold (0 when over capacity). */
export function freeCapacityUnits(state: GameState, goodId: string): number {
  const mass = goodById(goodId)?.mass ?? 1;
  return Math.max(0, Math.floor((maxHold(state) - usedHold(state)) / mass));
}
```

(Import-cycle note: `derived → pricing → store → state` is acyclic — nothing in that chain imports `derived`.)

- [ ] **Step 5: Ship config** — `src/config/ship.ts`: change cargo_hold's `effectLabel` to `` (lvl) => `+${lvl * 5}t hold (currently +${lvl * 5}t)` `` (baseCost 800 / costGrowth 1.65 / maxLevel null unchanged). After the `jump_drive` entry, add:

```ts
  {
    id: 'graviton_frame',
    name: 'Graviton Frame',
    icon: '⚖️',
    effectLabel: (lvl) => `Hold ×${(1 + 0.25 * lvl).toFixed(2)} (compresses cargo mass)`,
    baseCost: 250_000,
    costGrowth: 5,
    maxLevel: 5,
  },
```

- [ ] **Step 6: Relic label** — `src/config/relics.ts` bigger_bones: `effectLabel: '+8t base hold, doubling each level (+8, +16, +32…)'` (costs unchanged; the formula is 8 × 2^(level−1), exactly what Step 4's code and Step 1's test implement).

- [ ] **Step 7: Update every free-capacity call site in `src/engine/actions.ts`.** Add `freeCapacityUnits` to the existing `./derived` import. Then:

7a. `buyGood`: replace

```ts
  const free = maxHold(state) - usedHold(state);
  const buyQty = Math.min(qty, free);
```

with

```ts
  const buyQty = Math.min(qty, freeCapacityUnits(state, goodId));
```

7b. There are exactly five other `maxHold(st) - usedHold(st)` capacity computations, all of the form `Math.min(<roll>, maxHold(st) - usedHold(st))`, in: `applyArrivalRoll` petty_salvage case, `applyArrivalRoll` motherlode jackpot, `resolveEncounter` derelict board, wandering_trader deal, distress_call gift. For **petty_salvage, wandering_trader and distress_call** the substitution is in-place: `good` is already declared above the capacity line, so just replace the `maxHold(st) - usedHold(st)` term with `freeCapacityUnits(st, good.id)`.

**Motherlode and derelict both declare the capacity BEFORE `good` is chosen — an in-place swap would be a TS2448 use-before-declaration error. Replace their whole blocks:**

The motherlode case becomes (note the windfall is budgeted by tonnage, so light exotics don't grant 80 units nor heavy goods 2):

```ts
      if (jackpotId === 'motherlode') {
        const bestTier = bestUnlockedTier(st.rank);
        const pool = GOODS.filter((g) => g.tier <= bestTier + 1 && g.unlockRank <= st.rank + 5);
        const good = pool.length ? pick(sessionRng, pool) : GOODS[0];
        // Windfall budget: up to half the hold's tonnage in this good, at least 3
        // units when space exists, never more than 60 — keeps the jackpot's value
        // roughly mass-independent instead of scaling with 1/mass.
        const budgetUnits = Math.max(3, Math.floor((maxHold(st) * 0.5) / good.mass));
        const free = Math.min(freeCapacityUnits(st, good.id), budgetUnits, 60);
        if (free > 0) st = { ...st, cargo: addCargo(st.cargo, good.id, free, 0) };
      }
```

The derelict board-success branch (inside `resolveEncounter`, `case 'derelict'`, the `if (success)` block) becomes — the qty computation moves BELOW the `good` selection:

```ts
            const minQ = Number(choice.params?.gainMinQty ?? 2);
            const maxQ = Number(choice.params?.gainMaxQty ?? 6);
            const bestTier = bestUnlockedTier(st.rank);
            const pool = GOODS.filter((g) => g.tier <= bestTier + 1 && g.unlockRank <= st.rank + 3);
            const good = pool.length ? pick(sessionRng, pool) : GOODS[0];
            const qty = Math.min(randInt(sessionRng, minQ, maxQ), freeCapacityUnits(st, good.id));
```

(the following lines — `addCargo`, `resultText`, the outcome assignment — are unchanged).

- [ ] **Step 7c: Update the legacy hold test** — `src/engine/__tests__/tuning.test.ts` pins the OLD unit model and would fail the gate. Replace its `'cargo hold gives +3 per level'` test with:

```ts
  it('cargo hold gives +5t per level', () => {
    const s = createInitialState();
    s.shipUpgrades['cargo_hold'] = 4;
    expect(maxHold(s)).toBe(20 + 4 * 5);
  });
```

Leave the file's other tests (`cargo hold cost growth is 1.65`, fuel regen, demand spike) untouched — Task 12 updates the fuel one.

- [ ] **Step 7d: Mass-aware quest goals** — in `src/engine/quests.ts`, add `maxHold` to the existing `./derived` import (it already imports `netWorth`), then replace the `case 'flip_units':` block in `generateQuest` with:

```ts
    case 'flip_units': {
      // Tonnage-aware: keep tiny quests tiny for heavy goods (≈ ≤2 full holds).
      const unitsPerHold = Math.max(1, Math.floor(maxHold(state) / good.mass));
      const cap = Math.max(3, Math.min(16, unitsPerHold * 2));
      goal = randInt(rng, Math.min(5, cap), cap);
      goodId = good.id;
      label = fillLabel(tpl.label, { n: goal, good: good.name });
      break;
    }
```

- [ ] **Step 8: Verify** — `npx vitest run src/engine/__tests__/tonnage.test.ts` PASS; `npm test` green (tuning.test.ts's old hold test was replaced in Step 7c — any OTHER failure means an actions.ts call site was missed); `npm run typecheck` exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/engine/state.ts src/engine/derived.ts src/config/ship.ts src/config/relics.ts src/engine/actions.ts src/engine/quests.ts src/engine/__tests__/tuning.test.ts src/engine/__tests__/tonnage.test.ts
git commit -m "feat: cargo hold is tonnage — 20t base, +5t/level, graviton frame multiplier

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Tonnage UI

**Files:**
- Modify: `src/components/TradeSheet.tsx`, `src/components/MarketScreen.tsx`, `src/components/ShipScreen.tsx`, `src/components/Onboarding.tsx`

**Interfaces:**
- Consumes: `maxHold` (tons), `usedHold` (tons), `freeCapacityUnits` (Task 2).

- [ ] **Step 1: TradeSheet** — in `src/components/TradeSheet.tsx`:
  - add `freeCapacityUnits` to the `../engine/derived` import;
  - replace the `free`/`maxQty` lines:

```ts
  const maxQty = mode === 'buy'
    ? Math.max(0, Math.min(freeCapacityUnits(s, good.id), Math.floor(s.credits / Math.max(0.01, price))))
    : owned;
```

  (delete the now-unused `const free = maxHold(s) - usedHold(s);` line);
  - in the `sheet-sub` line append mass info: after `{formatCredits(price)} / unit` add `` {` · ${good.mass}t/unit`} ``;
  - replace the buy-mode cargo line `

```tsx
          <div class="pl-line">
            <span>Cargo hold</span>
            <span class="val mono">{(usedHold(s) + clampedQty * good.mass).toFixed(1)}t / {maxHold(s).toFixed(0)}t</span>
          </div>
```

- [ ] **Step 2: MarketScreen row** — in `src/components/MarketScreen.tsx`, in the unlocked-good branch, extend the owned line to include mass:

```tsx
                  <div class="g-owned">{owned > 0 ? `Owned: ${formatNum(owned)} · ` : disabled ? 'Embargoed here · ' : ''}{g.mass}t</div>
```

(replacing the existing `g-owned` div.)

- [ ] **Step 3: ShipScreen header** — in `src/components/ShipScreen.tsx` replace the `sub` line:

```tsx
          <div class="sub">Cargo {usedHold(s).toFixed(1)}t / {maxHold(s).toFixed(0)}t · Fuel {maxFuel(s)} max</div>
```

(add `usedHold` to the derived import.)

- [ ] **Step 4: Fix the tutorial for tonnage** — the tutorial asks for 10 Scrap Metal, but scrap is 6t/unit and the base hold is 20t (max 3 units) — without this fix new players soft-lock on step 1. In `src/components/Onboarding.tsx`:
  - `STEP_TEXT[1]` becomes: `'🐜 Rust Harbor is stocked. Buy 3 Scrap Metal on the MARKET tab to get started.'`
  - the step-1 gate (`(s.cargo['scrap_metal']?.qty ?? 0) >= 10`) becomes `>= 3`.

(Step 3's "sell for a profit" beat still works with 3 units — Rust Harbor exports scrap cheap, Neon Bazaar doesn't.)

- [ ] **Step 5: Verify** — `npm run typecheck` exit 0; `npm test` green. Optional: `npm run dev` → buy sheet shows `t/unit`, cargo line shows tons; fresh save can complete tutorial step 1.

- [ ] **Step 6: Commit**

```bash
git add src/components/TradeSheet.tsx src/components/MarketScreen.tsx src/components/ShipScreen.tsx src/components/Onboarding.tsx
git commit -m "feat: tonnage in trade sheet, market rows, ship screen; tutorial fits the hold

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Market view engine (sort + filter)

**Files:**
- Create: `src/engine/marketview.ts`
- Modify: `src/engine/state.ts` (Settings fields + defaults)
- Test: `src/engine/__tests__/marketview.test.ts`

**Interfaces:**
- Produces: `type MarketSort = 'default' | 'price' | 'vsAvg' | 'owned' | 'profit' | 'perTon'`; `interface MarketFilters { owned: boolean; affordable: boolean; hideContraband: boolean; tier: number | null }`; `applyMarketView(goods: Good[], state: GameState, sort: MarketSort, filters: MarketFilters): Good[]` (pure — filters then sorts; locked goods always sink to the bottom in unlock order). `Settings.marketSort: MarketSort` and `Settings.marketFilters: MarketFilters` with defaults `'default'` / all-off.
- Consumes: `getPrice`, `sectorScale`, `Good.mass`.

- [ ] **Step 1: Write the failing test** — create `src/engine/__tests__/marketview.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';
import { GOODS_BY_ID } from '../../config/goods';
import { applyMarketView, type MarketFilters } from '../marketview';

const NO_FILTERS: MarketFilters = { owned: false, affordable: false, hideContraband: false, tier: null };

describe('market view', () => {
  it('filters to owned goods', () => {
    const s = createInitialState();
    s.rank = 10;
    s.cargo = { coolant: { qty: 2, avgCost: 50 } };
    const goods = [GOODS_BY_ID['coolant'], GOODS_BY_ID['med_gel']];
    const out = applyMarketView(goods, s, 'default', { ...NO_FILTERS, owned: true });
    expect(out.map((g) => g.id)).toEqual(['coolant']);
  });

  it('hides contraband and filters by tier', () => {
    const s = createInitialState();
    s.rank = 30;
    const goods = [GOODS_BY_ID['banned_ai_chips'], GOODS_BY_ID['warp_cells'], GOODS_BY_ID['coolant']];
    const noBan = applyMarketView(goods, s, 'default', { ...NO_FILTERS, hideContraband: true });
    expect(noBan.every((g) => !g.contraband)).toBe(true);
    const t4 = applyMarketView(goods, s, 'default', { ...NO_FILTERS, tier: 4 });
    expect(t4.map((g) => g.id).sort()).toEqual(['banned_ai_chips', 'warp_cells']);
  });

  it('sorts by price descending and by value density (₡/ton)', () => {
    const s = createInitialState();
    s.rank = 30;
    const goods = [GOODS_BY_ID['scrap_metal'], GOODS_BY_ID['time_crystals'], GOODS_BY_ID['coolant']];
    const byPrice = applyMarketView(goods, s, 'price', NO_FILTERS);
    expect(byPrice[0].id).toBe('time_crystals');
    const byDensity = applyMarketView(goods, s, 'perTon', NO_FILTERS);
    expect(byDensity[0].id).toBe('time_crystals'); // 2.5M / 0.25t
    expect(byDensity[byDensity.length - 1].id).toBe('scrap_metal'); // 10 / 6t
  });

  it('locked goods always sink below unlocked ones', () => {
    const s = createInitialState(); // rank 1
    const goods = [GOODS_BY_ID['time_crystals'], GOODS_BY_ID['scrap_metal']];
    const out = applyMarketView(goods, s, 'price', NO_FILTERS);
    expect(out[0].id).toBe('scrap_metal');
  });

  it('sorts by profit-if-sold-here using cargo avgCost', () => {
    const s = createInitialState();
    s.rank = 10;
    s.cargo = { coolant: { qty: 5, avgCost: 1 }, med_gel: { qty: 5, avgCost: 1e9 } };
    const goods = [GOODS_BY_ID['med_gel'], GOODS_BY_ID['coolant']];
    const out = applyMarketView(goods, s, 'profit', NO_FILTERS);
    expect(out[0].id).toBe('coolant');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/engine/__tests__/marketview.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — create `src/engine/marketview.ts`:

```ts
// Pure sort/filter for the market goods list — spec 2026-07-16 feature 1.
import type { Good } from '../config/types';
import type { GameState } from './state';
import { getPrice } from './pricing';
import { sectorScale } from './price';

export type MarketSort = 'default' | 'price' | 'vsAvg' | 'owned' | 'profit' | 'perTon';

export interface MarketFilters {
  owned: boolean;
  affordable: boolean;
  hideContraband: boolean;
  tier: number | null;
}

export const DEFAULT_FILTERS: MarketFilters = { owned: false, affordable: false, hideContraband: false, tier: null };

export const SORT_LABELS: Record<MarketSort, string> = {
  default: 'Tier', price: 'Price', vsAvg: 'vs Avg', owned: 'Owned', profit: 'Profit', perTon: '₡/ton',
};

export function applyMarketView(goods: Good[], state: GameState, sort: MarketSort, filters: MarketFilters): Good[] {
  const price = (g: Good) => getPrice(state, state.currentStation, g.id);
  const unlocked = (g: Good) => g.unlockRank <= state.rank;

  let list = goods.filter((g) => {
    if (!unlocked(g)) return true; // locked rows stay visible (sunk below) unless a filter drops them
    if (filters.owned && !(state.cargo[g.id]?.qty > 0)) return false;
    if (filters.affordable && price(g) > state.credits) return false;
    if (filters.hideContraband && g.contraband) return false;
    if (filters.tier !== null && g.tier !== filters.tier) return false;
    return true;
  });
  if (filters.owned || filters.affordable) list = list.filter(unlocked); // those filters imply "usable now"
  if (filters.tier !== null) list = list.filter((g) => g.tier === filters.tier);

  const key = (g: Good): number => {
    switch (sort) {
      case 'price': return price(g);
      case 'vsAvg': {
        const neutral = g.base * sectorScale(state.sector);
        return neutral > 0 ? price(g) / neutral : 0;
      }
      case 'owned': return state.cargo[g.id]?.qty ?? 0;
      case 'profit': {
        const entry = state.cargo[g.id];
        return entry && entry.qty > 0 ? (price(g) - entry.avgCost) * entry.qty : -Infinity;
      }
      case 'perTon': return price(g) / Math.max(0.01, g.mass);
      default: return 0;
    }
  };

  return [...list].sort((a, b) => {
    const ua = unlocked(a) ? 0 : 1;
    const ub = unlocked(b) ? 0 : 1;
    if (ua !== ub) return ua - ub;
    if (sort === 'default' || ua === 1) return a.unlockRank - b.unlockRank || a.base - b.base;
    return key(b) - key(a); // all non-default sorts are descending (biggest first)
  });
}
```

- [ ] **Step 4: Settings fields** — `src/engine/state.ts`:
  - `interface Settings` gains:

```ts
  marketSort: MarketSort;
  marketFilters: MarketFilters;
```

  with `import type { MarketSort, MarketFilters } from './marketview';` at the top (type-only import — no cycle: marketview imports state's *types* only).
  - `createInitialState` settings literal gains:

```ts
      marketSort: 'default',
      marketFilters: { owned: false, affordable: false, hideContraband: false, tier: null },
```

  (Backfill is automatic: bootGame/importSave already merge `settings: { ...fresh.settings, ...loaded.settings }`.)

- [ ] **Step 5: Verify** — focused test PASS; `npm test` green; `npm run typecheck` exit 0. (If tsc reports a circular type issue, ensure the marketview import in state.ts is `import type`.)

- [ ] **Step 6: Commit**

```bash
git add src/engine/marketview.ts src/engine/state.ts src/engine/__tests__/marketview.test.ts
git commit -m "feat: market sort/filter engine with persisted settings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Market control row UI

**Files:**
- Modify: `src/components/MarketScreen.tsx`
- Modify: `src/style.css` (control-row styles)

**Interfaces:**
- Consumes: `applyMarketView`, `SORT_LABELS`, `MarketSort`, `MarketFilters` (Task 4); `updateSettings` (existing).

- [ ] **Step 1: Wire the view** — in `src/components/MarketScreen.tsx`:
  - add imports:

```ts
import { applyMarketView, SORT_LABELS, type MarketSort } from '../engine/marketview';
import { updateSettings } from '../engine/actions';
```

  - replace the `goods` computation:

```ts
  const goods = applyMarketView(
    goodsCatalogForState(s).filter((g) => g.tier >= station.minGoodTier),
    s,
    s.settings.marketSort,
    s.settings.marketFilters
  );
```

- [ ] **Step 2: Control row** — insert between the `section-label` "Goods" div and the goods map:

```tsx
      <div class="market-controls">
        <select
          class="mc-sort"
          value={s.settings.marketSort}
          onChange={(e) => updateSettings({ marketSort: (e.target as HTMLSelectElement).value as MarketSort })}
        >
          {(Object.keys(SORT_LABELS) as MarketSort[]).map((k) => (
            <option key={k} value={k}>↓ {SORT_LABELS[k]}</option>
          ))}
        </select>
        {([['owned', 'Owned'], ['affordable', 'Can buy'], ['hideContraband', 'No ⚠']] as const).map(([key, label]) => (
          <button
            key={key}
            class={`mc-chip${s.settings.marketFilters[key] ? ' on' : ''}`}
            onClick={() => updateSettings({ marketFilters: { ...s.settings.marketFilters, [key]: !s.settings.marketFilters[key] } })}
          >
            {label}
          </button>
        ))}
        <button
          class={`mc-chip${s.settings.marketFilters.tier !== null ? ' on' : ''}`}
          onClick={() => {
            const cur = s.settings.marketFilters.tier;
            const next = cur === null ? 1 : cur >= 6 ? null : cur + 1;
            updateSettings({ marketFilters: { ...s.settings.marketFilters, tier: next } });
          }}
        >
          {s.settings.marketFilters.tier === null ? 'Tier: all' : `Tier ${s.settings.marketFilters.tier}`}
        </button>
      </div>
```

- [ ] **Step 3: Styles** — append to `src/style.css`:

```css
/* Market sort/filter row */
.market-controls { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: 4px 0 10px; }
.market-controls .mc-sort {
  background: var(--surface); color: var(--text); border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px; padding: 5px 8px; font-size: 11px; font-family: inherit;
}
.mc-chip {
  background: var(--surface); color: var(--text); opacity: 0.7; border: 1px solid rgba(255,255,255,0.15);
  border-radius: 999px; padding: 5px 10px; font-size: 11px; font-family: inherit;
}
.mc-chip.on { opacity: 1; border-color: var(--accent); color: var(--accent); }
```

- [ ] **Step 4: Verify** — `npm run typecheck` exit 0; `npm test` green. Manual: `npm run dev` → sort selector reorders; chips filter; choices survive a reload (settings persistence).

- [ ] **Step 5: Commit**

```bash
git add src/components/MarketScreen.tsx src/style.css
git commit -m "feat: market sort selector + filter chips (persisted)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

# PHASE 2 — Living economy: station stocks + trade manifests

### Task 6: Station stocks engine + price integration

**Files:**
- Create: `src/engine/stocks.ts`
- Modify: `src/engine/state.ts` (`stocks` field)
- Modify: `src/engine/pricing.ts` (`getPrice` gains the stock multiplier)
- Modify: `src/engine/actions.ts` (buy/sell mutate stock; pulses regen it; bootGame/importSave backfill)
- Modify: `src/engine/save.ts` (importSaveCode backfill)
- Test: `src/engine/__tests__/stocks.test.ts`

**Interfaces:**
- Produces:
  - `GameState.stocks: Record<string, Record<string, number>>` (sparse; missing = baseline)
  - `stockBaseline(stationId: string, good: Good, runSeed: number): number` — 120 if `biasFor < 0.8` (exporter), 40 if `> 1.25` (importer), else 70
  - `getStock(state: GameState, stationId: string, goodId: string): number`
  - `stockPriceMult(stock: number, baseline: number): number` — `S≤B → 1 + 0.5·(1−S/B)`; `S>B → max(0.7, 1 − 0.3·(S/B−1))`
  - `applyStockTrade(state: GameState, stationId: string, goodId: string, delta: number): GameState` — delta<0 = bought (stock down), delta>0 = sold (stock up); floors at 0
  - `regenStocks(state: GameState, pulses: number): GameState` — each pulse moves every SPARSE entry 12% (20% at exporters) toward baseline; entries within 1.0 of baseline are deleted (keeps saves small)
- Consumes: `biasFor`, `goodById` (pricing), `Good` type.

- [ ] **Step 1: Write the failing test** — create `src/engine/__tests__/stocks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';
import { GOODS_BY_ID } from '../../config/goods';
import { stockBaseline, getStock, stockPriceMult, applyStockTrade, regenStocks } from '../stocks';
import { getPrice, biasFor } from '../pricing';

describe('station stocks', () => {
  it('baselines follow station role', () => {
    const scrap = GOODS_BY_ID['scrap_metal'];
    // legacy matrix (runSeed 0): rust_harbor exports scrap at 0.55, frostdock imports at 1.35
    expect(stockBaseline('rust_harbor', scrap, 0)).toBe(120);
    expect(stockBaseline('frostdock', scrap, 0)).toBe(40);
    expect(stockBaseline('neon_bazaar', scrap, 0)).toBe(70); // bias 1.0
  });

  it('price multiplier: scarcity raises, glut lowers, baseline is neutral', () => {
    expect(stockPriceMult(70, 70)).toBe(1);
    expect(stockPriceMult(0, 70)).toBeCloseTo(1.5, 6);
    expect(stockPriceMult(35, 70)).toBeCloseTo(1.25, 6);
    expect(stockPriceMult(140, 70)).toBeCloseTo(0.7, 6);
    expect(stockPriceMult(1000, 70)).toBeCloseTo(0.7, 6); // floored
  });

  it('trading moves stock and getPrice reacts', () => {
    let s = createInitialState();
    s = { ...s, runSeed: 0 }; // hand-authored matrix for a stable exporter
    const before = getPrice(s, 'rust_harbor', 'scrap_metal');
    s = applyStockTrade(s, 'rust_harbor', 'scrap_metal', -60); // buy 60 units
    expect(getStock(s, 'rust_harbor', 'scrap_metal')).toBe(60);
    const after = getPrice(s, 'rust_harbor', 'scrap_metal');
    expect(after).toBeGreaterThan(before); // scarcity
    s = applyStockTrade(s, 'rust_harbor', 'scrap_metal', 200); // dump 200 back
    expect(getPrice(s, 'rust_harbor', 'scrap_metal')).toBeLessThan(before); // glut
  });

  it('stock floors at zero', () => {
    let s = createInitialState();
    s = applyStockTrade(s, 'neon_bazaar', 'coolant', -9999);
    expect(getStock(s, 'neon_bazaar', 'coolant')).toBe(0);
  });

  it('regen drifts toward baseline and prunes near-baseline entries', () => {
    let s = createInitialState();
    s = { ...s, runSeed: 0 };
    s = applyStockTrade(s, 'rust_harbor', 'scrap_metal', -120); // exporter, B=120 -> S=0
    s = regenStocks(s, 1); // exporter regen 20%: 0 + 0.2*120 = 24
    expect(getStock(s, 'rust_harbor', 'scrap_metal')).toBeCloseTo(24, 6);
    s = regenStocks(s, 30); // long offline catch-up converges...
    expect(getStock(s, 'rust_harbor', 'scrap_metal')).toBeCloseTo(120, 0);
    // ...and the entry is pruned once within 1.0 of baseline
    expect(s.stocks['rust_harbor']?.['scrap_metal']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/engine/__tests__/stocks.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/engine/stocks.ts`:**

```ts
// Station stock levels — the "living market" half of spec 2026-07-16 feature 2.
// Sparse storage: only stations/goods the player has perturbed are stored;
// a missing entry means the stock sits at its baseline.
import type { Good } from '../config/types';
import type { GameState } from './state';
import { biasFor, goodById } from './pricing';

export function stockBaseline(stationId: string, good: Good, runSeed: number): number {
  const bias = biasFor(stationId, good, runSeed);
  if (bias < 0.8) return 120; // exporter: deep supply
  if (bias > 1.25) return 40; // importer: scarce
  return 70;
}

export function getStock(state: GameState, stationId: string, goodId: string): number {
  const entry = state.stocks[stationId]?.[goodId];
  if (entry !== undefined) return entry;
  const good = goodById(goodId, state.runSeed ?? 0);
  return good ? stockBaseline(stationId, good, state.runSeed ?? 0) : 70;
}

export function stockPriceMult(stock: number, baseline: number): number {
  if (baseline <= 0) return 1;
  if (stock <= baseline) return 1 + 0.5 * (1 - stock / baseline);
  return Math.max(0.7, 1 - 0.3 * (stock / baseline - 1));
}

/** delta < 0: player bought (stock drains); delta > 0: player sold (glut). */
export function applyStockTrade(state: GameState, stationId: string, goodId: string, delta: number): GameState {
  const next = Math.max(0, getStock(state, stationId, goodId) + delta);
  return {
    ...state,
    stocks: { ...state.stocks, [stationId]: { ...state.stocks[stationId], [goodId]: next } },
  };
}

/** Advance all perturbed stocks `pulses` steps toward baseline (12%, exporters 20%). */
export function regenStocks(state: GameState, pulses: number): GameState {
  const ids = Object.keys(state.stocks);
  if (ids.length === 0 || pulses <= 0) return state;
  const runSeed = state.runSeed ?? 0;
  const stocks: GameState['stocks'] = {};
  for (const stationId of ids) {
    for (const goodId of Object.keys(state.stocks[stationId])) {
      const good = goodById(goodId, runSeed);
      if (!good) continue;
      const B = stockBaseline(stationId, good, runSeed);
      const rate = B === 120 ? 0.2 : 0.12;
      let S = state.stocks[stationId][goodId];
      for (let i = 0; i < Math.min(pulses, 200); i++) S += (B - S) * rate;
      if (Math.abs(S - B) < 1.0) continue; // prune — reverts to implicit baseline
      (stocks[stationId] ??= {})[goodId] = S;
    }
  }
  return { ...state, stocks };
}
```

- [ ] **Step 4: State field** — `src/engine/state.ts`: in `GameState`, after `extraSectorGoods`, add:

```ts
  /** Sparse per-station stock levels; missing entry = baseline (see engine/stocks.ts). */
  stocks: Record<string, Record<string, number>>;
```

and in `createInitialState`'s literal, after `extraSectorGoods: {},` add `stocks: {},`.

- [ ] **Step 5: Price integration** — `src/engine/pricing.ts`, in `getPrice`, integrate the multiplier. Replace the function body's return with:

```ts
  const raw = computePrice({ base: good.base, bias, waveValue, eventMult: evMult, sector: state.sector });
  const baseline = stockBaseline(stationId, good, state.runSeed ?? 0);
  const entry = state.stocks?.[stationId]?.[goodId];
  const stock = entry !== undefined ? entry : baseline;
  return raw * stockPriceMult(stock, baseline);
```

Import: `import { stockBaseline, stockPriceMult } from './stocks';` — **cycle alert**: stocks.ts imports `biasFor`/`goodById` from pricing.ts, so pricing must NOT import stocks at module top in a way that executes before definitions. ES modules handle this cycle fine for function declarations (both are hoisted `function` statements, called lazily at runtime), but keep both imports type-safe: this exact pairing works because neither module calls the other at module-evaluation time. Note `state.stocks?.` with optional chaining — getPrice is also called during boot on raw loaded saves that predate the field.

- [ ] **Step 6: Wire trades + regen in `src/engine/actions.ts`:**
  - add `import { applyStockTrade, regenStocks } from './stocks';`
  - in `buyGood`'s `setState`, wrap the returned state: compute `let st: GameState = { …existing literal… }; st = applyStockTrade(st, s.currentStation, goodId, -buyQty); return st;`
  - in `sellGood`'s `setState`, after `st = checkMilestones(st);` add `st = applyStockTrade(st, s.currentStation, goodId, sellQty);`
  - in `processMarketPulses`, after the waves loop and before the return, add `state = regenStocks({ ...state, waves, lastMarketPulseAt: state.lastMarketPulseAt + pulses * PULSE_INTERVAL_MS }, pulses); return state;` (i.e. fold the existing return object through `regenStocks`).
  - in `bootGame`'s merged-state literal add a backfill line: `stocks: (loaded as Partial<GameState>).stocks ?? {},`
  - in `importSave`'s merged literal add the same: `stocks: loaded.stocks ?? {},`
- and in `src/engine/save.ts` `importSaveCode`, next to the runSeed backfill add:

```ts
  if (typeof (parsed as Record<string, unknown>).stocks !== 'object' || (parsed as Record<string, unknown>).stocks === null) {
    (parsed as Record<string, unknown>).stocks = {};
  }
```

- [ ] **Step 7: Verify** — focused test PASS; `npm test` green (existing runroutes/runseed tests unaffected: fresh states have empty stocks → mult 1); `npm run typecheck` exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/engine/stocks.ts src/engine/state.ts src/engine/pricing.ts src/engine/actions.ts src/engine/save.ts src/engine/__tests__/stocks.test.ts
git commit -m "feat: station stocks — trades move local prices, markets regenerate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Stock UI badges

**Files:**
- Modify: `src/components/MarketScreen.tsx`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `getStock`, `stockBaseline` (Task 6), `goodById`.

- [ ] **Step 1: Badge logic** — in `src/components/MarketScreen.tsx` add imports:

```ts
import { getStock, stockBaseline } from '../engine/stocks';
```

Inside the goods map's unlocked branch, before the return, compute:

```ts
        const baseline = stockBaseline(s.currentStation, g, s.runSeed ?? 0);
        const stock = getStock(s, s.currentStation, g.id);
        const stockState = stock < baseline * 0.5 ? 'scarce' : stock > baseline * 1.5 ? 'glut' : null;
```

and render next to the existing price badge (inside `g-price-line`, after the `g-badge` span):

```tsx
                    {stockState && <span class={`g-stock ${stockState}`}>{stockState === 'scarce' ? 'SCARCE' : 'GLUT'}</span>}
```

- [ ] **Step 2: Styles** — append to `src/style.css`:

```css
.g-stock { font-size: 9px; letter-spacing: 0.5px; padding: 1px 5px; border-radius: 4px; }
.g-stock.scarce { color: #ffb37a; border: 1px solid #ffb37a55; }
.g-stock.glut { color: #7fd8ff; border: 1px solid #7fd8ff55; }
```

- [ ] **Step 3: Verify** — `npm run typecheck` exit 0; `npm test` green. Manual: buy out most of a good's stock at one station → SCARCE appears and unit price climbs between purchases.

- [ ] **Step 4: Commit**

```bash
git add src/components/MarketScreen.tsx src/style.css
git commit -m "feat: scarcity/glut badges reflect station stock

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Trade manifests engine

**Files:**
- Create: `src/engine/manifests.ts`
- Modify: `src/engine/state.ts` (`manifests`, `manifestSeq`)
- Modify: `src/engine/actions.ts` (maintenance in tick/boot, `deliverManifest` action, backfills)
- Modify: `src/engine/save.ts` (importSaveCode backfill)
- Modify: `src/config/types.ts` + `src/config/quests.ts` + `src/engine/quests.ts` (quest kind)
- Test: `src/engine/__tests__/manifests.test.ts`

**Interfaces:**
- Produces:
  - `interface Manifest { id: string; stationId: string; items: { goodId: string; qty: number }[]; rewardCredits: number; rewardXp: number; premium: number; expiresAt: number; }` (exported from `manifests.ts`)
  - `generateManifest(state: GameState, rng: RngFn, seq: number, t: number): Manifest`
  - `canDeliver(state: GameState, m: Manifest): boolean` — at the station AND all items in cargo
  - `GameState.manifests: Manifest[]`, `GameState.manifestSeq: number`
  - action `deliverManifest(manifestId: string): { ok: boolean; reason?: string; credits?: number }`
  - QuestKind `'deliver_manifest'` (session-size template "Deliver a trade manifest")
- Consumes: `maxHold` (tons), `allUnlockedGoods`, `biasFor`, `goodById`, `sectorScale`, `saleXp`, rng utils.

- [ ] **Step 1: Write the failing test** — create `src/engine/__tests__/manifests.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';
import { generateManifest, canDeliver } from '../manifests';
import { goodById } from '../pricing';
import { maxHold } from '../derived';
import { mulberry32 } from '../rng';
import { saleXp } from '../../config/ranks';
import { sectorScale } from '../price';
import { STATIONS } from '../../config/stations';

describe('trade manifests', () => {
  function mkState(rank = 8) {
    const s = createInitialState();
    s.rank = rank;
    return s;
  }

  it('generates 2-3 distinct unlocked goods, delivery elsewhere, sane premium and expiry', () => {
    const s = mkState();
    const m = generateManifest(s, mulberry32(42), 1, 1_000_000);
    expect(m.id).toBe('m1');
    expect(m.stationId).not.toBe(s.currentStation);
    expect(m.items.length).toBeGreaterThanOrEqual(2);
    expect(m.items.length).toBeLessThanOrEqual(3);
    const ids = m.items.map((i) => i.goodId);
    expect(new Set(ids).size).toBe(ids.length);
    const targetScan = STATIONS.find((st) => st.id === m.stationId)?.scanChance ?? 0;
    for (const it of m.items) {
      const g = goodById(it.goodId, s.runSeed ?? 0)!;
      expect(g.unlockRank).toBeLessThanOrEqual(s.rank);
      expect(it.qty).toBeGreaterThanOrEqual(1);
      if (targetScan > 0) expect(!!g.contraband).toBe(false); // no contraband demands where customs scans
    }
    expect(m.premium).toBeGreaterThanOrEqual(1.7);
    expect(m.premium).toBeLessThanOrEqual(2.2);
    expect(m.expiresAt).toBeGreaterThanOrEqual(1_000_000 + 20 * 60_000);
    expect(m.expiresAt).toBeLessThanOrEqual(1_000_000 + 40 * 60_000);
  });

  it('reward = base value × premium; XP = round(1.5 · saleXp(reward × 0.45))', () => {
    const s = mkState();
    const m = generateManifest(s, mulberry32(7), 2, 0);
    const baseValue = m.items.reduce(
      (sum, it) => sum + (goodById(it.goodId, s.runSeed ?? 0)?.base ?? 0) * sectorScale(s.sector) * it.qty, 0);
    expect(m.rewardCredits).toBe(Math.round(baseValue * m.premium));
    expect(m.rewardXp).toBe(Math.round(1.5 * saleXp(m.rewardCredits * 0.45)));
  });

  it('total manifest tonnage stays within 60-90% of the hold plus one-unit rounding', () => {
    const s = mkState(12);
    for (let seed = 1; seed <= 20; seed++) {
      const m = generateManifest(s, mulberry32(seed), seed, 0);
      const tons = m.items.reduce((t, it) => t + (goodById(it.goodId, s.runSeed ?? 0)?.mass ?? 1) * it.qty, 0);
      const maxOverspill = m.items.length * 7.5; // qty floors, then Math.max(1,...) can add ≤1 heaviest unit per item
      expect(tons).toBeLessThanOrEqual(maxHold(s) * 0.9 + maxOverspill);
      expect(tons).toBeGreaterThan(0);
    }
  });

  it('canDeliver requires being at the station with every item aboard', () => {
    const s = mkState();
    const m = generateManifest(s, mulberry32(9), 3, 0);
    expect(canDeliver(s, m)).toBe(false); // wrong station, empty cargo
    const at = { ...s, currentStation: m.stationId };
    expect(canDeliver(at, m)).toBe(false); // right station, empty cargo
    const cargo: typeof s.cargo = {};
    for (const it of m.items) cargo[it.goodId] = { qty: it.qty, avgCost: 1 };
    expect(canDeliver({ ...at, cargo }, m)).toBe(true);
    cargo[m.items[0].goodId] = { qty: m.items[0].qty - 1, avgCost: 1 };
    expect(canDeliver({ ...at, cargo: { ...cargo } }, m)).toBe(m.items[0].qty - 1 >= m.items[0].qty);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/engine/__tests__/manifests.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/engine/manifests.ts`:**

```ts
// Trade manifests — contracted combo deliveries at a premium. Spec 2026-07-16
// feature 2: the "buy combinations of items" objective. Three offers live in
// state; expired ones reroll. Payouts bypass stock depletion (contract price).
import type { GameState } from './state';
import { STATIONS } from '../config/stations';
import { allUnlockedGoods, biasFor, goodById } from './pricing';
import { maxHold } from './derived';
import { sectorScale } from './price';
import { saleXp } from '../config/ranks';
import { type RngFn, pick, randInt, randRange, shuffle } from './rng';

export interface Manifest {
  id: string;
  stationId: string;
  items: { goodId: string; qty: number }[];
  rewardCredits: number;
  rewardXp: number;
  premium: number;
  expiresAt: number;
}

export const MANIFEST_SLOTS = 3;

export function generateManifest(state: GameState, rng: RngFn, seq: number, t: number): Manifest {
  const runSeed = state.runSeed ?? 0;
  const stations = STATIONS.filter((s) => s.unlockRank <= state.rank && s.id !== state.currentStation);
  const target = stations.length ? pick(rng, stations) : STATIONS[0];

  const targetStation = STATIONS.find((s) => s.id === target.id);
  // No contraband demands at stations that scan — a customs bust at the delivery
  // door would eat the manifest cargo. The Signal (scanChance 0) stays a legal buyer.
  const unlocked = allUnlockedGoods(state).filter(
    (g) => g.tier >= (targetStation?.minGoodTier ?? 1) && !(g.contraband && (targetStation?.scanChance ?? 0) > 0)
  );
  // Prefer goods this station does NOT export cheaply — sourcing them means travel.
  const preferred = unlocked.filter((g) => biasFor(target.id, g, runSeed) >= 0.9);
  const pool = preferred.length >= 2 ? preferred : unlocked;
  const count = Math.max(1, Math.min(pool.length, randInt(rng, 2, 3)));
  const goods = shuffle(rng, pool).slice(0, count);

  const tonsBudget = maxHold(state) * randRange(rng, 0.6, 0.9);
  const share = tonsBudget / goods.length;
  let items = goods.map((g) => ({ goodId: g.id, qty: Math.max(1, Math.floor(share / g.mass)) }));
  // The per-item Math.max(1, …) bump can push a 3-heavy-goods manifest past the
  // hold on an unupgraded ship — undeliverable, since canDeliver needs everything
  // aboard at once. Dropping the heaviest line always leaves a fitting 2-item combo.
  const tonsOf = (list: typeof items) =>
    list.reduce((t, it) => t + (goodById(it.goodId, runSeed)?.mass ?? 1) * it.qty, 0);
  if (items.length > 2 && tonsOf(items) > maxHold(state)) {
    const heaviest = items.reduce((a, b) =>
      (goodById(a.goodId, runSeed)?.mass ?? 1) * a.qty >= (goodById(b.goodId, runSeed)?.mass ?? 1) * b.qty ? a : b);
    items = items.filter((it) => it !== heaviest);
  }

  const baseValue = items.reduce(
    (sum, it) => sum + (goodById(it.goodId, runSeed)?.base ?? 0) * sectorScale(state.sector) * it.qty, 0);
  const premium = randRange(rng, 1.7, 2.2);
  const rewardCredits = Math.round(baseValue * premium);
  const rewardXp = Math.round(1.5 * saleXp(rewardCredits * 0.45));

  return {
    id: `m${seq}`,
    stationId: target.id,
    items,
    rewardCredits,
    rewardXp,
    premium,
    expiresAt: t + randInt(rng, 20, 40) * 60_000,
  };
}

export function canDeliver(state: GameState, m: Manifest): boolean {
  if (state.currentStation !== m.stationId) return false;
  return m.items.every((it) => (state.cargo[it.goodId]?.qty ?? 0) >= it.qty);
}
```

- [ ] **Step 4: State fields** — `src/engine/state.ts`: in `GameState`, after the new `stocks` field, add:

```ts
  manifests: Manifest[];
  manifestSeq: number;
```

with `import type { Manifest } from './manifests';` (type-only). In `createInitialState`: `manifests: [], manifestSeq: 1,` (they get filled by boot/tick maintenance, which needs `rank`-aware state).

- [ ] **Step 5: Maintenance + delivery in `src/engine/actions.ts`:**

5a. Imports: `import { generateManifest, canDeliver, MANIFEST_SLOTS, type Manifest } from './manifests';`

5b. Add a helper near `expireTimers`:

```ts
function maintainManifests(state: GameState, t: number): GameState {
  const live = state.manifests.filter((m) => m.expiresAt > t);
  if (live.length >= MANIFEST_SLOTS) return live.length === state.manifests.length ? state : { ...state, manifests: live };
  let st: GameState = { ...state, manifests: live };
  const added: Manifest[] = [];
  let seq = st.manifestSeq;
  while (live.length + added.length < MANIFEST_SLOTS) {
    added.push(generateManifest(st, sessionRng, seq, t));
    seq++;
  }
  st = { ...st, manifests: [...live, ...added], manifestSeq: seq };
  if (added.length && state.manifests.length > 0) emit({ type: 'sfx', id: 'quest_claim' }); // Task 9 swaps this to 'manifest_new'
  return st;
}
```

(The `state.manifests.length > 0` guard keeps boot-time initial fill silent.)

5c. Call it from `tick()` (after `expireTimers`): `state = maintainManifests(state, t);`
And in `bootGame`'s **loaded-save path only** — immediately after `state = { ...state, pendingOfflineReport: offlineReport, lastSeen: t };` and before that path's final `store.value = state;` — add: `state = maintainManifests(state, t);`. Do NOT touch the `if (!loaded)` early-return block near the top of bootGame (it also contains a `store.value = state;`, but `t` is not in scope there, and fresh saves get their manifests from the first `tick()` — silently, thanks to the guard in 5b).

5d. Backfills — `bootGame` merged literal: `manifests: (loaded as Partial<GameState>).manifests ?? [], manifestSeq: (loaded as Partial<GameState>).manifestSeq ?? 1,`; same two in `importSave`'s merged literal; and in `importSaveCode` (save.ts):

```ts
  if (!Array.isArray((parsed as Record<string, unknown>).manifests)) (parsed as Record<string, unknown>).manifests = [];
  if (typeof (parsed as Record<string, unknown>).manifestSeq !== 'number') (parsed as Record<string, unknown>).manifestSeq = 1;
```

5e. The delivery action (add after `sellGood`):

```ts
export function deliverManifest(manifestId: string): { ok: boolean; reason?: string; credits?: number } {
  const state = getState();
  const m = state.manifests.find((x) => x.id === manifestId);
  if (!m) return { ok: false, reason: 'Contract expired.' };
  if (state.currentStation !== m.stationId) return { ok: false, reason: 'Deliver at the named station.' };
  if (!canDeliver(state, m)) return { ok: false, reason: 'Cargo incomplete.' };
  const t = now();
  setState((s) => {
    const cargo = { ...s.cargo };
    for (const it of m.items) {
      const entry = cargo[it.goodId];
      const remaining = entry.qty - it.qty;
      if (remaining <= 0) delete cargo[it.goodId];
      else cargo[it.goodId] = { ...entry, qty: remaining };
    }
    let st: GameState = {
      ...s,
      cargo,
      credits: s.credits + m.rewardCredits,
      lifetimeEarnings: s.lifetimeEarnings + m.rewardCredits,
      xp: s.xp + m.rewardXp,
      manifests: s.manifests.filter((x) => x.id !== m.id),
      stats: { ...s.stats, totalSales: s.stats.totalSales + 1, creditsEarned: s.stats.creditsEarned + m.rewardCredits },
      bests: { ...s.bests, biggestSale: Math.max(s.bests.biggestSale, m.rewardCredits) },
    };
    st = applyXpAndRankUps(st);
    st = progressQuests(st, (q) => (q.kind === 'deliver_manifest' ? { ...q, progress: q.goal } : q));
    st = maintainManifests(st, t);
    st = checkMilestones(st);
    return st;
  });
  emit({ type: 'sfx', id: 'quest_claim' }); // Task 9 upgrades this to 'manifest_deliver'
  emit({ type: 'haptic', pattern: 'sell' });
  emit({ type: 'confetti', power: 'small' });
  emit({ type: 'floater', text: formatSignedCredits(m.rewardCredits), kind: 'profit' });
  return { ok: true, credits: m.rewardCredits };
}
```

- [ ] **Step 6: Quest kind** — `src/config/types.ts`: add `| 'deliver_manifest'` to `QuestKind`. `src/config/quests.ts`: add to `QUEST_TEMPLATES`:

```ts
  { kind: 'deliver_manifest', size: 'session', label: 'Deliver a trade manifest' },
```

(`generateQuest`'s `default` case already yields goal 1 for kinds without bespoke handling.)

- [ ] **Step 7: Verify** — focused test PASS; `npm test` green; `npm run typecheck` exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/engine/manifests.ts src/engine/state.ts src/engine/actions.ts src/engine/save.ts src/config/types.ts src/config/quests.ts src/engine/__tests__/manifests.test.ts
git commit -m "feat: trade manifests — combo delivery contracts at premium prices

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Contracts panel UI + manifest SFX

**Files:**
- Create: `src/components/ContractsPanel.tsx`
- Modify: `src/components/MapScreen.tsx` (mount the panel)
- Modify: `src/components/Hud.tsx` (ticker line)
- Modify: `src/engine/bus.ts` + `src/engine/audio.ts` + `src/engine/actions.ts` (manifest SFX)
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `state.manifests`, `canDeliver`, `deliverManifest` (Task 8), `goodById`, `formatCredits`, `formatDuration`.
- Produces: `<ContractsPanel />` (no props); SfxIds `'manifest_new' | 'manifest_deliver'`.

- [ ] **Step 1: SFX ids** — `src/engine/bus.ts`: append `| 'manifest_new' | 'manifest_deliver'` to `SfxId`. `src/engine/audio.ts` `play()` switch, add:

```ts
      case 'manifest_new':
        this.tone(440, 0.09, { type: 'square', gain: 0.12 });
        this.tone(587.33, 0.12, { type: 'square', gain: 0.14, delay: 0.09 });
        break;
      case 'manifest_deliver':
        [392, 523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', gain: 0.18, delay: i * 0.07 }));
        this.noise(0.25, { gain: 0.08, filterType: 'highpass', filterFreq: 6000, delay: 0.2 });
        break;
```

In `src/engine/actions.ts`, swap the two Task-8 placeholders: `maintainManifests`'s emit becomes `id: 'manifest_new'`, `deliverManifest`'s first emit becomes `id: 'manifest_deliver'`.

- [ ] **Step 2: Panel** — create `src/components/ContractsPanel.tsx`:

```tsx
import { store, clockTick } from '../engine/store';
import { canDeliver } from '../engine/manifests';
import { deliverManifest } from '../engine/actions';
import { goodById } from '../engine/pricing';
import { STATIONS_BY_ID } from '../config/stations';
import { formatCredits, formatDuration } from '../engine/num';
import { now } from '../engine/time';

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
        return (
          <div key={m.id} class={`contract-row${ready ? ' ready' : ''}`}>
            <div class="c-main">
              <div class="c-dest">{station?.icon} {station?.name ?? m.stationId} · ⏱ {formatDuration(m.expiresAt - t)}</div>
              <div class="c-items">
                {m.items.map((it) => {
                  const g = goodById(it.goodId, s.runSeed ?? 0);
                  const have = s.cargo[it.goodId]?.qty ?? 0;
                  return (
                    <span key={it.goodId} class={`c-item${have >= it.qty ? ' have' : ''}`}>
                      {g?.icon} {have}/{it.qty}
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
```

- [ ] **Step 3: Mount + ticker** — `src/components/MapScreen.tsx`: `import { ContractsPanel } from './ContractsPanel';` and render `<ContractsPanel />` directly after the `map-wrap` div closes (before the "Active Signals" section). `src/components/Hud.tsx`: after the boost-token ticker push, add:

```ts
  const readyManifest = s.manifests?.find((m) => m.expiresAt > t && s.currentStation === m.stationId && m.items.every((it) => (s.cargo[it.goodId]?.qty ?? 0) >= it.qty));
  if (readyManifest) tickerItems.push('📦 Contract ready to deliver HERE — MAP tab');
```

- [ ] **Step 4: Styles** — append to `src/style.css`:

```css
.contracts { margin-top: 12px; }
.contract-row { display: flex; align-items: center; gap: 8px; background: var(--surface); border-radius: 10px; padding: 8px 10px; margin-bottom: 6px; }
.contract-row.ready { border: 1px solid var(--accent); }
.contract-row .c-main { flex: 1; min-width: 0; }
.contract-row .c-dest { font-size: 11px; opacity: 0.85; }
.contract-row .c-items { display: flex; gap: 8px; margin-top: 3px; font-size: 12px; }
.contract-row .c-item { opacity: 0.6; }
.contract-row .c-item.have { opacity: 1; color: var(--profit, #7dff9a); }
```

- [ ] **Step 5: Verify** — `npm run typecheck` exit 0; `npm test` green. Manual: MAP tab lists 3 contracts with countdowns; buying the listed goods lights items green; at the target station the pay button enables and pays with fanfare.

- [ ] **Step 6: Commit**

```bash
git add src/components/ContractsPanel.tsx src/components/MapScreen.tsx src/components/Hud.tsx src/engine/bus.ts src/engine/audio.ts src/engine/actions.ts src/style.css
git commit -m "feat: contracts panel, HUD ticker and manifest SFX

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

# PHASE 3 — Warp-lane graph map

### Task 10: Sector map generator

**Files:**
- Create: `src/engine/mapgen.ts`
- Test: `src/engine/__tests__/mapgen.test.ts`

**Interfaces:**
- Produces (all exported from `mapgen.ts`):

```ts
export type NodeKind = 'station' | 'outpost' | 'depot' | 'salvage' | 'beacon' | 'gate';
export interface MapNode { id: string; kind: NodeKind; stationId?: string; name: string; icon: string; x: number; y: number; goodIds?: string[]; }
export interface MapLane { a: string; b: string; fuel: number; trait: 'safe' | 'pirate' | 'express'; }
export interface SectorMap { nodes: MapNode[]; lanes: MapLane[]; }
export function generateSectorMap(sector: number, runSeed: number): SectorMap; // memoized
export function nodeById(map: SectorMap, id: string): MapNode | undefined;
export function laneBetween(map: SectorMap, a: string, b: string): MapLane | undefined;
export function lanesFrom(map: SectorMap, id: string): MapLane[];
export const WAYPOINT_THEME: StationTheme;
export const GATE_NODE_ID = 'gate';
```

- **Node id contract:** station nodes use their station id verbatim (`'rust_harbor'`, …) so every existing `currentStation` consumer keeps working; waypoints are `wp-s{sector}-{0..4}`; the gate node id is `'gate'`.
- Consumes: `STATIONS`, `GOODS`, `generateSectorGoods`, rng utils, `StationTheme` type.

- [ ] **Step 1: Write the failing test** — create `src/engine/__tests__/mapgen.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateSectorMap, laneBetween, GATE_NODE_ID } from '../mapgen';
import { STATIONS } from '../../config/stations';

function reachable(map: ReturnType<typeof generateSectorMap>): Set<string> {
  const adj = new Map<string, string[]>();
  for (const l of map.lanes) {
    adj.set(l.a, [...(adj.get(l.a) ?? []), l.b]);
    adj.set(l.b, [...(adj.get(l.b) ?? []), l.a]);
  }
  const seen = new Set<string>([map.nodes[0].id]);
  const queue = [map.nodes[0].id];
  while (queue.length) {
    for (const n of adj.get(queue.pop()!) ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  }
  return seen;
}

describe('sector map generation', () => {
  it('is deterministic per (sector, runSeed) and differs across seeds', () => {
    const a = generateSectorMap(1, 123);
    const b = generateSectorMap(1, 123);
    expect(a).toBe(b); // memoized — same object
    const c = generateSectorMap(1, 456);
    expect(JSON.stringify(a.lanes)).not.toBe(JSON.stringify(c.lanes));
  });

  it('has 13 nodes: all 7 stations by their own ids, 5 waypoints, 1 gate', () => {
    const m = generateSectorMap(1, 777);
    expect(m.nodes.length).toBe(13);
    for (const st of STATIONS) {
      const n = m.nodes.find((x) => x.id === st.id);
      expect(n?.kind).toBe('station');
      expect(n?.stationId).toBe(st.id);
    }
    const kinds = m.nodes.map((n) => n.kind);
    expect(kinds.filter((k) => k === 'outpost').length).toBe(2);
    expect(kinds.filter((k) => k === 'depot').length).toBe(1);
    expect(kinds.filter((k) => k === 'salvage').length).toBe(1);
    expect(kinds.filter((k) => k === 'beacon').length).toBe(1);
    expect(m.nodes.find((n) => n.id === GATE_NODE_ID)?.kind).toBe('gate');
  });

  it('the graph is fully connected with sane lanes', () => {
    for (const seed of [1, 99, 424242]) {
      const m = generateSectorMap(1, seed);
      expect(reachable(m).size).toBe(m.nodes.length);
      const ids = new Set(m.nodes.map((n) => n.id));
      for (const l of m.lanes) {
        expect(ids.has(l.a)).toBe(true);
        expect(ids.has(l.b)).toBe(true);
        expect([1, 2]).toContain(l.fuel);
        expect(['safe', 'pirate', 'express']).toContain(l.trait);
        expect(l.a).not.toBe(l.b);
      }
      // degree cap
      const deg = new Map<string, number>();
      for (const l of m.lanes) {
        deg.set(l.a, (deg.get(l.a) ?? 0) + 1);
        deg.set(l.b, (deg.get(l.b) ?? 0) + 1);
      }
      for (const d of deg.values()) expect(d).toBeLessThanOrEqual(6);
      // no duplicate lanes
      const keys = m.lanes.map((l) => [l.a, l.b].sort().join('|'));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('outposts stock 5 goods; positions are on-canvas percentages', () => {
    const m = generateSectorMap(2, 31337);
    for (const n of m.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(100);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(100);
      if (n.kind === 'outpost') expect(n.goodIds?.length).toBe(5);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/engine/__tests__/mapgen.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/engine/mapgen.ts`:**

```ts
// Per-sector warp-lane graph — spec 2026-07-16 feature 3. 13 nodes (7 stations
// keeping their own ids, 5 waypoints, 1 gate) placed on a jittered 6×5 grid and
// connected by lanes with fuel costs and traits. Deterministic per
// (sector, runSeed); memoized like the pricing tables.
import type { StationTheme } from '../config/types';
import { STATIONS } from '../config/stations';
import { GOODS } from '../config/goods';
import { generateSectorGoods } from './sectorgen';
import { mulberry32, hashSeed, randRange, shuffle, chance, type RngFn } from './rng';

export type NodeKind = 'station' | 'outpost' | 'depot' | 'salvage' | 'beacon' | 'gate';

export interface MapNode {
  id: string;
  kind: NodeKind;
  stationId?: string;
  name: string;
  icon: string;
  x: number; // 0-100 render percentage
  y: number;
  goodIds?: string[]; // outposts only
}

export interface MapLane {
  a: string;
  b: string;
  fuel: number; // 1 short, 2 long
  trait: 'safe' | 'pirate' | 'express';
}

export interface SectorMap {
  nodes: MapNode[];
  lanes: MapLane[];
}

export const GATE_NODE_ID = 'gate';

export const WAYPOINT_THEME: StationTheme = {
  bg: '#05070f', surface: '#0c1120', accent: '#8fa3c8', accent2: '#c8d6f0',
  text: '#e6ecf8', glow: '#8fa3c8', particleHue: 220, overlay: 'dust',
  motif: [196, 261], ambienceType: 'drone',
};

const OUTPOST_NAMES = ['DRIFTER POST', 'KESSLER STOP', 'LONE ANCHOR', 'MOTE MARKET', 'HALFWAY HOLE'];

const COLS = 6, ROWS = 5;

interface Cell { col: number; row: number; }

function cellPos(cell: Cell, rng: RngFn): { x: number; y: number } {
  return {
    x: Math.round((8 + cell.col * 16.8 + randRange(rng, -3, 3)) * 10) / 10,
    y: Math.round((10 + cell.row * 19 + randRange(rng, -4, 4)) * 10) / 10,
  };
}

const dist = (a: MapNode, b: MapNode) => Math.hypot(a.x - b.x, a.y - b.y);

function laneKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

const cache = new Map<string, SectorMap>();

export function generateSectorMap(sector: number, runSeed: number): SectorMap {
  const key = `${sector}:${runSeed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const rng = mulberry32((hashSeed(`map-sector-${sector}`) ^ (runSeed >>> 0)) >>> 0);

  // 1) choose 12 spread cells + a gate cell on the right edge
  const all: Cell[] = [];
  for (let col = 0; col < COLS; col++) for (let row = 0; row < ROWS; row++) all.push({ col, row });
  const shuffled = shuffle(rng, all);
  const chosen: Cell[] = [];
  for (const c of shuffled) {
    if (chosen.length >= 12) break;
    if (chosen.every((o) => Math.abs(o.col - c.col) + Math.abs(o.row - c.row) >= 2)) chosen.push(c);
  }
  for (const c of shuffled) {
    if (chosen.length >= 12) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  const gateCell = shuffled.find((c) => !chosen.includes(c) && c.col >= COLS - 2) ?? shuffled.find((c) => !chosen.includes(c))!;

  // 2) assign roles: first 7 cells → stations (fixed STATIONS order), rest → shuffled waypoints
  const nodes: MapNode[] = [];
  STATIONS.forEach((st, i) => {
    nodes.push({ id: st.id, kind: 'station', stationId: st.id, name: st.name, icon: st.icon, ...cellPos(chosen[i], rng) });
  });
  const sectorGoods = sector >= 2 ? generateSectorGoods(sector, runSeed) : [];
  const catalog = [...GOODS, ...sectorGoods];
  const wpKinds = shuffle(rng, ['outpost', 'outpost', 'depot', 'salvage', 'beacon'] as const);
  wpKinds.forEach((kind, i) => {
    const id = `wp-s${sector}-${i}`;
    const pos = cellPos(chosen[7 + i], rng);
    if (kind === 'outpost') {
      nodes.push({
        id, kind, name: OUTPOST_NAMES[Math.floor(rng() * OUTPOST_NAMES.length)], icon: '🏪', ...pos,
        goodIds: shuffle(rng, catalog).slice(0, 5).map((g) => g.id),
      });
    } else if (kind === 'depot') {
      nodes.push({ id, kind, name: 'FUEL DEPOT', icon: '⛽', ...pos });
    } else if (kind === 'salvage') {
      nodes.push({ id, kind, name: 'SALVAGE FIELD', icon: '🛠️', ...pos });
    } else {
      nodes.push({ id, kind, name: 'BEACON', icon: '📍', ...pos });
    }
  });
  nodes.push({ id: GATE_NODE_ID, kind: 'gate', name: 'SECTOR GATE', icon: '🌀', ...cellPos(gateCell, rng) });

  // 3) lanes: nearest-2 per node, then connectivity repair, then 2 long shortcuts
  const laneSet = new Map<string, MapLane>();
  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);
  const addLane = (a: MapNode, b: MapNode) => {
    const k = laneKey(a.id, b.id);
    if (laneSet.has(k)) return;
    const d = dist(a, b);
    const gateSide = a.kind === 'gate' || b.kind === 'gate';
    const trait: MapLane['trait'] = gateSide ? 'safe' : chance(rng, 0.2) ? 'pirate' : chance(rng, 0.125) ? 'express' : 'safe';
    laneSet.set(k, { a: a.id, b: b.id, fuel: d <= 24 ? 1 : 2, trait });
    bump(a.id); bump(b.id);
  };

  for (const n of nodes) {
    const nearest = nodes.filter((o) => o !== n).sort((p, q) => dist(n, p) - dist(n, q)).slice(0, 2);
    for (const o of nearest) addLane(n, o);
  }

  // union-find connectivity repair
  const parent = new Map<string, string>(nodes.map((n) => [n.id, n.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  const union = (x: string, y: string) => parent.set(find(x), find(y));
  for (const l of laneSet.values()) union(l.a, l.b);
  for (let guard = 0; guard < 30; guard++) {
    const roots = new Set(nodes.map((n) => find(n.id)));
    if (roots.size <= 1) break;
    let best: [MapNode, MapNode] | null = null;
    for (const p of nodes) for (const q of nodes) {
      if (find(p.id) === find(q.id)) continue;
      if (!best || dist(p, q) < dist(best[0], best[1])) best = [p, q];
    }
    if (!best) break;
    addLane(best[0], best[1]);
    union(best[0].id, best[1].id);
  }

  // two long shortcuts for route choice
  const candidates = [] as Array<[MapNode, MapNode, number]>;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const k = laneKey(nodes[i].id, nodes[j].id);
    if (laneSet.has(k)) continue;
    candidates.push([nodes[i], nodes[j], dist(nodes[i], nodes[j])]);
  }
  candidates.sort((p, q) => q[2] - p[2]);
  let added = 0;
  for (const [p, q] of candidates) {
    if (added >= 2) break;
    if ((degree.get(p.id) ?? 0) >= 4 || (degree.get(q.id) ?? 0) >= 4) continue;
    addLane(p, q);
    added++;
  }

  const map: SectorMap = { nodes, lanes: [...laneSet.values()] };
  cache.set(key, map);
  return map;
}

export function nodeById(map: SectorMap, id: string): MapNode | undefined {
  return map.nodes.find((n) => n.id === id);
}

export function laneBetween(map: SectorMap, a: string, b: string): MapLane | undefined {
  const k = laneKey(a, b);
  return map.lanes.find((l) => laneKey(l.a, l.b) === k);
}

export function lanesFrom(map: SectorMap, id: string): MapLane[] {
  return map.lanes.filter((l) => l.a === id || l.b === id);
}
```

- [ ] **Step 4: Verify** — focused test PASS; `npm test` green; `npm run typecheck` exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/mapgen.ts src/engine/__tests__/mapgen.test.ts
git commit -m "feat: seeded warp-lane sector maps — 7 stations, 5 waypoints, gate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Route finding

**Files:**
- Create: `src/engine/routing.ts`
- Test: `src/engine/__tests__/routing.test.ts`

**Interfaces:**
- Produces:

```ts
export interface RoutePlan { path: string[]; fuel: number; pirates: number; }
export function shortestPath(map: SectorMap, from: string, to: string): RoutePlan | null; // Dijkstra by fuel, tie-break fewer hops
export function routeThrough(map: SectorMap, stops: string[]): RoutePlan | null;          // stops visited in order; concatenated shortest paths
```

`path` includes the start node; `fuel`/`pirates` count lane costs / pirate lanes along it.
- Consumes: `SectorMap`, `MapLane`, `laneBetween`, `lanesFrom` (Task 10).

- [ ] **Step 1: Write the failing test** — create `src/engine/__tests__/routing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shortestPath, routeThrough } from '../routing';
import { generateSectorMap } from '../mapgen';
import type { SectorMap } from '../mapgen';

// Hand-built diamond: A-B(1) B-D(1) A-C(2,pirate) C-D(1) — best A→D is A-B-D (2 fuel)
const DIAMOND: SectorMap = {
  nodes: (['A', 'B', 'C', 'D'] as const).map((id, i) => ({ id, kind: 'beacon' as const, name: id, icon: '·', x: i * 10, y: 0 })),
  lanes: [
    { a: 'A', b: 'B', fuel: 1, trait: 'safe' },
    { a: 'B', b: 'D', fuel: 1, trait: 'safe' },
    { a: 'A', b: 'C', fuel: 2, trait: 'pirate' },
    { a: 'C', b: 'D', fuel: 1, trait: 'safe' },
  ],
};

describe('routing', () => {
  it('finds the cheapest path by fuel', () => {
    const r = shortestPath(DIAMOND, 'A', 'D')!;
    expect(r.path).toEqual(['A', 'B', 'D']);
    expect(r.fuel).toBe(2);
    expect(r.pirates).toBe(0);
  });

  it('counts pirate lanes when the route uses them', () => {
    const r = shortestPath(DIAMOND, 'A', 'C')!;
    expect(r.fuel).toBe(2); // direct pirate lane == B-D-C (1+1+? no: A-B-D-C = 3) → direct wins
    expect(r.pirates).toBe(1);
  });

  it('routes through ordered stops and sums costs', () => {
    const r = routeThrough(DIAMOND, ['A', 'D', 'C'])!;
    expect(r.path).toEqual(['A', 'B', 'D', 'C']);
    expect(r.fuel).toBe(3);
  });

  it('returns null for unknown nodes and same-node trips resolve to zero cost', () => {
    expect(shortestPath(DIAMOND, 'A', 'ZZ')).toBeNull();
    const same = shortestPath(DIAMOND, 'A', 'A')!;
    expect(same.path).toEqual(['A']);
    expect(same.fuel).toBe(0);
  });

  it('every generated map is fully routable from every station', () => {
    const m = generateSectorMap(1, 8888);
    const stations = m.nodes.filter((n) => n.kind === 'station');
    for (const a of stations) for (const b of stations) {
      expect(shortestPath(m, a.id, b.id)).not.toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/engine/__tests__/routing.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/engine/routing.ts`:**

```ts
// Dijkstra over warp lanes (13 nodes — plain arrays are plenty).
import type { SectorMap, MapLane } from './mapgen';

export interface RoutePlan {
  path: string[];
  fuel: number;
  pirates: number;
}

function neighbors(map: SectorMap, id: string): Array<{ id: string; lane: MapLane }> {
  const out: Array<{ id: string; lane: MapLane }> = [];
  for (const l of map.lanes) {
    if (l.a === id) out.push({ id: l.b, lane: l });
    else if (l.b === id) out.push({ id: l.a, lane: l });
  }
  return out;
}

export function shortestPath(map: SectorMap, from: string, to: string): RoutePlan | null {
  const ids = map.nodes.map((n) => n.id);
  if (!ids.includes(from) || !ids.includes(to)) return null;
  const fuel = new Map<string, number>(ids.map((i) => [i, Infinity]));
  const hops = new Map<string, number>(ids.map((i) => [i, Infinity]));
  const prev = new Map<string, { id: string; lane: MapLane }>();
  const done = new Set<string>();
  fuel.set(from, 0);
  hops.set(from, 0);

  while (done.size < ids.length) {
    let cur: string | null = null;
    for (const id of ids) {
      if (done.has(id)) continue;
      if (cur === null || fuel.get(id)! < fuel.get(cur)! ||
        (fuel.get(id)! === fuel.get(cur)! && hops.get(id)! < hops.get(cur)!)) cur = id;
    }
    if (cur === null || fuel.get(cur) === Infinity) break;
    done.add(cur);
    if (cur === to) break;
    for (const { id: nb, lane } of neighbors(map, cur)) {
      if (done.has(nb)) continue;
      const nf = fuel.get(cur)! + lane.fuel;
      const nh = hops.get(cur)! + 1;
      if (nf < fuel.get(nb)! || (nf === fuel.get(nb)! && nh < hops.get(nb)!)) {
        fuel.set(nb, nf);
        hops.set(nb, nh);
        prev.set(nb, { id: cur, lane });
      }
    }
  }

  if (fuel.get(to) === Infinity) return null;
  const path = [to];
  let pirates = 0;
  let walker = to;
  while (walker !== from) {
    const p = prev.get(walker);
    if (!p) return null;
    if (p.lane.trait === 'pirate') pirates++;
    path.unshift(p.id);
    walker = p.id;
  }
  return { path, fuel: fuel.get(to)!, pirates };
}

export function routeThrough(map: SectorMap, stops: string[]): RoutePlan | null {
  if (stops.length < 2) return stops.length === 1 ? { path: [stops[0]], fuel: 0, pirates: 0 } : null;
  const total: RoutePlan = { path: [stops[0]], fuel: 0, pirates: 0 };
  for (let i = 1; i < stops.length; i++) {
    const leg = shortestPath(map, stops[i - 1], stops[i]);
    if (!leg) return null;
    total.path.push(...leg.path.slice(1));
    total.fuel += leg.fuel;
    total.pirates += leg.pirates;
  }
  return total;
}
```

- [ ] **Step 4: Verify** — focused test PASS; `npm test`; `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/engine/routing.ts src/engine/__tests__/routing.test.ts
git commit -m "feat: Dijkstra route planning over warp lanes with multi-stop support

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Travel engine — lanes, waypoints, fuel rebalance

**Files:**
- Modify: `src/engine/state.ts` (fuel constants; `lastSalvageAt`, `visitedBeacons`)
- Modify: `src/engine/derived.ts` (`fuelRegenSec` −6/floor 35)
- Modify: `src/config/ship.ts` (fuel_recycler label)
- Modify: `src/engine/actions.ts` (lane-validated jumps, hop options, waypoint actions, gate behavior, backfills)
- Modify: `src/engine/save.ts` (backfills)
- Modify: `src/engine/__tests__/tuning.test.ts` (its old fuel-regen test pins the 75s curve)
- Test: `src/engine/__tests__/travel.test.ts`

**Interfaces:**
- Produces:
  - `startJump(targetNodeId): { ok: boolean; reason?: string; lane?: MapLane }` — requires a direct lane from the current node and `fuel ≥ lane.fuel`; deducts `lane.fuel`.
  - `completeJump(targetNodeId, opts?: { finalStop?: boolean; laneTrait?: MapLane['trait'] })` — arrival rolls ONLY at `finalStop && station`; pirate lanes roll a 0.3-chance pirate_toll encounter that replaces the arrival roll; codex/quests stamp stations only; beacons pay +25 XP on first visit per run.
  - `buyFuelPip(): { ok: boolean; reason?: string }` — at a depot node: `cost = max(50, netWorth × 0.02)` per pip.
  - `claimSalvage(): { ok: boolean; reason?: string }` — at a salvage node, 10-min cooldown per node, grants 1–4 units of a random unlocked good (tonnage-capped).
  - `payGateToll()` now also requires standing at the gate node and lands you at `rust_harbor` in the new sector.
  - `GameState.lastSalvageAt: Record<string, number>`, `GameState.visitedBeacons: string[]`.
  - Constants: `BASE_MAX_FUEL = 8`, `BASE_FUEL_REGEN_SEC = 65`; `fuelRegenSec = max(35, 65 − lvl·6)`.
- Consumes: `generateSectorMap`, `laneBetween`, `nodeById`, `GATE_NODE_ID` (Task 10); `freeCapacityUnits` (Task 2).

- [ ] **Step 1: Write the failing test** — create `src/engine/__tests__/travel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialState, BASE_MAX_FUEL, BASE_FUEL_REGEN_SEC } from '../state';
import { fuelRegenSec } from '../derived';
import { store } from '../store';
import { startJump, buyFuelPip, claimSalvage } from '../actions';
import { generateSectorMap, lanesFrom, nodeById } from '../mapgen';

function freshAt(nodeId?: string) {
  const s = createInitialState();
  s.runSeed = 12345; // pin the map so this suite is deterministic across runs
  s.rank = 12;       // unlock halo_court (R6) and the_signal (R12) — this suite tests
                     // lane adjacency and fuel, not rank gating; without this, ~1 in 9
                     // random maps points rust_harbor's first lane at a locked station
  if (nodeId) s.currentStation = nodeId;
  store.value = s;
  return s;
}

describe('lane travel + fuel rebalance', () => {
  it('fuel constants match spec', () => {
    expect(BASE_MAX_FUEL).toBe(8);
    expect(BASE_FUEL_REGEN_SEC).toBe(65);
    const s = createInitialState();
    expect(fuelRegenSec(s)).toBe(65);
    s.shipUpgrades['fuel_recycler'] = 5;
    expect(fuelRegenSec(s)).toBe(35);
  });

  it('jumps require a direct lane and deduct the lane fuel cost', () => {
    const s = freshAt();
    const map = generateSectorMap(s.sector, s.runSeed ?? 0);
    const lane = lanesFrom(map, s.currentStation)[0];
    const target = lane.a === s.currentStation ? lane.b : lane.a;
    const nonAdjacent = map.nodes.find((n) =>
      n.id !== s.currentStation && !lanesFrom(map, s.currentStation).some((l) => l.a === n.id || l.b === n.id))!;
    expect(startJump(nonAdjacent.id).ok).toBe(false);
    const res = startJump(target);
    expect(res.ok).toBe(true);
    expect(res.lane?.fuel).toBe(lane.fuel);
    expect(store.value.fuel).toBe(BASE_MAX_FUEL - lane.fuel);
  });

  it('depot sells fuel pips at max(50, 2% net worth)', () => {
    const s = createInitialState();
    s.runSeed = 12345;
    const map = generateSectorMap(s.sector, s.runSeed);
    const depot = map.nodes.find((n) => n.kind === 'depot')!;
    s.currentStation = depot.id;
    s.fuel = 2;
    s.credits = 10_000;
    store.value = s;
    const r = buyFuelPip();
    expect(r.ok).toBe(true);
    expect(store.value.fuel).toBe(3);
    expect(store.value.credits).toBe(10_000 - 200);
    store.value = { ...store.value, fuel: BASE_MAX_FUEL };
    expect(buyFuelPip().ok).toBe(false); // tank full
  });

  it('salvage claims respect the 10-minute cooldown', () => {
    const s = createInitialState();
    s.runSeed = 12345;
    const map = generateSectorMap(s.sector, s.runSeed);
    const field = map.nodes.find((n) => n.kind === 'salvage')!;
    s.currentStation = field.id;
    store.value = s;
    expect(claimSalvage().ok).toBe(true);
    const carried = Object.values(store.value.cargo).reduce((n, c) => n + c.qty, 0);
    expect(carried).toBeGreaterThanOrEqual(1);
    expect(claimSalvage().ok).toBe(false); // cooldown
    // reset the cooldown AND empty the hold, so the reroll can't be tonnage-blocked
    store.value = { ...store.value, cargo: {}, lastSalvageAt: { [field.id]: Date.now() - 11 * 60_000 } };
    expect(claimSalvage().ok).toBe(true);
  });

  it('waypoint actions refuse to run elsewhere', () => {
    freshAt(); // rust_harbor
    expect(buyFuelPip().ok).toBe(false);
    expect(claimSalvage().ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/engine/__tests__/travel.test.ts` — Expected: FAIL (constants 5/75; startJump has no lane logic; actions missing).

- [ ] **Step 3: Constants + state fields** — `src/engine/state.ts`:
  - `export const BASE_MAX_FUEL = 8;` (was 5) and `export const BASE_FUEL_REGEN_SEC = 65;` (was 75)
  - `GameState` gains (after `manifestSeq`):

```ts
  lastSalvageAt: Record<string, number>;
  visitedBeacons: string[];
```

  - `createInitialState`: `lastSalvageAt: {}, visitedBeacons: [],`

- [ ] **Step 4: Regen curve** — `src/engine/derived.ts` `fuelRegenSec`: `return Math.max(35, BASE_FUEL_REGEN_SEC - lvl * 6);` — and `src/config/ship.ts` fuel_recycler: `` effectLabel: (lvl) => `Regen ${Math.max(35, 65 - lvl * 6)}s / pip` ``.

- [ ] **Step 5: Lane-aware jumps in `src/engine/actions.ts`:**

5a. Imports:

```ts
import { generateSectorMap, laneBetween, nodeById, GATE_NODE_ID, type MapLane } from './mapgen';
```

5b. Replace `startJump` with:

```ts
export function startJump(targetNodeId: string): { ok: boolean; reason?: string; lane?: MapLane } {
  const state = getState();
  const map = generateSectorMap(state.sector, state.runSeed ?? 0);
  const target = nodeById(map, targetNodeId);
  if (!target) return { ok: false, reason: 'Unknown destination.' };
  if (target.kind === 'station' && STATIONS_BY_ID[target.id] && STATIONS_BY_ID[target.id].unlockRank > state.rank) {
    return { ok: false, reason: `Unlocks at Rank ${STATIONS_BY_ID[target.id].unlockRank}.` };
  }
  if (targetNodeId === state.currentStation) return { ok: false, reason: 'Already docked here.' };
  const lane = laneBetween(map, state.currentStation, targetNodeId);
  if (!lane) return { ok: false, reason: 'No warp lane from here.' };
  if (state.fuel < lane.fuel) return { ok: false, reason: 'Out of fuel.' };
  setState((s) => ({ ...s, fuel: s.fuel - lane.fuel }));
  emit({ type: 'sfx', id: 'jump' });
  emit({ type: 'haptic', pattern: 'tap' });
  return { ok: true, lane };
}
```

5c. Replace `completeJump`'s signature and arrival gating:

```ts
export function completeJump(
  targetNodeId: string,
  opts: { finalStop?: boolean; laneTrait?: MapLane['trait'] } = {}
): { roll: RolledArrival } {
  const t = now();
  const finalStop = opts.finalStop !== false; // default true — single hops behave like before
  let rolled: RolledArrival = { kind: 'clean' };
  setState((s) => {
    const map = generateSectorMap(s.sector, s.runSeed ?? 0);
    const node = nodeById(map, targetNodeId);
    const isStation = node?.kind === 'station';
    let state: GameState = { ...s, currentStation: targetNodeId, stats: { ...s.stats, totalJumps: s.stats.totalJumps + 1 } };
    if (isStation) state = stampCodex(state, 'stations', targetNodeId);
    state = processMarketPulses({ ...state, lastMarketPulseAt: state.lastMarketPulseAt - PULSE_INTERVAL_MS }, t);

    const pirateAmbush = opts.laneTrait === 'pirate' && chance(sessionRng, 0.3);
    if (pirateAmbush) {
      rolled = { kind: 'encounter', detail: { encounterId: 'pirate_toll' } };
      state = { ...state, pendingEncounter: { encounterId: 'pirate_toll', rolledAt: t } };
    } else if (finalStop && isStation) {
      const carryingContraband = Object.keys(state.cargo).some((gid) => state.cargo[gid].qty > 0 && GOODS_BY_ID[gid]?.contraband);
      const scanChance = scanChanceFor(state, targetNodeId);
      const forced = carryingContraband && chance(sessionRng, scanChance);
      rolled = forced ? { kind: 'encounter', detail: { encounterId: 'customs_scan' } } : rollArrival(state);
      if (forced) state = { ...state, pendingEncounter: { encounterId: 'customs_scan', rolledAt: t } };
      else state = applyArrivalRoll(state, rolled, t);
    }

    if (node?.kind === 'beacon' && !state.visitedBeacons.includes(targetNodeId)) {
      state = { ...state, visitedBeacons: [...state.visitedBeacons, targetNodeId], xp: state.xp + 25 };
      emit({ type: 'toast', text: 'Beacon logged. +25 XP', icon: '📍' });
      state = applyXpAndRankUps(state);
    }

    state = progressQuests(state, (q) => {
      if (q.kind === 'visit_station' && q.stationId === targetNodeId) return { ...q, progress: q.goal };
      if (q.kind === 'jump_n') return { ...q, progress: Math.min(q.goal, q.progress + 1) };
      return q;
    });
    return state;
  });
  emit({ type: 'sfx', id: 'arrival', stationMotif: STATIONS_BY_ID[targetNodeId]?.theme.motif });
  return { roll: rolled };
}
```

5d. Waypoint actions (add after `payGateToll`):

```ts
export function buyFuelPip(): { ok: boolean; reason?: string } {
  const state = getState();
  const map = generateSectorMap(state.sector, state.runSeed ?? 0);
  if (nodeById(map, state.currentStation)?.kind !== 'depot') return { ok: false, reason: 'No depot here.' };
  if (state.fuel >= maxFuel(state)) return { ok: false, reason: 'Tank full.' };
  const cost = Math.max(50, netWorth(state) * 0.02);
  if (state.credits < cost) return { ok: false, reason: 'Not enough credits.' };
  setState((s) => ({ ...s, credits: s.credits - cost, fuel: Math.min(maxFuel(s), s.fuel + 1) }));
  emit({ type: 'sfx', id: 'buy' }); // Task 14 swaps this to 'refuel'
  emit({ type: 'floater', text: formatSignedCredits(-cost), kind: 'info' });
  return { ok: true };
}

export function claimSalvage(): { ok: boolean; reason?: string } {
  const state = getState();
  const map = generateSectorMap(state.sector, state.runSeed ?? 0);
  if (nodeById(map, state.currentStation)?.kind !== 'salvage') return { ok: false, reason: 'Nothing to salvage here.' };
  const t = now();
  const last = state.lastSalvageAt[state.currentStation] ?? 0;
  if (t - last < 10 * 60_000) return { ok: false, reason: 'Field picked clean — come back later.' };
  const unlocked = allUnlockedGoods(state);
  if (!unlocked.length) return { ok: false, reason: 'Nothing here.' };
  const good = pick(sessionRng, unlocked);
  const qty = Math.min(randInt(sessionRng, 1, 4), freeCapacityUnits(state, good.id));
  if (qty <= 0) return { ok: false, reason: 'Hold is full.' };
  setState((s) => ({
    ...s,
    cargo: addCargo(s.cargo, good.id, qty, 0),
    lastSalvageAt: { ...s.lastSalvageAt, [s.currentStation]: t },
  }));
  emit({ type: 'sfx', id: 'buy' }); // Task 14 swaps this to 'salvage'
  emit({ type: 'toast', text: `Hauled in ${qty}× ${good.name}.`, icon: good.icon });
  return { ok: true };
}
```

(Task 14 introduces the real `'refuel'`/`'salvage'` ids and swaps these two emits.)

5e. Gate behavior — in `payGateToll`, after the `canEnterNextSector` check add:

```ts
  const map = generateSectorMap(state.sector, state.runSeed ?? 0);
  if (nodeById(map, state.currentStation)?.kind !== 'gate') return { ok: false, reason: 'Dock at the Sector Gate first.' };
```

and inside its `setState` return object add `currentStation: 'rust_harbor',`.

5f. Backfills — `bootGame` merged literal + `importSave` merged literal gain:

```ts
    lastSalvageAt: (loaded as Partial<GameState>).lastSalvageAt ?? {},
    visitedBeacons: (loaded as Partial<GameState>).visitedBeacons ?? [],
```

and `importSaveCode` (save.ts):

```ts
  if (typeof (parsed as Record<string, unknown>).lastSalvageAt !== 'object' || (parsed as Record<string, unknown>).lastSalvageAt === null) (parsed as Record<string, unknown>).lastSalvageAt = {};
  if (!Array.isArray((parsed as Record<string, unknown>).visitedBeacons)) (parsed as Record<string, unknown>).visitedBeacons = [];
```

- [ ] **Step 5g: Update the legacy fuel test** — `src/engine/__tests__/tuning.test.ts` pins the old 75s/−7/floor-40 curve and would fail the gate. Replace its `'fuel regen: base 75s, -7s/level, floor 40s'` test with:

```ts
  it('fuel regen: base 65s, -6s/level, floor 35s', () => {
    expect(BASE_FUEL_REGEN_SEC).toBe(65);
    const s = createInitialState();
    expect(fuelRegenSec(s)).toBe(65);
    s.shipUpgrades['fuel_recycler'] = 5;
    expect(fuelRegenSec(s)).toBe(35);
  });
```

(Its imports already cover everything used.)

- [ ] **Step 6: Verify** — focused test PASS; full `npm test` green (tuning.test.ts's old fuel test was replaced in Step 5g); `npm run typecheck` exit 0. Note: `maxFuel`, `netWorth`, `allUnlockedGoods`, `pick`, `randInt`, `addCargo`, `freeCapacityUnits` are already imported in actions.ts from earlier tasks/existing code — verify the import list compiles rather than assuming.

- [ ] **Step 7: Commit**

```bash
git add src/engine/state.ts src/engine/derived.ts src/config/ship.ts src/engine/actions.ts src/engine/save.ts src/engine/__tests__/tuning.test.ts src/engine/__tests__/travel.test.ts
git commit -m "feat: lane-validated travel, waypoint actions, gate docking, fuel rebalance

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Map screen rewrite + waypoint panels + theming

**Files:**
- Rewrite: `src/components/MapScreen.tsx`
- Create: `src/components/WaypointPanel.tsx`
- Modify: `src/components/MarketScreen.tsx` (waypoint branch)
- Modify: `src/engine/pricing.ts` (waypoint bias branch)
- Modify: `src/app.tsx` (theme for waypoint nodes)
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `generateSectorMap`, `nodeById`, `WAYPOINT_THEME`, `GATE_NODE_ID` (Task 10); `routeThrough` (Task 11); `startJump`/`completeJump` hop options, `buyFuelPip`, `claimSalvage` (Task 12); `ContractsPanel` (Task 9); existing `travelDurationMs`, `canSkipTravel`, `canEnterNextSector`, `nextSectorToll`, `payGateToll`.
- Produces: `biasFor` returns a seeded 0.95–1.15 for `wp-*` node ids (outpost pricing).

- [ ] **Step 1: Waypoint bias** — in `src/engine/pricing.ts`, add `mulberry32, hashSeed` to the `./rng`-style imports (they come from `./rng`; add the import line `import { mulberry32, hashSeed } from './rng';`), then at the TOP of `biasFor`'s body insert:

```ts
  if (stationId.startsWith('wp-')) {
    const r = mulberry32((hashSeed(`${stationId}:${good.id}`) ^ (runSeed >>> 0)) >>> 0);
    return 0.95 + r() * 0.2; // outposts trade near galactic average
  }
```

- [ ] **Step 2: Waypoint panel** — create `src/components/WaypointPanel.tsx`:

```tsx
import { useState } from 'preact/hooks';
import { store, clockTick } from '../engine/store';
import type { MapNode } from '../engine/mapgen';
import { goodById, getPrice } from '../engine/pricing';
import { buyFuelPip, claimSalvage, payGateToll, canEnterNextSector, nextSectorToll } from '../engine/actions';
import { sectorUnlockRank } from '../engine/formulas';
import { maxFuel, netWorth } from '../engine/derived';
import { formatCredits, formatNum, formatDuration } from '../engine/num';
import { TradeSheet } from './TradeSheet';
import type { Good } from '../config/types';
import { now } from '../engine/time';

export function WaypointPanel({ node }: { node: MapNode }) {
  const s = store.value;
  void clockTick.value;
  const [sheet, setSheet] = useState<{ good: Good; mode: 'buy' | 'sell' } | null>(null);
  const t = now();

  return (
    <>
    <div class="screen">
      <div class="screen-header">
        <span class="icon">{node.icon}</span>
        <div>
          <h1>{node.name}</h1>
          <div class="sub">
            {node.kind === 'outpost' && 'A dim little trade post. No questions, no scans.'}
            {node.kind === 'depot' && 'Fuel by the pip. Prices float with your reputation.'}
            {node.kind === 'salvage' && 'Debris field. Something useful drifts by now and then.'}
            {node.kind === 'beacon' && 'A lonely nav beacon, humming to itself.'}
            {node.kind === 'gate' && 'The way deeper. It costs what it costs.'}
          </div>
        </div>
      </div>

      {node.kind === 'outpost' && (node.goodIds ?? []).map((gid) => {
        const g = goodById(gid, s.runSeed ?? 0);
        if (!g) return null;
        if (g.unlockRank > s.rank) return null;
        const price = getPrice(s, s.currentStation, gid);
        const owned = s.cargo[gid]?.qty ?? 0;
        return (
          <div key={gid} class="good-row">
            <div class="g-icon">{g.icon}</div>
            <div class="g-main">
              <div class="g-name">{g.name}</div>
              <div class="g-price-line"><span class="g-price mono">{formatCredits(price)}</span></div>
              <div class="g-owned">{owned > 0 ? `Owned: ${formatNum(owned)} · ` : ''}{g.mass}t</div>
            </div>
            <div class="g-actions">
              <button class="btn btn-buy" onClick={() => setSheet({ good: g, mode: 'buy' })}>BUY</button>
              <button class="btn btn-sell" disabled={owned <= 0} onClick={() => setSheet({ good: g, mode: 'sell' })}>SELL</button>
            </div>
          </div>
        );
      })}

      {node.kind === 'depot' && (
        <div class="more-section">
          <div class="list-row">
            <span>⛽ {Math.floor(s.fuel)}/{maxFuel(s)} — pip price {formatCredits(Math.max(50, netWorth(s) * 0.02))}</span>
            <button class="btn btn-primary" disabled={s.fuel >= maxFuel(s)} onClick={() => buyFuelPip()}>BUY FUEL</button>
          </div>
        </div>
      )}

      {node.kind === 'salvage' && (() => {
        const last = s.lastSalvageAt[s.currentStation] ?? 0;
        const readyIn = last + 10 * 60_000 - t;
        return (
          <div class="more-section">
            <div class="list-row">
              <span>🛠️ {readyIn > 0 ? `Field regenerating — ${formatDuration(readyIn)}` : 'Something glints in the debris…'}</span>
              <button class="btn btn-primary" disabled={readyIn > 0} onClick={() => claimSalvage()}>GRAB</button>
            </div>
          </div>
        );
      })()}

      {node.kind === 'gate' && (
        <div class="more-section">
          {canEnterNextSector(s) ? (
            <div class="list-row">
              <span>🌀 Sector {s.sector + 1} — toll {formatCredits(nextSectorToll(s))}</span>
              <button class="btn btn-primary" disabled={s.credits < nextSectorToll(s)} onClick={() => payGateToll()}>PAY TOLL</button>
            </div>
          ) : (
            <div class="empty-hint">The gate ignores you. Reach Rank {sectorUnlockRank(s.sector + 1)}.</div>
          )}
        </div>
      )}

      {node.kind === 'beacon' && <div class="empty-hint">Nothing to trade. But you were here, and the beacon knows it.</div>}
    </div>
    {sheet && <TradeSheet good={sheet.good} mode={sheet.mode} onClose={() => setSheet(null)} />}
    </>
  );
}
```

- [ ] **Step 3: MarketScreen branch** — in `src/components/MarketScreen.tsx` add:

```ts
import { generateSectorMap, nodeById } from '../engine/mapgen';
import { WaypointPanel } from './WaypointPanel';
```

and as the FIRST statements of the component body (before `const station = …`):

```ts
  const map = generateSectorMap(s.sector, s.runSeed ?? 0);
  const node = nodeById(map, s.currentStation);
  if (node && node.kind !== 'station') return <WaypointPanel node={node} />;
```

(The later `const station = STATIONS_BY_ID[s.currentStation]` is then guaranteed to resolve.)

- [ ] **Step 4: MapScreen rewrite** — replace the ENTIRE contents of `src/components/MapScreen.tsx` with:

```tsx
import { useRef, useState } from 'preact/hooks';
import { store, clockTick, getState } from '../engine/store';
import { STATIONS_BY_ID } from '../config/stations';
import { MARKET_EVENTS_BY_ID } from '../config/events';
import { travelDurationMs, canSkipTravel } from '../engine/derived';
import { startJump, completeJump } from '../engine/actions';
import { bestRoute, goodById } from '../engine/pricing';
import { generateSectorMap, nodeById, GATE_NODE_ID, type MapNode } from '../engine/mapgen';
import { routeThrough } from '../engine/routing';
import { formatCredits, formatDuration, formatPct } from '../engine/num';
import { dressStationForSector } from '../engine/sectorgen';
import { ContractsPanel } from './ContractsPanel';
import { now } from '../engine/time';

export function MapScreen({ onHyperspace, onArrive }: { onHyperspace: (active: boolean) => void; onArrive: () => void }) {
  const s = store.value;
  void clockTick.value;
  const map = generateSectorMap(s.sector, s.runSeed ?? 0);
  const [stops, setStops] = useState<string[]>([]);
  const [traveling, setTraveling] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hopDoneRef = useRef<(() => void) | null>(null);
  const t = now();

  const scannerLvl = s.shipUpgrades.market_scanner ?? 0;
  const hint = scannerLvl >= 3 ? bestRoute(s) : null;
  const hintGood = hint ? goodById(hint.goodId) : null;

  const plan = stops.length ? routeThrough(map, [s.currentStation, ...stops]) : null;

  function nodeLabel(node: MapNode): string {
    if (node.kind === 'station') {
      const dressing = dressStationForSector(node.id, s.sector, s.runSeed ?? 0);
      const st = STATIONS_BY_ID[node.id];
      const locked = st && st.unlockRank > s.rank;
      return `${dressing.name || node.name}${locked ? ` R${st.unlockRank}` : ''}`;
    }
    return node.name;
  }

  function toggleStop(nodeId: string) {
    if (traveling || nodeId === s.currentStation) return;
    const st = STATIONS_BY_ID[nodeId];
    if (st && st.unlockRank > s.rank) return;
    setStops((prev) => (prev.includes(nodeId) ? prev.filter((x) => x !== nodeId) : [...prev, nodeId]));
  }

  function go() {
    const current = plan;
    if (!current || traveling) return;
    const path = current.path;
    onHyperspace(true);

    const finish = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      hopDoneRef.current = null;
      setTraveling(null);
      setStops([]);
      onHyperspace(false);
      onArrive();
    };

    const runHop = (i: number) => {
      if (i >= path.length) return finish();
      const target = path[i];
      const res = startJump(target);
      if (!res.ok) return finish();
      setTraveling(target);
      const dur = travelDurationMs(getState()) * (res.lane?.trait === 'express' ? 0.5 : 1);
      const complete = () => {
        timeoutRef.current = null;
        hopDoneRef.current = null;
        completeJump(target, { finalStop: i === path.length - 1, laneTrait: res.lane?.trait });
        if (getState().pendingEncounter) return finish(); // ambushed — route aborts here
        runHop(i + 1);
      };
      hopDoneRef.current = complete;
      timeoutRef.current = setTimeout(complete, dur);
    };
    runHop(1);
  }

  function skipHop() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    hopDoneRef.current?.();
  }

  const liveEvents = s.activeEvents.filter((e) => e.expiresAt > t);

  return (
    <>
    <div class="screen">
      <div class="screen-header">
        <span class="icon">🗺️</span>
        <div>
          <h1>The Drift</h1>
          <div class="sub">Sector {s.sector} · {s.fuel < 1 ? 'Out of fuel' : `${Math.floor(s.fuel)} ⛽ ready`}</div>
        </div>
      </div>

      <div class="map-wrap">
        <div class="lane-map">
          <svg class="lane-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            {map.lanes.map((l) => {
              const a = nodeById(map, l.a)!;
              const b = nodeById(map, l.b)!;
              return <line key={`${l.a}|${l.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} class={`lane ${l.trait}${l.fuel > 1 ? ' long' : ''}`} />;
            })}
          </svg>
          {map.nodes.map((node) => {
            const st = node.kind === 'station' ? STATIONS_BY_ID[node.id] : undefined;
            const locked = !!st && st.unlockRank > s.rank;
            const evs = liveEvents.filter((e) => e.stationId === node.id);
            const stopIdx = stops.indexOf(node.id);
            const isHint = hint?.stationId === node.id;
            return (
              <button
                key={node.id}
                class={`station-node ${node.kind}${node.id === s.currentStation ? ' current' : ''}${locked ? ' locked' : ''}${stopIdx >= 0 ? ' queued' : ''}${isHint ? ' best-route' : ''}`}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                onClick={() => toggleStop(node.id)}
              >
                {evs.length > 0 && <span class="node-event">{evs.length}📈</span>}
                {stopIdx >= 0 && <span class="node-stop">{stopIdx + 1}</span>}
                {isHint && <span class="node-route">📡</span>}
                <span>{node.icon}</span>
                <span class="node-label">{nodeLabel(node)}</span>
              </button>
            );
          })}
        </div>

        {plan && (
          <div class="route-bar">
            <span class="mono">
              {plan.path.length - 1} hop{plan.path.length !== 2 ? 's' : ''} · {plan.fuel}⛽{plan.pirates > 0 ? ` · ${plan.pirates}☠` : ''}
            </span>
            <button class="btn btn-ghost" onClick={() => setStops([])}>CLEAR</button>
            <button class="btn btn-primary" disabled={!!traveling || s.fuel < plan.fuel} onClick={go}>
              {s.fuel < plan.fuel ? 'NOT ENOUGH FUEL' : 'GO'}
            </button>
          </div>
        )}
        {!plan && <div class="empty-hint" style={{ textAlign: 'center' }}>Tap nodes to plot a route — order matters.</div>}

        {hint && hintGood && (
          <div class="route-hint">
            📡 Best flip: <b>{STATIONS_BY_ID[hint.stationId]?.name}</b> — {hintGood.icon} {hintGood.name} {formatPct(hint.margin, { signed: true })}
          </div>
        )}
      </div>

      <ContractsPanel />

      <div class="section-label">Active Signals</div>
      {liveEvents.length === 0 && <div class="empty-hint">Nothing spiking right now. Fly and find out.</div>}
      {liveEvents.map((e) => {
        const st = STATIONS_BY_ID[e.stationId];
        const def = MARKET_EVENTS_BY_ID[e.kind];
        const good = e.goodId ? goodById(e.goodId) : null;
        const dressing = st ? dressStationForSector(st.id, s.sector, s.runSeed ?? 0) : null;
        const stationName = dressing?.name || st?.name || '?';
        const desc = def
          ? def.copyTemplate.replace('{station}', stationName).replace('{good}', good?.name ?? 'everything').replace('{mult}', e.multiplier.toFixed(1))
          : '';
        const direction = e.disables ? 'blocked' : e.multiplier >= 1 ? 'up' : 'down';
        return (
          <div key={e.id} class={`signal-row ${direction}`}>
            <div class="signal-icon">{def?.icon ?? '📡'}</div>
            <div class="signal-body">
              <div class="signal-title">
                {def?.name ?? 'MARKET SIGNAL'}
                <span class="signal-loc"> · {st?.icon} {stationName}{st?.id === s.currentStation ? ' (here)' : ''}</span>
              </div>
              <div class="signal-desc">{desc}</div>
            </div>
            <div class="signal-meta">
              <span class={`signal-badge ${direction}`}>{e.disables ? '🚫 BLOCKED' : `${e.multiplier >= 1 ? '▲' : '▼'} ×${e.multiplier.toFixed(1)}`}</span>
              <span class="signal-timer mono">⏱ {formatDuration(e.expiresAt - t)}</span>
            </div>
          </div>
        );
      })}
    </div>

    {traveling && (
      <div class="hyperspace-overlay">
        <div style={{ fontSize: 40 }}>🌌</div>
        <div class="hs-label">JUMPING TO {nodeById(map, traveling)?.name.toUpperCase()}…</div>
        {canSkipTravel(s) && <button class="btn btn-ghost" onClick={skipHop}>SKIP ▶</button>}
      </div>
    )}
    </>
  );
}
```

Also export `getState` from `src/engine/store.ts` import in this file — it is already exported; just note the import shown above pulls `getState` from `'../engine/store'`.

- [ ] **Step 5: App theming** — in `src/app.tsx`:
  - add `import { generateSectorMap, nodeById, WAYPOINT_THEME } from './engine/mapgen';`
  - replace the `station`/`dressing` lines with:

```ts
  const map = generateSectorMap(s.sector, s.runSeed ?? 0);
  const node = nodeById(map, s.currentStation);
  const station = node?.kind === 'station' ? STATIONS_BY_ID[s.currentStation] : undefined;
  const theme = station?.theme ?? WAYPOINT_THEME;
  const dressing = station ? dressStationForSector(s.currentStation, s.sector, s.runSeed ?? 0) : { name: node?.name ?? '', hueShift: 0 };
```

  - inside the theme `useEffect`, DELETE the line `const theme = station.theme;` — the effect then closes over the component-scope `theme` binding added above. Everything else in the effect body stays exactly as-is, including the `setStationAmbience(s.currentStation, theme.motif, theme.ambienceType);` call (it now reads the outer `theme`; `WAYPOINT_THEME` supplies `motif`/`ambienceType` at waypoints). The dependency array stays `[s.currentStation, s.sector]` — `theme` derives from those two values.
  - update the `<Starfield hue={station.theme.particleHue} overlay={station.theme.overlay} …/>` props to `theme.particleHue` / `theme.overlay`.

- [ ] **Step 6: Styles** — append to `src/style.css`:

```css
/* Warp-lane map */
.lane-map { position: relative; width: 100%; aspect-ratio: 1 / 0.92; }
.lane-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.lane { stroke: rgba(255,255,255,0.22); stroke-width: 0.7; }
.lane.long { stroke-dasharray: 2 1.2; }
.lane.pirate { stroke: rgba(255,90,64,0.55); stroke-dasharray: 1.4 1.4; }
.lane.express { stroke: rgba(33,230,255,0.6); stroke-dasharray: 3 1; }
.station-node.outpost, .station-node.depot, .station-node.salvage, .station-node.beacon { font-size: 13px; opacity: 0.9; }
.station-node.queued { outline: 2px solid var(--accent); border-radius: 12px; }
.node-stop {
  position: absolute; top: -7px; left: -7px; background: var(--accent); color: #000;
  border-radius: 50%; width: 15px; height: 15px; font-size: 10px; line-height: 15px; text-align: center;
}
.route-bar { display: flex; align-items: center; gap: 8px; justify-content: center; margin-top: 8px; }
```

- [ ] **Step 7: Verify** — `npm run typecheck` exit 0; `npm test` green. Manual (`npm run dev`): lanes render; tapping nodes builds a numbered queue with live fuel/pirate totals; GO hops through with the overlay; pirate lanes occasionally ambush (route halts at the encounter); outpost/depot/salvage/gate open their panels on the MARKET tab; waypoints get the deep-space theme.

- [ ] **Step 8: Commit**

```bash
git add src/components/MapScreen.tsx src/components/WaypointPanel.tsx src/components/MarketScreen.tsx src/engine/pricing.ts src/app.tsx src/style.css
git commit -m "feat: warp-lane map with multi-stop route queue and waypoint panels

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: Map & economy SFX

**Files:**
- Modify: `src/engine/bus.ts`, `src/engine/audio.ts`, `src/engine/actions.ts`

**Interfaces:**
- Produces SfxIds: `'refuel' | 'salvage' | 'express'`. (Manifest ids landed in Task 9.)

- [ ] **Step 1: Union** — `src/engine/bus.ts`: append `| 'refuel' | 'salvage' | 'express'` to `SfxId`.

- [ ] **Step 2: Recipes** — `src/engine/audio.ts` `play()` switch, add:

```ts
      case 'refuel':
        this.tone(180, 0.25, { type: 'triangle', startFreq: 90, gain: 0.18 });
        this.noise(0.2, { gain: 0.06, filterType: 'lowpass', filterFreq: 900, delay: 0.05 });
        break;
      case 'salvage':
        this.tone(140, 0.08, { type: 'square', gain: 0.16 });
        this.tone(1046.5, 0.1, { gain: 0.14, delay: 0.1 });
        this.tone(1318.5, 0.1, { gain: 0.12, delay: 0.17 });
        break;
      case 'express':
        this.noise(0.5, { gain: 0.14, filterType: 'bandpass', filterFreq: 600, filterFreqEnd: 6000, filterQ: 1.2 });
        break;
```

- [ ] **Step 3: Wiring** — `src/engine/actions.ts`: in `buyFuelPip` change `id: 'buy'` → `id: 'refuel'`; in `claimSalvage` change `id: 'buy'` → `id: 'salvage'`; in `startJump`, after the existing `emit({ type: 'sfx', id: 'jump' });` add:

```ts
  if (lane.trait === 'express') emit({ type: 'sfx', id: 'express' });
```

- [ ] **Step 4: Verify** — `npm run typecheck` exit 0 (the union catches typos); `npm test` green.

- [ ] **Step 5: Commit**

```bash
git add src/engine/bus.ts src/engine/audio.ts src/engine/actions.ts
git commit -m "feat: refuel, salvage and express-lane SFX

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 15: Balance sim v3 — tonnage/stocks/manifests/lanes model + gates

**Files:**
- Rewrite: `scripts/balance-sim.mjs` (model swap; `npm run balance` gates the NEW systems)

**Interfaces:**
- `npm run balance` exits 0 with PASS lines under the new model. Planning-run observed values: ratio@1e6 ≈ 0.58, ratio@1e7 ≈ 1.37, R13 ≈ 1.12h, R20 ≈ 1.38h, R25 ≈ 1.48h.

- [ ] **Step 1: Replace `scripts/balance-sim.mjs` entirely with:**

```js
// JUNKRUN balance sim v3 — executable tuning targets for the trade & travel
// overhaul (tonnage holds, station stocks, manifests, warp-lane travel).
// Mirrors (keep in sync by hand): config/rigs.ts, engine/formulas.ts
// (milestones), config/goods.ts (trade ladder + masses), engine/derived.ts
// (hold tons / fuel), engine/stocks.ts (retention modeled), engine/manifests.ts
// (premium), engine/mapgen.ts (lane costs), config/ranks.ts + engine/quests.ts
// (xp), price.ts sectorScale, formulas.ts gateToll/sectorUnlockRank + parity.
// Model: optimal-play active trader vs tap+manager rig player at equal
// lifetime earnings. Realistic play ≈ 3-5× slower than "optimal".

const RIGS = [
  { baseCost: 100, costGrowth: 1.10, cycleSec: 3, basePayout: 14, managerCost: 1_500 },
  { baseCost: 750, costGrowth: 1.11, cycleSec: 6, basePayout: 90, managerCost: 9_000 },
  { baseCost: 6_000, costGrowth: 1.12, cycleSec: 12, basePayout: 640, managerCost: 60_000 },
  { baseCost: 45_000, costGrowth: 1.12, cycleSec: 24, basePayout: 4_300, managerCost: 400_000 },
  { baseCost: 300_000, costGrowth: 1.13, cycleSec: 45, basePayout: 26_000, managerCost: 2_500_000 },
  { baseCost: 2_000_000, costGrowth: 1.13, cycleSec: 90, basePayout: 160_000, managerCost: 15_000_000 },
  { baseCost: 14_000_000, costGrowth: 1.14, cycleSec: 150, basePayout: 1_050_000, managerCost: 90_000_000 },
  { baseCost: 100_000_000, costGrowth: 1.14, cycleSec: 300, basePayout: 7_000_000, managerCost: 600_000_000 },
  { baseCost: 800_000_000, costGrowth: 1.15, cycleSec: 600, basePayout: 52_000_000, managerCost: 4_500_000_000 },
  { baseCost: 6_500_000_000, costGrowth: 1.15, cycleSec: 1200, basePayout: 400_000_000, managerCost: 35_000_000_000 },
];
const MILESTONES = [10, 25, 50, 100, 200];
function milestoneMultiplier(owned) {
  let hits = 0;
  for (const m of MILESTONES) if (owned >= m) hits++;
  if (owned >= 200) hits = MILESTONES.length + Math.floor((owned - 200) / 100);
  return Math.pow(2, hits);
}
const rigUnitCost = (rig, owned) => Math.round(rig.baseCost * Math.pow(rig.costGrowth, owned));
const GOODS = [
  { unlockRank: 1, base: 35, mass: 7.5 },   // hull plates
  { unlockRank: 3, base: 150, mass: 2.25 }, // spore crates
  { unlockRank: 6, base: 900, mass: 0.9 },  // earth relics
  { unlockRank: 9, base: 6500, mass: 1.2 }, // warp cells
  { unlockRank: 10, base: 9000, mass: 0.75 },
  { unlockRank: 15, base: 45000, mass: 0.9 },
  { unlockRank: 17, base: 90000, mass: 0.45 },
  { unlockRank: 19, base: 140000, mass: 0.4 },
  { unlockRank: 22, base: 500000, mass: 0.45 },
  { unlockRank: 24, base: 900000, mass: 1.5 },
  { unlockRank: 26, base: 1500000, mass: 4.5 },
  { unlockRank: 28, base: 2500000, mass: 0.25 },
];
const bestGood = (rank) => { let b = GOODS[0]; for (const g of GOODS) if (g.unlockRank <= rank) b = g; return b; };
const sectorScale = (s) => Math.pow(8, s - 1);
const gateToll = (d) => 2_000_000 * Math.pow(15, d - 2);
const sectorUnlockRank = (d) => 20 + (d - 2) * 10;
const xpToNext = (lvl) => Math.round(12 * Math.pow(lvl, 1.8));

const P = {
  tapsPerSec: 2,
  exporterMid: 0.575, importerMid: 1.60,
  holdBaseTons: 20, holdPerLevelTons: 5, cargoBaseCost: 800, cargoGrowth: 1.65,
  gravitonPct: 0.25, gravitonBaseCost: 250_000, gravitonGrowth: 5, gravitonMax: 5,
  fuelRegenBase: 65, fuelRegenPerLvl: 6, fuelRegenFloor: 35,
  recyclerBase: 5000, recyclerGrowth: 3, recyclerMax: 5,
  streakStep: 0.10, streakCap: 5,
  saleXpExp: 0.42, saleXpCoef: 3, questXpRankCoef: 0.10,
  stockMarginRetention: 0.85, // rotating 2-3 routes keeps ~85% of naive margin
  manifestShare: 0.30, manifestPremium: 1.9, manifestXpMult: 1.5,
  lanesPerLeg: 1.8, fuelPerLane: 1.15, travelSecPerLane: 3,
};

function simRigs(hours, checkpoints) {
  const owned = RIGS.map(() => 0), managed = RIGS.map(() => false);
  let credits = 500, lifetime = 0;
  const samples = new Map();
  const idleRate = () => RIGS.reduce((s, r, i) => s + (managed[i] ? (r.basePayout / r.cycleSec) * owned[i] * milestoneMultiplier(owned[i]) : 0), 0);
  const tapRate = () => {
    let best = 0;
    for (let i = 0; i < RIGS.length; i++) {
      if (owned[i] <= 0 || managed[i]) continue;
      best = Math.max(best, (RIGS[i].basePayout / RIGS[i].cycleSec) * owned[i] * milestoneMultiplier(owned[i]) * P.tapsPerSec);
    }
    return best;
  };
  const dt = 5;
  for (let t = 0; t < hours * 3600; t += dt) {
    const inc = (idleRate() + tapRate()) * dt;
    credits += inc; lifetime += inc;
    for (let i = 0; i < RIGS.length; i++) {
      if (owned[i] > 0 && !managed[i] && credits >= RIGS[i].managerCost) { credits -= RIGS[i].managerCost; managed[i] = true; }
    }
    for (let guard = 0; guard < 400; guard++) {
      let best = -1, bestScore = 0, bestCost = 0;
      for (let i = 0; i < RIGS.length; i++) {
        const c = rigUnitCost(RIGS[i], owned[i]);
        if (c > credits) continue;
        const cur = (RIGS[i].basePayout / RIGS[i].cycleSec) * owned[i] * milestoneMultiplier(owned[i]);
        const nxt = (RIGS[i].basePayout / RIGS[i].cycleSec) * (owned[i] + 1) * milestoneMultiplier(owned[i] + 1);
        const score = (nxt - cur) / c;
        if (score > bestScore) { bestScore = score; best = i; bestCost = c; }
      }
      if (best < 0) break;
      credits -= bestCost; owned[best]++;
    }
    for (const cp of checkpoints) if (!samples.has(cp) && lifetime >= cp) samples.set(cp, { rate: idleRate() + tapRate() });
  }
  return samples;
}

function simTrader(hours, checkpoints) {
  let credits = 500, lifetime = 0, rank = 1, xp = 0, sector = 1;
  let cargoLvl = 0, recyclerLvl = 0, gravitonLvl = 0, t = 0, questTimer = 0;
  const samples = new Map(); const rankHit = {};
  const HANDLING = 25;
  while (t < hours * 3600) {
    const tons = (P.holdBaseTons + cargoLvl * P.holdPerLevelTons) * (1 + P.gravitonPct * gravitonLvl);
    const regen = Math.max(P.fuelRegenFloor, P.fuelRegenBase - recyclerLvl * P.fuelRegenPerLvl);
    const fuelPerLoop = 2 * P.lanesPerLeg * P.fuelPerLane; // two legs per loop
    const loopSec = fuelPerLoop * regen + 2 * P.lanesPerLeg * P.travelSecPerLane + HANDLING;
    const good = bestGood(rank), scale = sectorScale(sector);
    const buyPrice = good.base * scale * P.exporterMid;
    const qty = Math.min(Math.floor(tons / good.mass), Math.floor((credits * 0.9) / buyPrice));
    const streakMult = 1 + Math.min(4, P.streakCap) * P.streakStep; // 4 = typical sustained stacks, below the in-game cap of 5
    const sellPrice = good.base * scale * P.importerMid * streakMult * P.stockMarginRetention;
    const plainRev = qty * sellPrice;
    const maniRev = qty * good.base * scale * P.manifestPremium; // contracts bypass stock decay
    const cost = qty * buyPrice;
    const profit = Math.max(0, (1 - P.manifestShare) * (plainRev - cost) + P.manifestShare * (maniRev - cost));
    credits += profit; lifetime += profit;
    const baseXp = profit > 0 ? Math.max(1, Math.ceil(P.saleXpCoef * Math.pow(profit, P.saleXpExp))) : 1;
    xp += baseXp * (1 + P.manifestShare * (P.manifestXpMult - 1));
    questTimer += loopSec;
    if (questTimer >= 720) { questTimer = 0; xp += 55 * (1 + P.questXpRankCoef * rank); }
    while (xp >= xpToNext(rank)) { xp -= xpToNext(rank); rank++; if (!rankHit[rank]) rankHit[rank] = t / 3600; }
    for (let g = 0; g < 60; g++) {
      const cCost = Math.round(P.cargoBaseCost * Math.pow(P.cargoGrowth, cargoLvl));
      if (cCost < credits * 0.15) { credits -= cCost; cargoLvl++; continue; }
      break;
    }
    if (recyclerLvl < P.recyclerMax) {
      const rCost = Math.round(P.recyclerBase * Math.pow(P.recyclerGrowth, recyclerLvl));
      if (rCost < credits * 0.15) { credits -= rCost; recyclerLvl++; }
    }
    if (gravitonLvl < P.gravitonMax) {
      const gCost = Math.round(P.gravitonBaseCost * Math.pow(P.gravitonGrowth, gravitonLvl));
      if (gCost < credits * 0.15) { credits -= gCost; gravitonLvl++; }
    }
    const toll = gateToll(sector + 1);
    if (rank >= sectorUnlockRank(sector + 1) && credits > toll * 1.5) { credits -= toll; sector++; }
    const rate = profit / loopSec;
    t += loopSec;
    for (const cp of checkpoints) if (!samples.has(cp) && lifetime >= cp) samples.set(cp, { rate, rank, sector });
  }
  return { samples, rankHit };
}

const CHECKPOINTS = [1e5, 1e6, 1e7];
const rig = simRigs(60, CHECKPOINTS);
const { samples: trade, rankHit } = simTrader(60, CHECKPOINTS);

console.log('wealth      rig ₡/s     trade ₡/s   trade/rig');
const ratios = {};
for (const cp of CHECKPOINTS) {
  const r = rig.get(cp), tm = trade.get(cp);
  if (!r || !tm) continue;
  ratios[cp] = tm.rate / r.rate;
  console.log(`${cp.toExponential(0).padEnd(10)} ${r.rate.toFixed(0).padStart(9)} ${tm.rate.toFixed(0).padStart(12)} ${ratios[cp].toFixed(2).padStart(10)}`);
}
console.log(`rank pacing (optimal play): R13=${rankHit[13]?.toFixed(2)}h  R20=${rankHit[20]?.toFixed(2)}h  R25=${rankHit[25]?.toFixed(2)}h`);

const checks = [
  ['ratio @ 1e6 in [0.30, 1.25]', ratios[1e6] >= 0.30 && ratios[1e6] <= 1.25],
  ['ratio @ 1e7 in [0.90, 1.75]', ratios[1e7] >= 0.90 && ratios[1e7] <= 1.75],
  ['R13 not trivial (>= 0.5h optimal)', (rankHit[13] ?? 99) >= 0.5],
  ['R20 reachable (<= 1.5h optimal)', (rankHit[20] ?? 99) <= 1.5],
  ['R25 reachable (<= 1.8h optimal)', (rankHit[25] ?? 99) <= 1.8],
];
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it**

Run: `npm run balance`
Expected: five PASS lines, exit 0 (observed at planning time: ratio@1e6 = 0.58, ratio@1e7 = 1.37, R13 = 1.12h, R20 = 1.38h, R25 = 1.48h).

- [ ] **Step 3: Commit**

```bash
git add scripts/balance-sim.mjs
git commit -m "test: balance gates for tonnage, stocks, manifests and lane travel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 16: Version bump + final verification

**Files:**
- Modify: `package.json` (version), `src/components/MoreScreen.tsx` (About line)

- [ ] **Step 0: Bump to 2.0.0** — this overhaul changes core play (tonnage cargo, lane travel, living economy): a major version.
  - `package.json`: `"version": "1.0.0"` → `"version": "2.0.0"`.
  - `src/components/MoreScreen.tsx` About section: replace `JUNKRUN v1.0 · Buy junk. Jump stars. Get rich. Endless.` with `JUNKRUN v2.0 · Buy junk. Plot routes. Work the market. Endless.`
  - Commit:

```bash
git add package.json src/components/MoreScreen.tsx
git commit -m "chore: v2.0.0 — tonnage cargo, living economy, warp-lane map

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(Release tags happen at merge time, not in this task: `v1.1.0` retroactively on the balance/audio merge `bdeaa26`, `v2.0.0` on this branch's merge commit.)

- [ ] **Step 1: Full gate**

```bash
npm run typecheck && npm test && npm run balance && npm run build
```

Expected: all four succeed.

- [ ] **Step 2: Save-compat spot checks** — `npm run dev`, browser console:

```js
// simulate a pre-overhaul save: strip every new field, reload
const s = JSON.parse(localStorage.getItem('junkrun_save_v1') ?? 'null');
if (s) {
  delete s.stocks; delete s.manifests; delete s.manifestSeq;
  delete s.lastSalvageAt; delete s.visitedBeacons;
  delete s.settings.marketSort; delete s.settings.marketFilters;
  localStorage.setItem('junkrun_save_v1', JSON.stringify(s));
  location.reload();
}
```

Expected after reload: no console errors; three contracts appear; market controls work; map renders with the player at a station node.

- [ ] **Step 3: Manual QA checklist** (report results, fix nothing without a task):
  - Buy heavily at one station → SCARCE appears, price climbs; return 20 min later → recovered.
  - Assemble and deliver a manifest → premium payout + fanfare; a fresh contract replaces it.
  - Plot a 3-stop route; total fuel matches the hops; a pirate lane occasionally ambushes; SKIP works per hop.
  - Visit each waypoint kind once: outpost trades, depot sells fuel, salvage grants (then cools down), beacon pays XP once.
  - Collapse (prestige) → new map topology AND new routes; legacy behaviors intact.
  - Tonnage: hold caps by tons; graviton frame raises the cap.
  - Fresh save (clear localStorage) → run the full tutorial from LAUNCH through step 7; every step must be completable with the starting 20t ship (step 1 asks for 3 Scrap Metal).
  - Sort by ₡/ton; filter to Owned; reload → choices persisted.

- [ ] **Step 4: STOP.** Report completion. The human decides merge/deploy (use superpowers:finishing-a-development-branch).

---

## Self-review notes (already applied)

- Spec coverage: F1 → Tasks 4-5; F2 → Tasks 6-9; F3 → Tasks 10-14; F4 → Tasks 1-3; balance gates → Task 15; verification → Task 16.
- Save-compat: every new field has THREE backfills (bootGame, importSave, importSaveCode) — Tasks 6, 8, 12; the procedural-rng-stream hazard is pinned by Task 1's snapshot test.
- Type consistency: `freeCapacityUnits(state, goodId)` (T2) consumed in T12; `Manifest`/`canDeliver` (T8) consumed in T9; `SectorMap/MapNode/MapLane/GATE_NODE_ID/WAYPOINT_THEME` (T10) consumed in T11-13; `startJump` returns `{ ok, reason?, lane? }` (T12) consumed by MapScreen (T13); SFX placeholders in T8/T12 use existing ids and are swapped by the task that adds the real ids (T9/T14) — each task typechecks independently.
- Deliberate sequencing: Tasks 8→9 and 12→13→14 are order-dependent (placeholder SFX swaps, UI consuming engine); everything else is file-disjoint enough for the parallel-wave execution style used last time.
- Known deferred ideas (spec "out of scope"): price webs, tile movement, search/saved views, manifest chains.
- Adversarial review pass (33 agents, 2026-07-16) confirmed and fixed 12 distinct defects, notably: tuning.test.ts legacy-constant collisions (now updated in Tasks 2/12), the derelict use-before-declaration reorder, travel.test.ts nondeterminism (pinned seed + rank 12), the tonnage tutorial soft-lock (Task 3 fixes Onboarding to 3 scrap), the motherlode tonnage budget, scan-aware manifest pools, and the 3-heavy-item manifest clamp. One finding was rejected as modeling-fidelity-only (the sim's flat 0.85 stock-retention constant vs the dynamic implementation — the constant is a deliberate simplification).
