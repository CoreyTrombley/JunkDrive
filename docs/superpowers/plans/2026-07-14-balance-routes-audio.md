# JUNKRUN Balance, Per-Run Routes & Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the rig-tap exploit, re-roll trade routes every prestige ("collapse"), rebalance trading to ~1.25× rig income with verified constants, make Rank 20 reachable, add an Active Time stat, and upgrade the synth audio to multi-voice chiptune with an expanded SFX palette.

**Architecture:** All game logic lives in pure TypeScript reducers (`src/engine/actions.ts`) over a Preact signal store; tuning constants live in `src/config/*`. Changes are: (1) new pure functions in `src/engine/formulas.ts` + constant edits, (2) a `runSeed` field threaded through the procedural generators in `src/engine/sectorgen.ts`/`src/engine/pricing.ts`, (3) a rewritten music sequencer in `src/engine/audio.ts`. A Node balance-sim script (`scripts/balance-sim.mjs`) encodes the tuning targets as PASS/FAIL assertions.

**Tech Stack:** Preact + @preact/signals, Vite 5, TypeScript 5 (strict), Web Audio (zero audio files). Tests: vitest (added by Task 0, dev-only).

## Background you need (read once)

- The game calls prestige "**collapse**" (`HOLD TO COLLAPSE` in `src/components/MoreScreen.tsx`). It resets the run via `prestige()` in `src/engine/actions.ts`.
- "Rank" is the player level shown as `R13` in the HUD (the user calls it "T level"). XP comes only from selling goods (`saleXp`) and quests — never from rigs.
- Sector-1 trade routes are a hand-authored bias matrix in `src/config/stations.ts` (`bias` per station). Sector≥2 goods and routes are procedurally generated in `src/engine/sectorgen.ts` from **fixed string seeds**, so today every run and every player gets identical routes. Procedural goods are re-derived **from their id alone** (`goodById` in `src/engine/pricing.ts`), so any new seed must be stored in `GameState` and give identical output for old saves (we use XOR with `runSeed`, where legacy saves get `runSeed = 0` — XOR by 0 is the identity, so legacy saves regenerate byte-identical goods).
- Trade price = `good.base × stationBias × wave × events × 8^(sector-1)` (`computePrice` in `src/engine/price.ts`).
- Rig (Yard) income = `(basePayout / cycleSec) × owned × milestoneMultiplier(owned) × globalIncomeMult(state)` per second when managed (`src/engine/formulas.ts`). **Bug being fixed:** `tapRig` in `actions.ts` pays `basePayout × owned × …` — a full cycle per tap instead of one second.
- Simulation (already run during planning; script shipped in Task 9) verified the constants below: active trading lands at ~0.5× rig income at ₡1M wealth, crossing to ~1.3× at ₡10M, and yard sector-parity (Task 6) keeps that ratio stable across sectors. Optimal-play rank times: R13 ≈ 0.7h, R20 ≈ 0.9h, R25 ≈ 1.0h (realistic play ≈ 3–5× those — R20 lands in an evening instead of never).

## Global Constraints

- Never break old saves: a pre-existing localStorage save (no `runSeed`, no `stats.activePlayMs`) must load without errors and keep its sector≥2 goods identical (`runSeed: 0` backfill).
- No new **runtime** dependencies. `vitest` is added as a devDependency only.
- `npm run typecheck` (`tsc -b --noEmit`, strict) must pass after every task.
- Audio stays 100% synthesized — no audio files, no external requests.
- Exact constants below are sim-verified — copy them verbatim, do not re-tune: tap = 1 second of income; bias exporter `0.50–0.65`, importer `1.35–1.85` at 40% chance; hot streak `0.10`/stack (cap 5); cargo hold `+3`/level, cost growth `1.65`; fuel regen base `75`s, `−7`s/level, floor `40`s; demand spike max `×6`; `saleXp = ceil(3 · profit^0.42)`; quest XP `× (1 + 0.10 · rank)`; yard sector parity `× 8^(sector−1)`.
- Work on a branch: `git checkout -b balance-audio-pass` before Task 0's commit.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 0: Test harness (vitest)

**Files:**
- Modify: `package.json`
- Create: `src/engine/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: `npm test` (vitest run), used by every later task.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/hoarfrost/code/junkrun-source && git checkout -b balance-audio-pass
```

- [ ] **Step 2: Add vitest**

```bash
npm install --save-dev "vitest@^2.1.9"
```

- [ ] **Step 3: Add the test script to `package.json`** — in the `"scripts"` block, after the `"typecheck"` line, add:

```json
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run"
```

(i.e. append `"test": "vitest run"` — remember the comma on the previous line.)

- [ ] **Step 4: Write a smoke test** — create `src/engine/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';

describe('smoke', () => {
  it('creates a fresh state', () => {
    const s = createInitialState();
    expect(s.credits).toBe(500);
    expect(s.rank).toBe(1);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: 1 passed.

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/engine/__tests__/smoke.test.ts
git commit -m "test: add vitest harness

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 1: Tap pays one second of income (engine)

One tap on an unmanaged rig currently pays a **full cycle** (`basePayout × owned × …`); it must pay **one second** of the rig's effective rate, so speed-tapping (~2–3 taps/s) is worth ~2–3× a manager on that rig, not ~cycleSec×.

**Files:**
- Modify: `src/engine/formulas.ts` (rewrite `rigRatePerSec`, add `rigEffectiveRatePerSec` + `rigTapPayout`)
- Modify: `src/engine/actions.ts:865-886` (`tapRig`)
- Test: `src/engine/__tests__/rigs.test.ts`

**Interfaces:**
- Produces: `rigEffectiveRatePerSec(state: GameState, rig: Rig, atTime: number): number` — full per-second rate for a rig's owned units incl. milestone/global/salvage-fleet bonuses, regardless of `managed`.
- Produces: `rigTapPayout(state: GameState, rig: Rig, atTime: number): number` — exactly `rigEffectiveRatePerSec(...) × 1`.
- `rigRatePerSec` keeps its exact signature but now returns `rigEffectiveRatePerSec` gated on `managed` (behavior unchanged for managed rigs).
- Consumed by: Task 2 (YardScreen).

- [ ] **Step 1: Write failing tests** — create `src/engine/__tests__/rigs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';
import { RIGS_BY_ID } from '../../config/rigs';
import { rigTapPayout, rigEffectiveRatePerSec, rigRatePerSec } from '../formulas';

function stateWithRig(id: string, owned: number, managed = false) {
  const s = createInitialState();
  s.rigs[id] = { owned, managed };
  return s;
}

describe('rig payouts', () => {
  const vend = RIGS_BY_ID['vending_drones']; // basePayout 14, cycleSec 3

  it('tap pays exactly one second of effective income', () => {
    const s = stateWithRig('vending_drones', 5);
    // (14 / 3) * 5 owned * milestone ×1 * global ×1
    expect(rigTapPayout(s, vend, Date.now())).toBeCloseTo((14 / 3) * 5, 6);
  });

  it('tap includes milestone multiplier', () => {
    const s = stateWithRig('vending_drones', 10); // milestone ×2 at 10 owned
    expect(rigTapPayout(s, vend, Date.now())).toBeCloseTo((14 / 3) * 10 * 2, 6);
  });

  it('effective rate ignores managed, rigRatePerSec requires it', () => {
    const s = stateWithRig('vending_drones', 5, false);
    const t = Date.now();
    expect(rigEffectiveRatePerSec(s, vend, t)).toBeCloseTo((14 / 3) * 5, 6);
    expect(rigRatePerSec(s, vend, t)).toBe(0);
    s.rigs['vending_drones'].managed = true;
    expect(rigRatePerSec(s, vend, t)).toBeCloseTo((14 / 3) * 5, 6);
  });

  it('salvage fleet flip-margin bonus applies to effective rate', () => {
    const s = stateWithRig('salvage_fleet', 1); // basePayout 160000, cycleSec 90
    s.bests.bestFlipMargin = 1.0; // +100%, capped at +300%
    expect(rigEffectiveRatePerSec(s, RIGS_BY_ID['salvage_fleet'], Date.now()))
      .toBeCloseTo((160000 / 90) * 1 * 1 * 2, 4);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `rigTapPayout` / `rigEffectiveRatePerSec` are not exported.

- [ ] **Step 3: Implement in `src/engine/formulas.ts`** — replace the existing `rigRatePerSec` function (currently lines 66-75) with:

```ts
/** Full per-second rate of a rig's owned units — milestones, global mults and the
 *  Salvage Fleet flip-margin bonus included — independent of whether it's managed.
 *  This is both what a manager automates and what one hand-tap is worth per second. */
export function rigEffectiveRatePerSec(state: GameState, rig: Rig, atTime: number): number {
  const r = state.rigs[rig.id];
  if (!r || r.owned <= 0) return 0;
  let base = (rig.basePayout / rig.cycleSec) * r.owned * milestoneMultiplier(r.owned) * globalIncomeMult(state, atTime);
  if (rig.id === 'salvage_fleet') {
    const bonus = Math.min(3, state.bests.bestFlipMargin); // capped +300%
    base *= 1 + bonus;
  }
  return base;
}

export function rigRatePerSec(state: GameState, rig: Rig, atTime: number): number {
  const r = state.rigs[rig.id];
  if (!r || !r.managed) return 0;
  return rigEffectiveRatePerSec(state, rig, atTime);
}

/** One tap = one second of the rig's effective income (was: a full cycle — grossly overpaid). */
export function rigTapPayout(state: GameState, rig: Rig, atTime: number): number {
  return rigEffectiveRatePerSec(state, rig, atTime);
}
```

- [ ] **Step 4: Use it in `tapRig`** — in `src/engine/actions.ts`, the import block from `./formulas` (lines 24-28) currently reads:

```ts
import {
  rigUnitCost, rigBatchCost, maxAffordableRigQty, milestoneMultiplier,
  codexBonusMult, globalIncomeMult, totalYardRatePerSec, gateToll,
  sectorUnlockRank, darkMatterFromLifetime, offlineCapMs, luckyFlipChance,
} from './formulas';
```

Add `rigTapPayout`:

```ts
import {
  rigUnitCost, rigBatchCost, maxAffordableRigQty, milestoneMultiplier,
  codexBonusMult, globalIncomeMult, totalYardRatePerSec, gateToll,
  sectorUnlockRank, darkMatterFromLifetime, offlineCapMs, luckyFlipChance,
  rigTapPayout,
} from './formulas';
```

Then in `tapRig` replace the payout line

```ts
  const payout = rig.basePayout * r.owned * milestoneMultiplier(r.owned) * globalIncomeMult(state, t);
```

with

```ts
  const payout = rigTapPayout(state, rig, t);
```

- [ ] **Step 5: Verify**

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/engine/formulas.ts src/engine/actions.ts src/engine/__tests__/rigs.test.ts
git commit -m "fix: rig tap pays one second of income, not a full cycle

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Yard UI shows each rig's effective earning rate

The rig card currently shows only the base `₡/s per unit`; show the rig's real total rate (owned × milestone × global) and a correct tap hint.

**Files:**
- Modify: `src/components/YardScreen.tsx`

**Interfaces:**
- Consumes: `rigEffectiveRatePerSec`, `rigTapPayout` from Task 1.

- [ ] **Step 1: Update imports** — in `src/components/YardScreen.tsx`, replace the formulas import (lines 4-7):

```ts
import {
  rigUnitCost, rigBatchCost, maxAffordableRigQty, milestoneMultiplier, nextMilestone,
  totalYardRatePerSec, globalIncomeMult, rigEffectiveRatePerSec, rigTapPayout,
} from '../engine/formulas';
```

- [ ] **Step 2: Show the effective rate** — replace the `rig-sub` line (line 65):

```tsx
                <div class="rig-sub">{formatCredits(perUnit)}/s per unit · {rig.cycleSec}s cycle · ×{milestoneMultiplier(r.owned)} milestone</div>
```

with:

```tsx
                <div class="rig-sub">
                  {r.owned > 0
                    ? `${formatCredits(rigEffectiveRatePerSec(s, rig, t))}/s with ${r.owned} owned · ×${milestoneMultiplier(r.owned)} milestone${r.managed ? '' : ' · manual'}`
                    : `${formatCredits(perUnit)}/s per unit · ${rig.cycleSec}s cycle`}
                </div>
```

- [ ] **Step 3: Fix the tap hint** — replace the hint (line 95):

```tsx
                👆 Tap anywhere on this card to run a cycle by hand — +{formatCredits(rig.basePayout * r.owned * milestoneMultiplier(r.owned) * globalIncomeMult(s, t))}
```

with:

```tsx
                👆 Tap anywhere on this card to work it by hand — +{formatCredits(rigTapPayout(s, rig, t))}/tap
```

(`globalIncomeMult` stays imported — the rate banner at line 36 still uses it.)

- [ ] **Step 4: Verify**

Run: `npm run typecheck` — Expected: exits 0.
Run: `npm test` — Expected: PASS.
Optional visual check: `npm run dev`, open the YARD tab — owned rigs show `₡X/s with N owned`, tap hint shows the small per-tap number.

- [ ] **Step 5: Commit**

```bash
git add src/components/YardScreen.tsx
git commit -m "feat: show effective rig earning rate and correct tap hint in Yard

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `runSeed` — new procedural roll every collapse

Store a per-run seed and XOR it into every procedural-generation seed. Legacy saves backfill `runSeed = 0`, and `X ^ 0 === X`, so their generated content is unchanged. Prestige creates a fresh state → fresh seed → new goods/routes automatically.

**Files:**
- Modify: `src/engine/state.ts` (field + `newRunSeed` + wave pre-churn)
- Modify: `src/engine/sectorgen.ts` (seed params on all four generators)
- Modify: `src/engine/pricing.ts` (thread seed, memoize bias tables)
- Modify: `src/engine/actions.ts` (bootGame backfill; `payGateToll` call site)
- Modify: `src/engine/save.ts` (import backfill)
- Modify: `src/app.tsx`, `src/components/MapScreen.tsx` (`dressStationForSector` call sites)
- Test: `src/engine/__tests__/runseed.test.ts`

**Interfaces:**
- Produces: `GameState.runSeed: number` (0 = legacy sentinel; new runs get a random nonzero uint32).
- Produces: `newRunSeed(): number` exported from `state.ts`.
- New signatures (all existing callers updated in this task):
  - `sectorSeed(sector: number, runSeed: number): number`
  - `generateSectorGoods(sector: number, runSeed: number): Good[]`
  - `dressStationForSector(baseStationId: string, sector: number, runSeed: number): SectorStationDressing`
  - `generateSectorBias(stationIds: string[], goods: Good[], sector: number, runSeed: number): Record<string, Record<string, number>>`
  - `goodById(goodId: string, runSeed?: number): Good | undefined` (defaults to the live store's seed)
  - `biasFor(stationId: string, good: Good, runSeed?: number): number`
- Consumed by: Task 4 (sector-1 run routes).

- [ ] **Step 1: Write failing tests** — create `src/engine/__tests__/runseed.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sectorSeed, generateSectorGoods, generateSectorBias } from '../sectorgen';
import { hashSeed } from '../rng';
import { createInitialState, newRunSeed, allStationIds } from '../state';
import { store } from '../store';
import { goodById } from '../pricing';

describe('runSeed', () => {
  it('seed 0 is the legacy seed (identity XOR)', () => {
    expect(sectorSeed(2, 0)).toBe(hashSeed('junkrun-sector-2'));
    expect(sectorSeed(3, 0)).toBe(hashSeed('junkrun-sector-3'));
  });

  it('same seed → identical goods; different seed → different catalog', () => {
    const a1 = generateSectorGoods(2, 12345);
    const a2 = generateSectorGoods(2, 12345);
    const b = generateSectorGoods(2, 99999);
    expect(a1).toEqual(a2);
    expect(JSON.stringify(a1)).not.toBe(JSON.stringify(b));
    // ids never change — cargo/waves are keyed by them
    expect(a1.map((g) => g.id)).toEqual(['s2_g0', 's2_g1', 's2_g2', 's2_g3']);
    expect(b.map((g) => g.id)).toEqual(['s2_g0', 's2_g1', 's2_g2', 's2_g3']);
  });

  it('bias tables differ per run seed', () => {
    const goods = generateSectorGoods(2, 0);
    const t0 = generateSectorBias(allStationIds(), goods, 2, 0);
    const t1 = generateSectorBias(allStationIds(), goods, 2, 424242);
    expect(JSON.stringify(t0)).not.toBe(JSON.stringify(t1));
  });

  it('fresh states get a nonzero runSeed; goodById follows the store seed', () => {
    expect(newRunSeed()).toBeGreaterThan(0);
    const s = createInitialState();
    expect(s.runSeed).toBeGreaterThan(0);
    s.maxSectorReached = 2;
    store.value = s;
    const expected = generateSectorGoods(2, s.runSeed)[1];
    expect(goodById('s2_g1')).toEqual(expected);
  });

  it('fresh waves are pre-churned, not flat', () => {
    const s = createInitialState();
    const flat = Object.values(s.waves).every((w) => w.value === 1);
    expect(flat).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL (wrong arity on `sectorSeed`, missing `newRunSeed`, flat waves).

- [ ] **Step 3: `src/engine/state.ts`** — three edits:

3a. Extend the imports at the top of the file:

```ts
import { STATIONS } from '../config/stations';
import { GOODS } from '../config/goods';
import { RIGS } from '../config/rigs';
import type { ActiveMarketEvent, WaveState } from './price';
import { initWave, fastForwardWave } from './price';
import { mulberry32, hashSeed } from './rng';
import type { QuestKind, QuestSize } from '../config/types';
import { SCHEMA_VERSION } from './save';
```

3b. In `interface GameState`, after the line `questIdSeq: number;` add:

```ts
  /** Per-run seed for procedural goods/routes. 0 = legacy save (pre-seed behavior). */
  runSeed: number;
```

3c. Replace this exact block (the `createInitialState` head through its `waves` loop):

```ts
export function createInitialState(): GameState {
  const now = Date.now();
  const waves: Record<string, WaveState> = {};
  for (const g of GOODS) waves[g.id] = initWave();
```

with (note the new `newRunSeed` function is added immediately *before* `createInitialState`):

```ts
export function newRunSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}

export function createInitialState(): GameState {
  const now = Date.now();
  const runSeed = newRunSeed();
  const waves: Record<string, WaveState> = {};
  for (const g of GOODS) {
    const w = initWave();
    // Pre-churn so a new run's market opens mid-motion instead of perfectly flat.
    const rng = mulberry32((hashSeed(g.id) ^ runSeed) >>> 0);
    fastForwardWave(w, g.volatility, 8 + Math.floor(rng() * 8), rng);
    waves[g.id] = w;
  }
```

and in the returned object literal, after `questIdSeq: 1,` add:

```ts
    runSeed,
```

- [ ] **Step 4: `src/engine/sectorgen.ts`** — thread the seed. Replace the four function heads:

```ts
export function sectorSeed(sector: number, runSeed: number): number {
  return (hashSeed(`junkrun-sector-${sector}`) ^ (runSeed >>> 0)) >>> 0;
}

/** 4 new goods introduced when entering `sector` (sector >= 2), one per tier band. */
export function generateSectorGoods(sector: number, runSeed: number): Good[] {
  const rng = mulberry32(sectorSeed(sector, runSeed));
```

(the body of `generateSectorGoods` is otherwise unchanged), and:

```ts
export function dressStationForSector(baseStationId: string, sector: number, runSeed: number): SectorStationDressing {
  if (sector <= 1) return { name: '', hueShift: 0 };
  const rng = mulberry32((hashSeed(`${baseStationId}-sector-${sector}`) ^ (runSeed >>> 0)) >>> 0);
```

and:

```ts
export function generateSectorBias(stationIds: string[], goods: Good[], sector: number, runSeed: number): Record<string, Record<string, number>> {
  const rng = mulberry32((hashSeed(`bias-sector-${sector}`) ^ (runSeed >>> 0)) >>> 0);
```

(bodies otherwise unchanged in this task — Task 5 adjusts the bias ranges).

- [ ] **Step 5: `src/engine/pricing.ts`** — thread + memoize. Replace the file's top section (imports through `biasFor`, currently lines 1-26) with:

```ts
import type { Good } from '../config/types';
import { GOODS, GOODS_BY_ID } from '../config/goods';
import { stationBias, STATIONS } from '../config/stations';
import { generateSectorGoods, generateSectorBias } from './sectorgen';
import { allStationIds } from './state';
import type { GameState } from './state';
import { getState } from './store';
import { computePrice, eventMultiplier, type ActiveMarketEvent } from './price';
import { now } from './time';

const sectorGoodRe = /^s(\d+)_g(\d+)/;

/** The live run's seed; 0 for legacy saves (which keeps all legacy output identical). */
function activeRunSeed(): number {
  return getState().runSeed ?? 0;
}

const goodsCache = new Map<string, Good[]>();
function sectorGoodsCached(sector: number, runSeed: number): Good[] {
  const key = `${sector}:${runSeed}`;
  let goods = goodsCache.get(key);
  if (!goods) {
    goods = generateSectorGoods(sector, runSeed);
    goodsCache.set(key, goods);
  }
  return goods;
}

const biasCache = new Map<string, Record<string, Record<string, number>>>();
function sectorBiasTable(sector: number, runSeed: number): Record<string, Record<string, number>> {
  const key = `${sector}:${runSeed}`;
  let table = biasCache.get(key);
  if (!table) {
    table = generateSectorBias(allStationIds(), sectorGoodsCached(sector, runSeed), sector, runSeed);
    biasCache.set(key, table);
  }
  return table;
}

export function goodById(goodId: string, runSeed = activeRunSeed()): Good | undefined {
  if (GOODS_BY_ID[goodId]) return GOODS_BY_ID[goodId];
  const m = sectorGoodRe.exec(goodId);
  if (!m) return undefined;
  const sector = parseInt(m[1], 10);
  return sectorGoodsCached(sector, runSeed).find((g) => g.id === goodId);
}

export function biasFor(stationId: string, good: Good, runSeed = activeRunSeed()): number {
  if (GOODS_BY_ID[good.id]) return stationBias(stationId, good.id);
  const m = sectorGoodRe.exec(good.id);
  const sector = m ? parseInt(m[1], 10) : 2;
  return sectorBiasTable(sector, runSeed)[stationId]?.[good.id] ?? 1;
}
```

Then update the two remaining in-file users of the old signatures:
- in `getPrice`, replace `const bias = biasFor(stationId, good);` with `const bias = biasFor(stationId, good, state.runSeed ?? 0);`
- in `goodsCatalogForState`, replace the loop body with `for (let s = 2; s <= state.maxSectorReached; s++) list.push(...sectorGoodsCached(s, state.runSeed ?? 0));`

- [ ] **Step 6: call sites** —

6a. `src/engine/actions.ts`, in `bootGame`, extend the merged-state literal (the one that spreads `...loaded`) with a backfill line:

```ts
  let state: GameState = {
    ...loaded,
    settings: { ...fresh.settings, ...loaded.settings },
    stats: { ...fresh.stats, ...loaded.stats },
    runSeed: typeof loaded.runSeed === 'number' ? loaded.runSeed : 0,
  };
```

6b. `src/engine/actions.ts`, in `payGateToll`, replace `const newGoods = generateSectorGoods(dest);` with `const newGoods = generateSectorGoods(dest, s.runSeed ?? 0);`

6c. `src/engine/save.ts`, in `importSaveCode`, before the `return parsed as GameState;` line add:

```ts
  if (typeof (parsed as Record<string, unknown>).runSeed !== 'number') {
    (parsed as Record<string, unknown>).runSeed = 0;
  }
```

6d. `src/app.tsx` line 56: `const dressing = dressStationForSector(s.currentStation, s.sector, s.runSeed ?? 0);`

6e. `src/components/MapScreen.tsx` line 75: `const dressing = dressStationForSector(st.id, s.sector, s.runSeed ?? 0);` and line 111: `const dressing = st ? dressStationForSector(st.id, s.sector, s.runSeed ?? 0) : null;`

- [ ] **Step 7: Verify**

Run: `npm test` — Expected: PASS (all files).
Run: `npm run typecheck` — Expected: exits 0. If it reports any *other* forgotten `generateSectorGoods`/`dressStationForSector`/`sectorSeed` call site, fix it by passing `s.runSeed ?? 0` from the nearest `GameState`.

- [ ] **Step 8: Commit**

```bash
git add src/engine/state.ts src/engine/sectorgen.ts src/engine/pricing.ts src/engine/actions.ts src/engine/save.ts src/app.tsx src/components/MapScreen.tsx src/engine/__tests__/runseed.test.ts
git commit -m "feat: per-run seed re-rolls procedural goods, routes and waves on collapse

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Sector-1 routes re-roll per run

Sector 1's routes are hand-authored config, so they were identical every run even with Task 3. Generate a per-run sector-1 bias table with the same exporter/importer archetype. Exceptions: **The Signal** keeps its hand-authored flat ×1.10 (it only stocks tier-4+ goods), and **scrap_metal** keeps the tutorial route pinned (Rust Harbor exports @0.55, Neon Bazaar imports @1.45) so Onboarding steps 1–3 ("buy scrap at Rust Harbor, sell at Neon Bazaar for profit") stay true. Legacy saves (`runSeed === 0`) keep the hand-authored matrix untouched.

**Files:**
- Modify: `src/engine/pricing.ts` (`biasFor` + new cached table)
- Test: `src/engine/__tests__/runroutes.test.ts`

**Interfaces:**
- Consumes: `generateSectorBias` (Task 3 signature), `biasCache` (Task 3).
- Produces: `biasFor` now returns run-rolled values for sector-1 goods when `runSeed !== 0`.

- [ ] **Step 1: Write failing tests** — create `src/engine/__tests__/runroutes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { biasFor } from '../pricing';
import { GOODS, GOODS_BY_ID } from '../../config/goods';
import { STATIONS, stationBias } from '../../config/stations';

const S1_STATIONS = STATIONS.filter((s) => s.id !== 'the_signal').map((s) => s.id);

describe('per-run sector-1 routes', () => {
  it('runSeed 0 keeps the hand-authored matrix', () => {
    for (const g of GOODS.slice(0, 6)) {
      for (const st of S1_STATIONS) {
        expect(biasFor(st, g, 0)).toBe(stationBias(st, g.id));
      }
    }
  });

  it('a nonzero seed re-rolls routes deterministically', () => {
    const g = GOODS_BY_ID['coolant'];
    const a = S1_STATIONS.map((st) => biasFor(st, g, 777));
    const b = S1_STATIONS.map((st) => biasFor(st, g, 777));
    const c = S1_STATIONS.map((st) => biasFor(st, g, 778));
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('every good keeps the archetype: at least one exporter station', () => {
    // range covers both the pre-Task-5 (0.55-0.7) and post-Task-5 (0.50-0.65)
    // exporter rolls, so this test is order-independent
    for (const g of GOODS) {
      const vals = S1_STATIONS.map((st) => biasFor(st, g, 424242));
      const exporters = vals.filter((v) => v >= 0.5 && v <= 0.7);
      expect(exporters.length).toBeGreaterThanOrEqual(1);
      for (const v of vals) expect(v).toBeLessThanOrEqual(1.85);
    }
  });

  it('the tutorial scrap route is pinned', () => {
    const scrap = GOODS_BY_ID['scrap_metal'];
    expect(biasFor('rust_harbor', scrap, 31337)).toBe(0.55);
    expect(biasFor('neon_bazaar', scrap, 31337)).toBe(1.45);
  });

  it('The Signal keeps hand-authored bias regardless of seed', () => {
    const g = GOODS_BY_ID['warp_cells'];
    expect(biasFor('the_signal', g, 31337)).toBe(stationBias('the_signal', g.id));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test` — Expected: exactly **two** of the new tests FAIL — the re-roll test (seeds 777 and 778 return identical hand-authored arrays) and the tutorial-pin test (`neon_bazaar`/`scrap_metal` is 1.0, not 1.45). The seed-0, exporter-archetype, and The Signal tests already pass against the hand-authored matrix (it satisfies the archetype: one bias in [0.5, 0.7] per good, max 1.7 ≤ 1.85) — those three passing here is expected, not a problem. Proceed to Step 3.

- [ ] **Step 3: Implement in `src/engine/pricing.ts`** — add below `sectorBiasTable`:

```ts
/** Per-run re-roll of the hand-authored sector-1 route matrix (same archetype:
 *  one exporter, ~40% importers). The Signal is excluded — it keeps its flat
 *  hand-authored 1.10 — and the tutorial scrap route is pinned so Onboarding
 *  steps 1-3 stay true on every run. */
function runBiasTableS1(runSeed: number): Record<string, Record<string, number>> {
  const key = `s1:${runSeed}`;
  let table = biasCache.get(key);
  if (!table) {
    const ids = STATIONS.filter((s) => s.id !== 'the_signal').map((s) => s.id);
    table = generateSectorBias(ids, GOODS, 1, runSeed);
    table['rust_harbor']['scrap_metal'] = 0.55;
    table['neon_bazaar']['scrap_metal'] = 1.45;
    biasCache.set(key, table);
  }
  return table;
}
```

Then replace the sector-1 branch of `biasFor`:

```ts
export function biasFor(stationId: string, good: Good, runSeed = activeRunSeed()): number {
  if (GOODS_BY_ID[good.id]) {
    if (runSeed === 0 || stationId === 'the_signal') return stationBias(stationId, good.id);
    return runBiasTableS1(runSeed)[stationId]?.[good.id] ?? stationBias(stationId, good.id);
  }
  const m = sectorGoodRe.exec(good.id);
  const sector = m ? parseInt(m[1], 10) : 2;
  return sectorBiasTable(sector, runSeed)[stationId]?.[good.id] ?? 1;
}
```

> Note: the exporter test range `[0.5, 0.7]` deliberately spans both the current (`0.55–0.7`) and the Task 5 (`0.50–0.65`) roll ranges, so this suite passes whether Task 5 has landed yet or not.

- [ ] **Step 4: Verify**

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/pricing.ts src/engine/__tests__/runroutes.test.ts
git commit -m "feat: sector-1 trade routes re-roll every run (tutorial route pinned)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Trading buff constants (sim-verified)

Raise trade margins, cargo scaling, fuel cadence, streak payoff and spike ceiling — the exact values the balance sim validated.

**Files:**
- Modify: `src/engine/sectorgen.ts` (`generateSectorBias` ranges)
- Modify: `src/engine/actions.ts` (hot-streak multiplier)
- Modify: `src/engine/derived.ts` (`maxHold`, `fuelRegenSec`)
- Modify: `src/engine/state.ts` (`BASE_FUEL_REGEN_SEC`)
- Modify: `src/config/ship.ts` (cargo hold + fuel recycler labels/growth)
- Modify: `src/config/events.ts` (demand spike ceiling)
- Test: `src/engine/__tests__/tuning.test.ts`

- [ ] **Step 1: Write failing tests** — create `src/engine/__tests__/tuning.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialState, BASE_FUEL_REGEN_SEC } from '../state';
import { maxHold, fuelRegenSec } from '../derived';
import { MARKET_EVENTS_BY_ID } from '../../config/events';
import { SHIP_UPGRADES_BY_ID, upgradeCost } from '../../config/ship';

describe('trading tuning constants', () => {
  it('cargo hold gives +3 per level', () => {
    const s = createInitialState();
    s.shipUpgrades['cargo_hold'] = 4;
    expect(maxHold(s)).toBe(10 + 4 * 3);
  });

  it('cargo hold cost growth is 1.65', () => {
    const def = SHIP_UPGRADES_BY_ID['cargo_hold'];
    expect(upgradeCost(def, 0)).toBe(800);
    expect(upgradeCost(def, 1)).toBe(Math.round(800 * 1.65));
  });

  it('fuel regen: base 75s, -7s/level, floor 40s', () => {
    expect(BASE_FUEL_REGEN_SEC).toBe(75);
    const s = createInitialState();
    expect(fuelRegenSec(s)).toBe(75);
    s.shipUpgrades['fuel_recycler'] = 5;
    expect(fuelRegenSec(s)).toBe(40);
  });

  it('demand spike ceiling is ×6', () => {
    expect(MARKET_EVENTS_BY_ID['demand_spike'].maxMult).toBe(6);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` — Expected: all 4 FAIL.

- [ ] **Step 3: Apply the constants**

3a. `src/engine/sectorgen.ts`, in `generateSectorBias`, replace the inner loop body:

```ts
      if (st === exporter) {
        bias[st][good.id] = randRange(rng, 0.50, 0.65);
      } else if (chance(rng, 0.4)) {
        bias[st][good.id] = randRange(rng, 1.35, 1.85);
      } else {
        bias[st][good.id] = randRange(rng, 0.9, 1.1);
      }
```

3b. `src/engine/actions.ts`, in `sellGood`, replace

```ts
  const streakMult = 1 + Math.min(streakActive ? state.hotStreak.count : 0, 5) * 0.08;
```

with

```ts
  const streakMult = 1 + Math.min(streakActive ? state.hotStreak.count : 0, 5) * 0.10;
```

3c. `src/engine/state.ts`: `export const BASE_FUEL_REGEN_SEC = 75;` (was 90).

3d. `src/engine/derived.ts`, `maxHold`: change `cargoLevel * 2` to `cargoLevel * 3`. `fuelRegenSec`: replace the return with `return Math.max(40, BASE_FUEL_REGEN_SEC - lvl * 7);`

3e. `src/config/ship.ts`:
- `cargo_hold`: `effectLabel: (lvl) => `+${lvl * 3} hold (currently +${lvl * 3})``, `costGrowth: 1.65` (baseCost stays 800).
- `fuel_recycler`: `effectLabel: (lvl) => `Regen ${Math.max(40, 75 - lvl * 7)}s / pip``.

3f. `src/config/events.ts`, `demand_spike`: `maxMult: 6` (minMult stays 3).

- [ ] **Step 4: Verify** — `npm test` PASS; `npm run typecheck` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/sectorgen.ts src/engine/actions.ts src/engine/state.ts src/engine/derived.ts src/config/ship.ts src/config/events.ts src/engine/__tests__/tuning.test.ts
git commit -m "balance: widen trade margins, bigger holds, faster fuel, hotter streaks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Yard sector parity

Trade prices scale ×8 per sector (`sectorScale`); rigs don't, so the trade:rig ratio explodes after Sector 2. Give yard income the same ×8^(sector−1) so the balance is sector-invariant — the gate becomes a big power-up for both systems.

**Files:**
- Modify: `src/engine/formulas.ts` (`globalIncomeMult`)
- Test: append to `src/engine/__tests__/rigs.test.ts`

- [ ] **Step 1: Write failing test** — append to `src/engine/__tests__/rigs.test.ts` (inside the top-level `describe` or as a new one):

```ts
import { globalIncomeMult } from '../formulas'; // merge into the existing import from '../formulas'

describe('yard sector parity', () => {
  it('yard income scales ×8 per sector like trade prices', () => {
    const s = createInitialState();
    const t = Date.now();
    const base = globalIncomeMult(s, t);
    s.sector = 2;
    expect(globalIncomeMult(s, t)).toBeCloseTo(base * 8, 6);
    s.sector = 3;
    expect(globalIncomeMult(s, t)).toBeCloseTo(base * 64, 6);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` — Expected: FAIL (×1 vs ×8).

- [ ] **Step 3: Implement** — in `src/engine/formulas.ts`, add to the imports:

```ts
import { sectorScale } from './price';
```

and replace `globalIncomeMult`:

```ts
export function globalIncomeMult(state: GameState, atTime: number): number {
  const dmMult = 1 + 0.02 * state.darkMatter;
  const rankMult = 1 + 0.01 * Math.max(0, state.rank - 30);
  const codexMult = codexBonusMult(state);
  const ghostFreq = state.codex.jackpots['ghost_frequency'] ? 1.005 : 1;
  const boost = boostActive(state, atTime) ? 2 : 1;
  // Sector parity: trade prices scale ×8 per sector (sectorScale); the Yard gets the
  // same multiplier so active vs idle balance holds in every sector.
  return dmMult * rankMult * codexMult * ghostFreq * boost * sectorScale(state.sector);
}
```

(This automatically flows into rig rates, taps, offline earnings and the YardScreen "×N global" banner — all of them route through `globalIncomeMult`.)

- [ ] **Step 4: Verify** — `npm test` PASS; `npm run typecheck` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/formulas.ts src/engine/__tests__/rigs.test.ts
git commit -m "balance: yard income gains sector parity (×8 per sector, matching trade)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: XP rebalance — Rank 20 in an evening, not never

`saleXp` exponent 0.35 → **0.42**, and quest XP scales with rank (`× (1 + 0.10·rank)`) so quest-driven/idle-leaning players still rank. Sim: optimal-play R20 ≈ 0.9h (≈ 3–5h realistic); a full-hold optimal sale covers a meaningful slice of every rank through 25+.

**Files:**
- Modify: `src/config/ranks.ts` (`saleXp`)
- Modify: `src/engine/quests.ts` (`generateQuest` reward XP)
- Test: `src/engine/__tests__/xp.test.ts`

- [ ] **Step 1: Write failing tests** — create `src/engine/__tests__/xp.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { saleXp, xpToNext } from '../../config/ranks';
import { generateQuest } from '../quests';
import { createInitialState } from '../state';
import { mulberry32 } from '../rng';

describe('xp rebalance', () => {
  it('saleXp uses exponent 0.42', () => {
    expect(saleXp(1000)).toBe(Math.ceil(3 * Math.pow(1000, 0.42))); // 55
    expect(saleXp(1_000_000)).toBe(Math.ceil(3 * Math.pow(1_000_000, 0.42)));
    expect(saleXp(0)).toBe(1);
    expect(saleXp(-5)).toBe(1);
  });

  it('xpToNext curve is unchanged', () => {
    expect(xpToNext(13)).toBe(Math.round(12 * Math.pow(13, 1.8)));
  });

  it('quest XP scales with rank', () => {
    const low = createInitialState(); // rank 1
    const high = createInitialState();
    high.rank = 20;
    // same rng seed → same template & base roll; only the rank multiplier differs
    const qLow = generateQuest('medium', low, mulberry32(7), 1);
    const qHigh = generateQuest('medium', high, mulberry32(7), 1);
    expect(qHigh.rewardXp).toBeGreaterThan(qLow.rewardXp * 2); // (1+2.0)/(1+0.1) ≈ 2.7×
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` — Expected: saleXp + quest tests FAIL.

- [ ] **Step 3: Implement**

3a. `src/config/ranks.ts`, replace `saleXp`:

```ts
export function saleXp(profit: number): number {
  if (profit <= 0) return 1;
  return Math.max(1, Math.ceil(3 * Math.pow(profit, 0.42)));
}
```

3b. `src/engine/quests.ts`, in `generateQuest`, replace

```ts
  const rewardXp = randInt(rng, xMin, xMax);
```

with

```ts
  // Scale with rank so quests stay a real XP source deep into the game
  const rewardXp = Math.round(randInt(rng, xMin, xMax) * (1 + 0.10 * state.rank));
```

> Caveat for the quest test: `generateQuest` consumes rng in a fixed order and rank 1 vs rank 20 states have different unlocked-goods lists, which can shift `pick(rng, unlockedGoods)` results — but `rewardXp`'s `randInt` draw happens after the same number of draws in both calls only if the template picked is the same kind. With seed `mulberry32(7)` the template choice is identical (same first draw) and goal-related draws differ in *values*, not *count*, for every medium template, so the comparison is stable. If the assertion ever fails after an unrelated template change, compare `qHigh.rewardXp / qLow.rewardXp` for the same state ranks 1 vs 20 with goods lists forced equal by setting `high.rank = 20; high.xp = 0` only (do not add goods).

- [ ] **Step 4: Verify** — `npm test` PASS; `npm run typecheck` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/config/ranks.ts src/engine/quests.ts src/engine/__tests__/xp.test.ts
git commit -m "balance: saleXp exponent 0.42 + rank-scaled quest XP so R20+ is reachable

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Active time played stat

Accumulate foreground play time in `stats.activePlayMs`, survive prestige, show it on the MORE tab.

**Files:**
- Modify: `src/engine/state.ts` (stats field)
- Modify: `src/engine/actions.ts` (`tick()` accumulation; prestige carry-over)
- Modify: `src/components/MoreScreen.tsx` (stat tile)
- Test: `src/engine/__tests__/activetime.test.ts`

**Interfaces:**
- Produces: `GameState['stats'].activePlayMs: number` (lifetime, carried across prestige). Legacy-save backfill to 0 happens via the `stats: { ...fresh.stats, ...loaded.stats }` fresh-defaults merge — which already exists in `bootGame`, but must ALSO be added to `importSave` in this task (Step 3e), because the save-code import path assigns the decoded state directly to the store and bypasses `bootGame` entirely.

- [ ] **Step 1: Write failing tests** — create `src/engine/__tests__/activetime.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';
import { store } from '../store';
import { tick, importSave } from '../actions';

describe('active play time', () => {
  it('accumulates elapsed foreground time on tick', () => {
    const s = createInitialState();
    s.lastSeen = Date.now() - 1000;
    store.value = s;
    tick();
    expect(store.value.stats.activePlayMs).toBeGreaterThanOrEqual(900);
    expect(store.value.stats.activePlayMs).toBeLessThanOrEqual(2500);
  });

  it('ignores long gaps (app was closed / device slept)', () => {
    const s = createInitialState();
    s.lastSeen = Date.now() - 60_000;
    store.value = s;
    tick();
    expect(store.value.stats.activePlayMs).toBe(0);
  });

  it('importing a pre-update save code backfills activePlayMs (no NaN)', () => {
    const legacy = createInitialState() as Record<string, unknown>;
    delete (legacy.stats as Record<string, unknown>).activePlayMs;
    delete legacy.runSeed;
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(legacy))));
    const res = importSave(code);
    expect(res.ok).toBe(true);
    expect(store.value.stats.activePlayMs).toBe(0);
    store.value = { ...store.value, lastSeen: Date.now() - 1000 };
    tick();
    expect(Number.isFinite(store.value.stats.activePlayMs)).toBe(true);
    expect(store.value.stats.activePlayMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` — Expected: FAIL (`activePlayMs` undefined / type error). If TypeScript blocks the test compile, that is the expected failure — proceed.

- [ ] **Step 3: Implement**

3a. `src/engine/state.ts` — in `GameState`, replace the `stats` block:

```ts
  stats: {
    totalJumps: number; totalSales: number; totalTaps: number; totalPrestiges: number;
    goodsSold: Record<string, number>; goodsBought: Record<string, number>;
    creditsSpent: number; creditsEarned: number;
    activePlayMs: number;
  };
```

and in `createInitialState`'s returned literal, replace the `stats` value:

```ts
    stats: {
      totalJumps: 0, totalSales: 0, totalTaps: 0, totalPrestiges: 0,
      goodsSold: {}, goodsBought: {}, creditsSpent: 0, creditsEarned: 0,
      activePlayMs: 0,
    },
```

3b. `src/engine/actions.ts` — replace the entire `tick()` function (the exported function itself, not just its `setState` callback) with:

```ts
export function tick(): void {
  const t = now();
  setState((s) => {
    let state = s;
    // Active play time: count small foreground gaps only (the 250ms clock while the
    // app is open); anything >5s means we were backgrounded/closed, and hidden tabs
    // don't count even if a throttled interval fires.
    const dt = t - state.lastSeen;
    const visible = typeof document === 'undefined' || !document.hidden;
    if (dt > 0 && dt <= 5000 && visible) {
      state = { ...state, stats: { ...state.stats, activePlayMs: state.stats.activePlayMs + dt } };
    }
    state = settleIdleIncome(state, t);
    state = regenFuelState(state, t);
    state = processMarketPulses(state, t);
    state = maybeSpawnAmbientEvent(state, t);
    state = expireTimers(state, t);
    state = { ...state, lastSeen: t };
    return state;
  });
}
```

3c. `src/engine/actions.ts` — in `prestige()`, the merged state's `stats` line currently reads:

```ts
      stats: { ...fresh.stats, totalPrestiges: s.stats.totalPrestiges + 1 },
```

Replace with (active time is lifetime, it survives the collapse):

```ts
      stats: { ...fresh.stats, totalPrestiges: s.stats.totalPrestiges + 1, activePlayMs: s.stats.activePlayMs },
```

3d. `src/components/MoreScreen.tsx` — in the Stats `bests-grid`, right after the "Wormhole Runs" tile (line 178), add:

```tsx
          <div class="best-tile"><div class="bt-label">Active Time</div><div class="bt-val mono">{formatDuration(s.stats.activePlayMs)}</div></div>
```

(`formatDuration` is already imported in this file.)

3e. `src/engine/actions.ts` — the save-code import path bypasses `bootGame`, so a pre-update save code would load with `stats.activePlayMs` undefined and the first tick would turn it into `NaN`. Route imports through the same fresh-defaults merge `bootGame` uses — replace the entire `importSave` function with:

```ts
export function importSave(code: string): { ok: boolean; reason?: string } {
  try {
    const loaded = importSaveCode(code);
    // Same defensive merge as bootGame: saves from before a field existed
    // (activePlayMs, musicVolume, …) must backfill defaults, and this path
    // never goes through bootGame.
    const fresh = createInitialState();
    const merged: GameState = {
      ...loaded,
      settings: { ...fresh.settings, ...loaded.settings },
      stats: { ...fresh.stats, ...loaded.stats },
    };
    store.value = merged;
    writeSave(merged);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Invalid save code.' };
  }
}
```

(`createInitialState`, `store`, and `writeSave` are already imported in `actions.ts`. Task 3's `runSeed` backfill inside `importSaveCode` still stands — `runSeed` is a top-level field the merge doesn't cover.)

- [ ] **Step 4: Verify** — `npm test` PASS; `npm run typecheck` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/state.ts src/engine/actions.ts src/components/MoreScreen.tsx src/engine/__tests__/activetime.test.ts
git commit -m "feat: track and display active time played

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Balance sim script with PASS/FAIL targets

Ship the tuning model as `scripts/balance-sim.mjs` so the balance targets are executable. It mirrors repo constants (header comment lists which); it asserts the mid-game trade:rig band and rank pacing.

**Files:**
- Create: `scripts/balance-sim.mjs`
- Modify: `package.json` (`"balance"` script)

- [ ] **Step 1: Create `scripts/balance-sim.mjs`** with exactly:

```js
// JUNKRUN balance sim — executable tuning targets.
// Mirrors (keep in sync by hand when tuning):
//   config/rigs.ts (ladder), engine/formulas.ts (milestones), config/goods.ts
//   (trade ladder), engine/sectorgen.ts bias ranges, engine/derived.ts
//   (hold/fuel), config/ranks.ts (xp), engine/quests.ts (quest xp), price.ts
//   sectorScale, formulas.ts gateToll/sectorUnlockRank + yard sector parity.
// Model: an optimal-play active trader vs a tap+manager rig player, compared
// at equal lifetime earnings. Realistic play is ~3-5× slower than "optimal".

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
  { unlockRank: 1, base: 35 }, { unlockRank: 3, base: 150 }, { unlockRank: 6, base: 900 },
  { unlockRank: 9, base: 6500 }, { unlockRank: 10, base: 9000 }, { unlockRank: 15, base: 45000 },
  { unlockRank: 17, base: 90000 }, { unlockRank: 19, base: 140000 }, { unlockRank: 22, base: 500000 },
  { unlockRank: 24, base: 900000 }, { unlockRank: 26, base: 1500000 }, { unlockRank: 28, base: 2500000 },
];
const bestGood = (rank) => { let b = GOODS[0]; for (const g of GOODS) if (g.unlockRank <= rank) b = g; return b; };
const sectorScale = (s) => Math.pow(8, s - 1);
const gateToll = (d) => 2_000_000 * Math.pow(15, d - 2);
const sectorUnlockRank = (d) => 20 + (d - 2) * 10;
const xpToNext = (lvl) => Math.round(12 * Math.pow(lvl, 1.8));

// Tuning under test — MUST match the repo constants:
const P = {
  tapsPerSec: 2,                       // human speed-tapping assumption
  exporterMid: 0.575, importerMid: 1.60, // midpoints of 0.50-0.65 / 1.35-1.85
  holdBase: 10, holdPerLevel: 3, cargoBaseCost: 800, cargoGrowth: 1.65,
  fuelRegenBase: 75, fuelRegenPerLvl: 7, fuelRegenFloor: 40,
  recyclerBase: 5000, recyclerGrowth: 3, recyclerMax: 5,
  streakStep: 0.10, streakCap: 5,
  saleXpExp: 0.42, saleXpCoef: 3, questXpRankCoef: 0.10,
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
  let credits = 500, lifetime = 0, rank = 1, xp = 0, sector = 1, cargoLvl = 0, recyclerLvl = 0, t = 0, questTimer = 0;
  const samples = new Map(); const rankHit = {};
  const HANDLING = 25;
  while (t < hours * 3600) {
    const hold = P.holdBase + cargoLvl * P.holdPerLevel;
    const regen = Math.max(P.fuelRegenFloor, P.fuelRegenBase - recyclerLvl * P.fuelRegenPerLvl);
    const loopSec = 2 * regen + HANDLING;
    const good = bestGood(rank), scale = sectorScale(sector);
    const buyPrice = good.base * scale * P.exporterMid;
    const qty = Math.min(hold, Math.floor((credits * 0.9) / buyPrice));
    const streakMult = 1 + Math.min(4, P.streakCap) * P.streakStep;
    const sellPrice = good.base * scale * P.importerMid * streakMult;
    const profit = Math.max(0, qty * (sellPrice - buyPrice));
    credits += profit; lifetime += profit;
    xp += profit > 0 ? Math.max(1, Math.ceil(P.saleXpCoef * Math.pow(profit, P.saleXpExp))) : 1;
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
    const toll = gateToll(sector + 1);
    if (rank >= sectorUnlockRank(sector + 1) && credits > toll * 1.5) { credits -= toll; sector++; }
    const rate = profit / loopSec;
    t += loopSec;
    for (const cp of checkpoints) if (!samples.has(cp) && lifetime >= cp) samples.set(cp, { rate, rank, sector, hold });
  }
  return { samples, rankHit };
}

const CHECKPOINTS = [1e4, 1e5, 1e6, 1e7];
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

// Targets: trading crosses rigs in the mid-game (₡1M→₡10M) and stays in band;
// rank 20 lands within ~an evening of realistic play (3-5× optimal hours).
const checks = [
  ['ratio @ 1e6 in [0.35, 1.25]', ratios[1e6] >= 0.35 && ratios[1e6] <= 1.25],
  ['ratio @ 1e7 in [0.90, 1.75]', ratios[1e7] >= 0.90 && ratios[1e7] <= 1.75],
  ['R13 not trivial (>= 0.35h optimal)', (rankHit[13] ?? 99) >= 0.35],
  ['R20 reachable (<= 1.2h optimal)', (rankHit[20] ?? 99) <= 1.2],
  ['R25 reachable (<= 1.5h optimal)', (rankHit[25] ?? 99) <= 1.5],
];
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Add the npm script** — in `package.json` scripts, after `"test"`, add:

```json
    "balance": "node scripts/balance-sim.mjs"
```

- [ ] **Step 3: Run it**

Run: `npm run balance`
Expected output ends with five `PASS` lines and exit code 0 (observed during planning: ratio@1e6 ≈ 0.50, ratio@1e7 ≈ 1.30, R13 ≈ 0.7h, R20 ≈ 0.9h, R25 ≈ 1.0h).

- [ ] **Step 4: Commit**

```bash
git add scripts/balance-sim.mjs package.json
git commit -m "test: executable balance targets (trade vs rig band, rank pacing)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Chiptune station music

Replace the single-voice ambience sequencer in `src/engine/audio.ts` with a three-voice chiptune engine — lead, bass, drums (noise hats + sine kick) — with 32-step lead patterns over 16-step bass/drum bars, per-station tempo. Keeps: the sustained bed, `startAmbience`/`stopAmbience`/suspend-resume contract, motif-derived scales (each station still sounds like itself), zero files.

**Files:**
- Modify: `src/engine/audio.ts` only.

**Interfaces:**
- `startAmbience(key, motif, type)`, `stopAmbience()`, `suspendForBackground()`, `resumeFromBackground()` keep their exact signatures. `AMBIENCE_PATTERNS` keys stay the 7 `Ambience` values.

- [ ] **Step 1: Extend `NoiseOpts` and `noise()` to accept a bus** — drums must route to `musicBus`, not `sfxGain`. Replace the `NoiseOpts` interface with:

```ts
interface NoiseOpts {
  gain?: number;
  delay?: number;
  filterType?: BiquadFilterType;
  filterFreq?: number;
  filterFreqEnd?: number;
  filterQ?: number;
  bus?: GainNode | null;
}
```

and in `noise()`, replace the guard + final connect:

```ts
  private noise(dur: number, opts: NoiseOpts = {}): void {
    const ctx = this.ctx;
    const bus = opts.bus ?? this.sfxGain;
    if (!ctx || !bus || !this.noiseBuffer) return;
```

…(body unchanged)… and at the end replace `g.connect(this.sfxGain);` with `g.connect(bus);`.

- [ ] **Step 2: Replace `AmbiencePattern` + `AMBIENCE_PATTERNS`** (lines 33-60) with the chiptune pattern set. `lead` is 32 sixteenth-steps (2 bars), `bass`/`kick`/`hat` are 16-step bars (bass degrees play an octave down; `null` = rest). Degrees index the 10-degree scale from `buildScale`.

```ts
interface AmbiencePattern {
  bpm: number;                    // sixteenth-note sequencer: stepMs = 15000 / bpm
  leadWave: OscillatorType;
  lead: (number | null)[];        // 32 steps (2 bars) of scale-degree indices
  bass: (number | null)[];        // 16 steps, played one octave down
  kick: number[];                 // step indices 0-15 with a kick thump
  hat: number[];                  // step indices 0-15 with a noise tick
  leadGain: number; bassGain: number; drumGain: number;
  noteDur: number; bassDur: number;
  bedGain: number; bedWave: OscillatorType;
  shimmer?: boolean;              // quiet octave-up partial on lead notes
  detuneJitter?: number;          // ± cents random detune per lead note
}

const AMBIENCE_PATTERNS: Record<Ambience, AmbiencePattern> = {
  // Rust Harbor — industrial groove: gritty low riff, driving kick.
  thrum: {
    bpm: 92, leadWave: 'square',
    lead: [0, null, 0, null, 2, null, 0, null, 3, null, 2, null, 0, null, 1, null,
           0, null, 0, null, 2, null, 4, null, 3, null, 2, null, 1, null, 0, null],
    bass: [0, null, null, 0, null, null, 0, null, 0, null, null, 0, null, null, 2, null],
    kick: [0, 4, 8, 12], hat: [2, 6, 10, 14],
    leadGain: 0.055, bassGain: 0.07, drumGain: 0.05, noteDur: 0.16, bassDur: 0.24,
    bedGain: 0.09, bedWave: 'sawtooth',
  },
  // Neon Bazaar — bright market bounce: fast poppy hook, busy hats.
  plink: {
    bpm: 128, leadWave: 'square',
    lead: [4, null, 2, 4, null, 5, 4, null, 2, null, 1, 2, null, 4, null, null,
           5, null, 4, 5, null, 7, 5, null, 4, null, 2, 4, null, 1, null, null],
    bass: [0, null, 0, null, 3, null, 3, null, 4, null, 4, null, 3, null, 0, null],
    kick: [0, 8], hat: [0, 2, 4, 6, 8, 10, 12, 14],
    leadGain: 0.05, bassGain: 0.06, drumGain: 0.04, noteDur: 0.11, bassDur: 0.18,
    bedGain: 0.04, bedWave: 'sine',
  },
  // Frostdock — icy and spacious: sparse bell lead, slow pulse.
  bell: {
    bpm: 70, leadWave: 'sine',
    lead: [0, null, null, null, 4, null, null, null, null, null, 2, null, null, null, null, null,
           5, null, null, null, 4, null, null, null, null, null, 7, null, null, null, null, null],
    bass: [0, null, null, null, null, null, null, null, 2, null, null, null, null, null, null, null],
    kick: [0], hat: [8],
    leadGain: 0.09, bassGain: 0.05, drumGain: 0.02, noteDur: 0.9, bassDur: 1.4,
    bedGain: 0.04, bedWave: 'sine', shimmer: true,
  },
  // The Greenhouse — organic drift: legato triangle melody, brushed hats.
  pad: {
    bpm: 80, leadWave: 'triangle',
    lead: [0, null, null, null, 2, null, null, null, 4, null, null, null, 2, null, null, null,
           5, null, null, null, 4, null, null, null, 2, null, null, null, 1, null, null, null],
    bass: [0, null, null, null, null, null, null, null, 3, null, null, null, null, null, null, null],
    kick: [], hat: [4, 12],
    leadGain: 0.06, bassGain: 0.06, drumGain: 0.02, noteDur: 0.7, bassDur: 1.6,
    bedGain: 0.11, bedWave: 'sine',
  },
  // Ember Works — the forge: hammering saw riff, four-on-the-floor.
  stab: {
    bpm: 100, leadWave: 'sawtooth',
    lead: [0, 0, null, 0, null, 2, null, null, 0, 0, null, 3, null, 2, null, null,
           0, 0, null, 0, null, 4, null, null, 5, null, 4, null, 2, null, 0, null],
    bass: [0, null, 0, null, 0, null, 0, null, 0, null, 0, null, 2, null, 2, null],
    kick: [0, 4, 8, 12], hat: [2, 6, 10, 14],
    leadGain: 0.06, bassGain: 0.07, drumGain: 0.055, noteDur: 0.12, bassDur: 0.16,
    bedGain: 0.07, bedWave: 'sawtooth',
  },
  // Halo Court — opulent sparkle: fast up-down arpeggio, glittery hats.
  arp: {
    bpm: 140, leadWave: 'triangle',
    lead: [0, 2, 4, 7, 4, 2, 0, 2, 4, 7, 9, 7, 4, 2, 0, null,
           1, 2, 5, 7, 5, 2, 1, 2, 5, 7, 9, 7, 5, 2, 1, null],
    bass: [0, null, null, null, 4, null, null, null, 5, null, null, null, 4, null, null, null],
    kick: [0, 8], hat: [0, 2, 4, 6, 8, 10, 12, 14],
    leadGain: 0.045, bassGain: 0.055, drumGain: 0.03, noteDur: 0.1, bassDur: 0.5,
    bedGain: 0.04, bedWave: 'sine', shimmer: true,
  },
  // The Signal — eerie broadcast: sparse detuned phrase over a heavy drone.
  drone: {
    bpm: 60, leadWave: 'sine',
    lead: [0, null, null, null, null, null, 3, null, null, null, 1, null, null, null, null, null,
           null, null, 0, null, null, null, 6, null, null, null, null, null, 3, null, null, null],
    bass: [0, null, null, null, null, null, null, null, null, null, null, null, 1, null, null, null],
    kick: [0], hat: [],
    leadGain: 0.07, bassGain: 0.06, drumGain: 0.03, noteDur: 1.2, bassDur: 2.2,
    bedGain: 0.13, bedWave: 'sawtooth', detuneJitter: 18,
  },
};
```

- [ ] **Step 3: Widen the scale** — replace `buildScale` (its `degrees` constant) so 10 degrees exist (patterns use up to index 9):

```ts
function buildScale(motif: number[]): number[] {
  const base = motif && motif.length ? motif : [220, 277];
  const degrees = 10;
  const scale: number[] = [];
  for (let i = 0; i < degrees; i++) {
    const octave = Math.floor(i / base.length);
    scale.push(base[i % base.length] * Math.pow(2, octave));
  }
  return scale;
}
```

- [ ] **Step 4: Replace the sequencer inside `startAmbience`** — keep everything up to and including the bed setup (`o1.start(); o2.start(); this.ambienceOsc = [o1, o2]; this.ambienceEnv = env;`), then replace the trailing sequencer block (from `// The actual tune: …` through the final `this.ambienceTimer = window.setTimeout(...)`) with:

```ts
    // Three-voice chiptune sequencer with lookahead scheduling: notes are placed on
    // an absolute AudioContext timeline (drift-free), the JS timer only wakes up to
    // top up the schedule. 32-step lead over 16-step bass/drum bars.
    const stepSec = 15 / cfg.bpm; // sixteenth note
    let step = 0;
    let nextStepTime = ctx.currentTime + 0.1;
    const scheduleStep = () => {
      const c = this.ctx;
      if (!c) return;
      while (nextStepTime < c.currentTime + 0.2) {
        const delay = Math.max(0, nextStepTime - c.currentTime);
        const bar = step % 16;
        const leadDeg = cfg.lead[step % cfg.lead.length];
        if (leadDeg !== null && leadDeg !== undefined) {
          const detune = cfg.detuneJitter ? (Math.random() * 2 - 1) * cfg.detuneJitter : 0;
          const freq = scale[Math.min(leadDeg, scale.length - 1)];
          this.tone(freq, cfg.noteDur, { type: cfg.leadWave, gain: cfg.leadGain, delay, detuneCents: detune, bus: this.musicBus });
          if (cfg.shimmer) {
            this.tone(freq * 2, cfg.noteDur * 0.6, { type: 'sine', gain: cfg.leadGain * 0.35, delay: delay + 0.02, bus: this.musicBus });
          }
        }
        const bassDeg = cfg.bass[bar];
        if (bassDeg !== null && bassDeg !== undefined) {
          this.tone(scale[Math.min(bassDeg, scale.length - 1)] / 2, cfg.bassDur, { type: 'triangle', gain: cfg.bassGain, delay, bus: this.musicBus });
        }
        if (cfg.kick.includes(bar)) {
          // kick: fast sine drop 120→45 Hz
          this.tone(45, 0.12, { type: 'sine', startFreq: 120, gain: cfg.drumGain * 2.2, delay, bus: this.musicBus });
        }
        if (cfg.hat.includes(bar)) {
          this.noise(0.03, { gain: cfg.drumGain, filterType: 'highpass', filterFreq: 8000, delay, bus: this.musicBus });
        }
        step++;
        nextStepTime += stepSec;
      }
      this.ambienceTimer = window.setTimeout(scheduleStep, stepSec * 500); // ~half a step, in ms
    };
    scheduleStep();
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck` — Expected: exits 0. (`tone` already supports `delay`/`bus`; `noise` gained `bus` in Step 1.)
Run: `npm test` — Expected: PASS (audio has no unit tests; suite must not regress).
Manual check: `npm run dev` → tap LAUNCH (unlocks audio) → each station plays a looping multi-voice tune; jumping stations changes the tune; backgrounding the tab silences it; returning resumes it.

- [ ] **Step 6: Commit**

```bash
git add src/engine/audio.ts
git commit -m "feat: three-voice chiptune station music with lookahead scheduling

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Expanded SFX palette

New distinct sounds for moments that today reuse `buy`/`quest_claim` or are silent, plus profit-scaled sell pitch.

**Files:**
- Modify: `src/engine/bus.ts` (SfxId union)
- Modify: `src/engine/audio.ts` (recipes)
- Modify: `src/engine/actions.ts` (emit sites)

**Interfaces:**
- New `SfxId` values: `'upgrade' | 'manager_hire' | 'milestone' | 'daily_claim' | 'boost' | 'encounter_good' | 'encounter_bad'`.
- `sellGood` now emits `{ type: 'sfx', id: 'sell', data: <profit magnitude 0-8> }`.

- [ ] **Step 1: `src/engine/bus.ts`** — replace the `SfxId` union:

```ts
export type SfxId =
  | 'tap' | 'buy' | 'sell' | 'lucky_flip' | 'streak_up' | 'streak_break'
  | 'rank_up' | 'quest_claim' | 'jump' | 'arrival' | 'event_card'
  | 'jackpot' | 'coin_cascade' | 'cant_afford' | 'wormhole' | 'toll'
  | 'upgrade' | 'manager_hire' | 'milestone' | 'daily_claim' | 'boost'
  | 'encounter_good' | 'encounter_bad';
```

- [ ] **Step 2: `src/engine/audio.ts`** — in the `play()` switch:

2a. Replace the `'sell'` case (profit-scaled pitch: `evt.data` is a 0–8 magnitude bucket):

```ts
      case 'sell': {
        const mag = Math.min(8, Math.max(0, evt.data ?? 2)); // log10 profit bucket
        const shift = Math.pow(SEMITONE, (mag - 2) * 2);     // ±2 semitones per decade around ₡100
        this.tone(659.25 * shift, 0.12, { gain: 0.22 });
        this.tone(783.99 * shift, 0.12, { gain: 0.18, delay: 0.02 });
        this.noise(0.05, { gain: 0.1, filterType: 'highpass', filterFreq: 4000 });
        if (mag >= 5) this.tone(1046.5 * shift, 0.14, { gain: 0.16, delay: 0.05 }); // big-sale sparkle
        break;
      }
```

2b. Add new cases before the closing brace of the switch:

```ts
      case 'upgrade':
        [392, 523.25, 659.25].forEach((f, i) => this.tone(f, 0.1, { type: 'triangle', gain: 0.18, delay: i * 0.06 }));
        this.noise(0.12, { gain: 0.06, filterType: 'highpass', filterFreq: 6000, delay: 0.18 });
        break;
      case 'manager_hire':
        this.tone(261.63, 0.14, { type: 'triangle', gain: 0.2 });
        this.tone(329.63, 0.14, { type: 'triangle', gain: 0.2, delay: 0.1 });
        this.tone(392, 0.2, { type: 'triangle', gain: 0.22, delay: 0.2 });
        break;
      case 'milestone':
        this.tone(523.25, 0.1, { type: 'square', gain: 0.16 });
        this.tone(659.25, 0.1, { type: 'square', gain: 0.16, delay: 0.08 });
        this.tone(1046.5, 0.18, { type: 'square', gain: 0.18, delay: 0.16 });
        this.noise(0.25, { gain: 0.08, filterType: 'highpass', filterFreq: 7000, delay: 0.16 });
        break;
      case 'daily_claim':
        [523.25, 659.25, 880].forEach((f, i) => this.tone(f, 0.12, { gain: 0.2, delay: i * 0.07 }));
        break;
      case 'boost':
        this.tone(880, 0.5, { type: 'sawtooth', startFreq: 220, gain: 0.15 });
        this.noise(0.4, { gain: 0.1, filterType: 'bandpass', filterFreq: 800, filterFreqEnd: 4000 });
        break;
      case 'encounter_good':
        this.tone(523.25, 0.1, { gain: 0.18 });
        this.tone(659.25, 0.14, { gain: 0.2, delay: 0.09 });
        break;
      case 'encounter_bad':
        this.tone(196, 0.25, { type: 'sawtooth', startFreq: 260, gain: 0.16 });
        this.tone(130.81, 0.3, { type: 'sawtooth', gain: 0.12, delay: 0.12 });
        break;
```

- [ ] **Step 3: Wire the emits in `src/engine/actions.ts`**

3a. `sellGood` — replace the plain sell emit:

```ts
  } else {
    emit({ type: 'sfx', id: 'sell' });
  }
```

with

```ts
  } else {
    emit({ type: 'sfx', id: 'sell', data: Math.max(0, Math.floor(Math.log10(Math.max(1, profit)))) });
  }
```

3b. `buyRig` — detect milestone crossings. Replace the two emit lines at the end (`emit({ type: 'sfx', id: 'buy' }); emit({ type: 'haptic', pattern: 'tap' });`) with:

```ts
  if (milestoneMultiplier(owned + buyQty) > milestoneMultiplier(owned)) {
    emit({ type: 'sfx', id: 'milestone' });
    emit({ type: 'confetti', power: 'small' });
    emit({ type: 'toast', text: `${rig.name} hit a milestone — output doubled!`, icon: rig.icon });
  } else {
    emit({ type: 'sfx', id: 'buy' });
  }
  emit({ type: 'haptic', pattern: 'tap' });
```

3c. `hireManager` — change its `emit({ type: 'sfx', id: 'buy' });` to `emit({ type: 'sfx', id: 'manager_hire' });`

3d. `buyShipUpgrade` — change its `emit({ type: 'sfx', id: 'buy' });` to `emit({ type: 'sfx', id: 'upgrade' });`

3e. `claimDailyStreak` — change its `emit({ type: 'sfx', id: 'quest_claim' });` to `emit({ type: 'sfx', id: 'daily_claim' });`

3f. `useBoostToken` — change its `emit({ type: 'sfx', id: 'buy' });` to `emit({ type: 'sfx', id: 'boost' });`

3g. `buyRelic` — change its `emit({ type: 'sfx', id: 'buy' });` to `emit({ type: 'sfx', id: 'upgrade' });`

3h. `resolveEncounter` — outcome stingers. At the top of the function body (right after `let resultText = '';`) add:

```ts
  let outcome = 'neutral' as 'good' | 'bad' | 'neutral';
```

(The `as`-cast form is required, not style: with a plain `let outcome: 'good' | 'bad' | 'neutral' = 'neutral';` annotation, strict tsc narrows `outcome` to `'neutral'` after the initializer and does **not** widen it for assignments made inside the `setState` callback, so the final ternary comparison fails typecheck with TS2367. The cast keeps the read type as the full union.)

Then set it in each branch, immediately wherever `resultText` is assigned (every assignment listed — apply all):
- `pirate_toll`: `pay` → `outcome = 'bad';` · `run` success → `outcome = 'good';` · `run` fail → `outcome = 'bad';`
- `derelict`: `board` success → `outcome = 'good';` (both qty>0 and hold-full texts) · `board` fail → `outcome = 'bad';` · `flypast` → leave `'neutral'`
- `wandering_trader`: deal executed (`Bought N× …`) → `outcome = 'good';` · "changed my mind" / pass → `'neutral'`
- `customs_scan`: `payfine` → `outcome = 'bad';` · `bribe` backfired → `outcome = 'bad';`, not backfired → `outcome = 'good';` · `jettison` → `outcome = 'bad';`
- `distress_call`: `respond` success (all three reward rolls) → `outcome = 'good';` · "It was a recording" → `'neutral'` · ignore → `'neutral'`
- `rich_collector`: sold (`owned > 0`) → `outcome = 'good';` · else `'neutral'`
- `stowaway`: `hunt` → `outcome = 'good';` · `ignoreit` → `outcome = 'bad';`

Because `outcome` is written inside the `setState` updater and read after it, declare it in the outer function scope (next to `resultText`), using the `as`-cast declaration shown above. Finally replace the closing emit:

```ts
  emit({ type: 'sfx', id: 'event_card' });
```

with

```ts
  emit({ type: 'sfx', id: outcome === 'good' ? 'encounter_good' : outcome === 'bad' ? 'encounter_bad' : 'event_card' });
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck` — Expected: exits 0 (the SfxId union catches any typo'd id).
Run: `npm test` — Expected: PASS.
Manual check: `npm run dev` — buy a rig to a milestone (10 owned) → fanfare + toast; hire a manager → rising triad; big sale sounds brighter than a small one.

- [ ] **Step 5: Commit**

```bash
git add src/engine/bus.ts src/engine/audio.ts src/engine/actions.ts
git commit -m "feat: expanded SFX palette — milestones, managers, upgrades, encounter stingers, profit-scaled sells

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full gate**

```bash
npm run typecheck && npm test && npm run balance && npm run build
```

Expected: all four succeed. (`build` runs `tsc -b --noEmit && vite build`.)

- [ ] **Step 2: Save-compat spot check** — `npm run dev`, then in the browser console:

```js
// simulate a legacy save: strip the new fields, reload
const s = JSON.parse(localStorage.getItem('junkrun_save_v1') ?? 'null');
if (s) { delete s.runSeed; delete s.stats.activePlayMs; localStorage.setItem('junkrun_save_v1', JSON.stringify(s)); location.reload(); }
```

Expected after reload: no console errors; MORE tab shows `Active Time 0:00` counting up; market prices unchanged from the hand-authored matrix (legacy `runSeed 0`).

Then check the **import path** too: EXPORT SAVE CODE on the MORE tab, edit the decoded JSON to delete `runSeed` and `stats.activePlayMs` (`JSON.parse(decodeURIComponent(escape(atob(code))))` → delete fields → re-encode with `btoa(unescape(encodeURIComponent(JSON.stringify(s))))`), IMPORT it — Active Time must show `0:00` counting up, never `NaN`.

- [ ] **Step 3: Collapse re-roll check** — in the console: `localStorage.removeItem('junkrun_save_v1'); location.reload();` then note 2–3 goods' prices per station, and run in console a second fresh reset — the cheap/expensive stations for those goods should differ between the two runs (scrap metal stays cheap at Rust Harbor both times).

- [ ] **Step 4: Merge/PR** — stop here and report; the human decides whether to merge `balance-audio-pass`.

---

## Self-review notes (already applied)

- Spec coverage: collapse seed variety (Tasks 3–4), tap = 1s (Task 1), rig rate display (Task 2), trading ≤ ~1.25× on average with dopamine ceiling (Tasks 5, 6, 9), T20 reachable (Task 7), active time stat (Task 8), music + SFX expansion (Tasks 10–11).
- Type consistency: `rigEffectiveRatePerSec(state, rig, atTime)` is defined in Task 1 and consumed with that exact signature in Task 2; `generateSectorBias(stationIds, goods, sector, runSeed)` defined in Task 3, consumed in Task 4; `SfxId` additions in Task 11 Step 1 match every emit in Step 3.
- Known accepted trade-offs: legacy saves keep hand-authored sector-1 routes until their next collapse (by design — `runSeed 0` sentinel); `bestRoute`/Market-Scanner-III automatically respects run-rolled bias because it goes through `getPrice` → `biasFor`.
