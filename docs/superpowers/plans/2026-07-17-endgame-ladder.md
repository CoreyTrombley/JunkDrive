# JUNKRUN Endgame Ladder Implementation Plan (Sector 99)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sector 99 a Diablo-2-level-99-style monument: tapered sector scaling, Gate Resonance charges earned in-sector, normalized rank XP, a hard S99 cap with celebration + legacy-save clamping, and seeded per-band good icons.

**Architecture:** All ladder math lives in `formulas.ts`/`price.ts` (pure, tested); resonance is one state field mutated at three earn sites and consumed by `payGateToll`; UI changes are confined to the gate panel + HUD ticker; legacy clamping rides the existing three save-load backfill sites. The balance sim gains a ladder section with hard PASS/FAIL pacing gates.

**Tech Stack:** unchanged (Preact, strict TS, vitest, Node sim).

**Spec:** `docs/superpowers/specs/2026-07-17-endgame-ladder-design.md`.

## Global Constraints

- Sim-verified constants — copy verbatim, never re-tune: `sectorScale(s) = 8^(min(s,10)−1) × 1.6^max(0,s−10)`; `gateToll(d) = 2,000,000 × 15^(min(d,10)−2) × 1.5^max(0,d−10)`; `resonanceNeeded(d) = d ≤ 10 ? 0 : ceil(6 × 1.062^(d−10))`; resonance earns **+1** flip with `profit / sectorScale(sector) ≥ 2000`, **+3** manifest delivery, **+1** salvage claim; `SECTOR_CAP = 99`; `saleXp` normalized by `sectorScale(sector)` at the CALL SITES (ranks.ts stays pure).
- **Sectors 1–10 must be numerically identical to v2.1** (scale, tolls, rank gates) — several tests pin this.
- All five existing balance-sim gates must keep passing with byte-identical values; the sim only GAINS a ladder section.
- Save-compat: `gateResonance` backfills at bootGame + importSave + importSaveCode; sector>99 saves clamp (sector, maxSectorReached, bests.deepestSector) in BOTH load paths and receive the `rim_walker` + `beyond_the_rim` codex badges. The procedural-goods legacy rng-stream snapshot (mass.test.ts) must not change — the icon roll uses its own side rng.
- Badges must NOT enter the random jackpot arrival pool (`JACKPOTS` array feeds `rollArrival`) — they live in a separate `HONOR_BADGES` list merged only into `JACKPOTS_BY_ID` + the codex set.
- `npm run typecheck` exit 0 and `npm test` green after every task. No new runtime dependencies.
- Branch `endgame-ladder` (created in Task 1). Commits end with:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Current-code anchors (verified 2026-07-17, v2.1.0 main)

- `price.ts:62` `sectorScale` returns `Math.pow(8, sector - 1)`.
- `formulas.ts:98-104` `gateToll` = `2_000_000 * Math.pow(15, destinationSector - 2)`; `sectorUnlockRank` = `20 + (destinationSector - 2) * 10`.
- `ranks.ts:64-67` `saleXp(profit)` = `Math.max(1, Math.ceil(3 * Math.pow(profit, 0.42)))`.
- `actions.ts:467` `const gainedXp = profit > 0 ? saleXp(profit) : 1;` (inside `sellGood`, before its `setState`).
- `manifests.ts:59` `const rewardXp = Math.round(1.5 * saleXp(rewardCredits * 0.45));`
- `actions.ts:1239-1245` `canEnterNextSector` (rank check only) and `nextSectorToll`.
- `actions.ts:1247+` `payGateToll` — validates rank, gate-docking, toll; its `setState` returns a merge including `sector: dest`, waves init, bests.
- `WaypointPanel.tsx:80-91` gate branch (toll row or "The gate ignores you. Reach Rank N.").
- `sectorgen.ts:18` `const TIER_ICONS = ['🔩', '🔮', '🧬', '🛰️'];` used at `icon: TIER_ICONS[band]`.

---

### Task 1: Ladder math — tapered scaling, tapered tolls, resonance curve, cap

**Files:**
- Modify: `src/engine/price.ts` (`sectorScale` taper)
- Modify: `src/engine/formulas.ts` (`gateToll` taper, `sectorUnlockRank` past-10 rule, `SECTOR_CAP`, `resonanceNeeded`, `RESONANCE_FLIP_FLOOR`)
- Test: `src/engine/__tests__/ladder.test.ts`

**Interfaces:**
- Produces: `SECTOR_CAP = 99`, `resonanceNeeded(destinationSector: number): number`, `RESONANCE_FLIP_FLOOR = 2000` (all exported from formulas.ts). `sectorUnlockRank(d)` returns 0 for d > 10 (no rank gate — resonance is the gate).
- Consumed by Tasks 3-5.

- [ ] **Step 1: Write the failing test** — create `src/engine/__tests__/ladder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sectorScale } from '../price';
import { gateToll, sectorUnlockRank, resonanceNeeded, SECTOR_CAP, RESONANCE_FLIP_FLOOR } from '../formulas';

describe('endgame ladder math', () => {
  it('sector scale is unchanged through S10, then +60%/sector', () => {
    for (let s = 1; s <= 10; s++) expect(sectorScale(s)).toBe(Math.pow(8, s - 1));
    expect(sectorScale(11)).toBeCloseTo(Math.pow(8, 9) * 1.6, 4);
    expect(sectorScale(99)).toBeCloseTo(Math.pow(8, 9) * Math.pow(1.6, 89), -10);
    // readable endgame: S99 scale ~2e26, not 8^98 ~ 3e88
    expect(sectorScale(99)).toBeLessThan(1e27);
  });

  it('tolls are unchanged through S10, then grow slower than income (1.5 < 1.6)', () => {
    for (let d = 2; d <= 10; d++) expect(gateToll(d)).toBe(2_000_000 * Math.pow(15, d - 2));
    expect(gateToll(11)).toBeCloseTo(2_000_000 * Math.pow(15, 8) * 1.5, -2);
    expect(gateToll(99)).toBeCloseTo(2_000_000 * Math.pow(15, 8) * Math.pow(1.5, 89), -10);
  });

  it('rank gates end at S10; resonance is the gate beyond', () => {
    expect(sectorUnlockRank(2)).toBe(20);
    expect(sectorUnlockRank(10)).toBe(100);
    expect(sectorUnlockRank(11)).toBe(0);
    expect(sectorUnlockRank(99)).toBe(0);
  });

  it('resonance curve matches the sim-verified D2 ladder', () => {
    expect(resonanceNeeded(10)).toBe(0);
    expect(resonanceNeeded(11)).toBe(7);
    expect(resonanceNeeded(30)).toBe(Math.ceil(6 * Math.pow(1.062, 20)));
    expect(resonanceNeeded(50)).toBe(67);
    expect(resonanceNeeded(90)).toBe(Math.ceil(6 * Math.pow(1.062, 80))); // = 739
    expect(resonanceNeeded(99)).toBe(Math.ceil(6 * Math.pow(1.062, 89))); // ≈ 1269
  });

  it('constants', () => {
    expect(SECTOR_CAP).toBe(99);
    expect(RESONANCE_FLIP_FLOOR).toBe(2000);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/engine/__tests__/ladder.test.ts` — Expected: FAIL (missing exports; sectorScale(11) = 8^10).

- [ ] **Step 3: `src/engine/price.ts`** — replace `sectorScale`'s body:

```ts
export function sectorScale(sector: number): number {
  // Full ×8 jumps through S10, then +60%/sector — the D2-style taper that keeps
  // endgame numbers meaningful (S99 ≈ 2e26 instead of 8^98 ≈ 3e88). Spec 2026-07-17.
  return Math.pow(8, Math.min(sector, 10) - 1) * Math.pow(1.6, Math.max(0, sector - 10));
}
```

- [ ] **Step 4: `src/engine/formulas.ts`** — replace `gateToll` and `sectorUnlockRank`, and add the new exports below them:

```ts
export function gateToll(destinationSector: number): number {
  // Tapers with income past S10 (1.5 < 1.6): credits are the entry fee, resonance is the wall.
  return 2_000_000 * Math.pow(15, Math.min(destinationSector, 10) - 2) * Math.pow(1.5, Math.max(0, destinationSector - 10));
}

export function sectorUnlockRank(destinationSector: number): number {
  // Rank gates end at S10 — beyond that, Gate Resonance is the only gate.
  return destinationSector <= 10 ? 20 + (destinationSector - 2) * 10 : 0;
}

export const SECTOR_CAP = 99;

/** Sector-normalized profit a sale needs to earn +1 Gate Resonance. */
export const RESONANCE_FLIP_FLOOR = 2000;

/** Charges required to open the gate INTO `destinationSector` (D2-99 curve, sim variant G). */
export function resonanceNeeded(destinationSector: number): number {
  if (destinationSector <= 10) return 0;
  return Math.ceil(6 * Math.pow(1.062, destinationSector - 10));
}
```

- [ ] **Step 5: Verify** — focused test PASS; `npm test` green — **expect NO other failures**: sectors ≤ 10 are numerically identical, and no existing test exercises sector > 10 economics (travel/manifests tests run in sector 1). `npm run typecheck` exit 0. `npm run balance` still 5/5 (its model mirrors constants internally; Task 7 updates it).

- [ ] **Step 6: Create branch + commit**

```bash
git checkout -b endgame-ladder
git add src/engine/price.ts src/engine/formulas.ts src/engine/__tests__/ladder.test.ts
git commit -m "feat: D2-style ladder math — tapered scale/tolls, resonance curve, S99 cap

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Rank XP normalization

**Files:**
- Modify: `src/engine/actions.ts` (`sellGood` XP line), `src/engine/manifests.ts` (rewardXp)
- Test: `src/engine/__tests__/xpnorm.test.ts`

**Interfaces:**
- `saleXp` in ranks.ts is UNCHANGED (stays pure). Normalization happens at the two call sites by dividing profit by `sectorScale(sector)` first. Sector 1 is the identity (scale 1) — all existing XP tests keep passing.

- [ ] **Step 1: Write the failing test** — create `src/engine/__tests__/xpnorm.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';
import { generateManifest } from '../manifests';
import { goodById } from '../pricing';
import { saleXp } from '../../config/ranks';
import { sectorScale } from '../price';
import { mulberry32 } from '../rng';

describe('sector-normalized XP', () => {
  it('manifest XP is sector-invariant: same normalized value in S1 and S12', () => {
    const s1 = createInitialState();
    s1.rank = 8;
    s1.runSeed = 12345; // pin: createInitialState() randomizes runSeed per call
    const s12 = createInitialState();
    s12.rank = 8;
    s12.sector = 12;
    s12.runSeed = 12345; // same seed → same bias tables → deterministic comparison
    const m1 = generateManifest(s1, mulberry32(5), 1, 0);
    const m12 = generateManifest(s12, mulberry32(5), 1, 0);
    // reward scales with sectorScale; XP must NOT — both compute from normalized reward
    expect(m1.rewardXp).toBe(Math.round(1.5 * saleXp((m1.rewardCredits * 0.45) / sectorScale(1))));
    expect(m12.rewardXp).toBe(Math.round(1.5 * saleXp((m12.rewardCredits * 0.45) / sectorScale(12))));
    // and the normalized magnitudes are comparable (same seed → same goods/quantities)
    expect(m12.rewardXp).toBeLessThan(m1.rewardXp * 4); // NOT scaled by 8^11 ≈ 8.6e9
  });

  it('saleXp itself is untouched (sector-1 identity)', () => {
    expect(saleXp(1000)).toBe(Math.ceil(3 * Math.pow(1000, 0.42)));
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/engine/__tests__/xpnorm.test.ts` — Expected: the manifest test FAILS (rewardXp currently computed from raw rewardCredits, so the S12 expectation mismatches).

- [ ] **Step 3: `src/engine/actions.ts`** — in `sellGood`, the line

```ts
  const gainedXp = profit > 0 ? saleXp(profit) : 1;
```

becomes

```ts
  // XP measures play, not sector inflation — normalize by the sector's price scale.
  const gainedXp = profit > 0 ? saleXp(profit / sectorScale(state.sector)) : 1;
```

Add `sectorScale` to actions.ts's existing `./price` import (the one importing `pulseWave, fastForwardWave, PULSE_INTERVAL_MS, initWave`).

- [ ] **Step 4: `src/engine/manifests.ts`** — the line

```ts
  const rewardXp = Math.round(1.5 * saleXp(rewardCredits * 0.45));
```

becomes

```ts
  const rewardXp = Math.round(1.5 * saleXp((rewardCredits * 0.45) / sectorScale(state.sector)));
```

(`sectorScale` is already imported in manifests.ts.)

- [ ] **Step 4b: Companion — procedural good unlock ranks must not outpace normalized ranks.** Under normalization, rank reaches only ~127 at S99, but `sectorUnlockRankForGood` keeps demanding `20 + (sector−2)×10` (S50 goods → rank 500: locked forever). In `src/engine/sectorgen.ts`, replace `sectorUnlockRankForGood`:

```ts
function sectorUnlockRankForGood(sector: number, band: number): number {
  // The rank ladder for goods ends where the gate rank ladder ends (S10 → rank 100);
  // past S10 the real gate is REACHING the sector at all (goodsCatalogForState is
  // bounded by maxSectorReached). Without this cap, normalized ranks (~127 at S99)
  // could never unlock deep-sector goods.
  const sectorBaseRank = Math.min(20 + (sector - 2) * 10, 100);
  return sectorBaseRank + band * 2;
}
```

Add to `src/engine/__tests__/xpnorm.test.ts`:

```ts
  it('deep-sector procedural goods stay unlockable under normalized ranks', () => {
    const goods = generateSectorGoods(60, 12345);
    for (const g of goods) expect(g.unlockRank).toBeLessThanOrEqual(106); // 100 + band·2
  });
```

with `import { generateSectorGoods } from '../sectorgen';` added to the test's imports. (Save-compat: `unlockRank` is not part of the pinned identity snapshot — name/base/contraband — and the function is pure arithmetic, so the rng stream is untouched; existing sub-S10 goods are numerically unchanged since the cap only binds past S12.)

- [ ] **Step 5: Verify** — focused PASS; `npm test` green (existing xp.test.ts asserts `saleXp` directly and sector-1 behavior — unaffected); `npm run typecheck` exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/engine/actions.ts src/engine/manifests.ts src/engine/sectorgen.ts src/engine/__tests__/xpnorm.test.ts
git commit -m "feat: rank XP normalized by sector scale — ranks measure play, not inflation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Gate Resonance engine

**Files:**
- Modify: `src/engine/state.ts` (`gateResonance` field)
- Modify: `src/engine/actions.ts` (three earn sites; `payGateToll` requirement + reset; backfills)
- Modify: `src/engine/save.ts` (importSaveCode backfill)
- Test: `src/engine/__tests__/resonance.test.ts`

**Interfaces:**
- Produces: `GameState.gateResonance: number` (charges toward the NEXT gate; resets on sector entry; fresh/prestige states start at 0).
- Earn rules (Global Constraints): +1 qualifying flip, +3 manifest delivery, +1 salvage claim. A `+1 ⚡` floater fires only when `resonanceNeeded(sector + 1) > 0` (no noise in S1-S9).
- `payGateToll` refuses with reason `` `Gate uncharged — ${need - have} more resonance.` `` when short.
- Consumes: `resonanceNeeded`, `RESONANCE_FLIP_FLOOR`, `sectorScale` (Tasks 1-2).

- [ ] **Step 1: Write the failing test** — create `src/engine/__tests__/resonance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';
import { store } from '../store';
import { sellGood, deliverManifest, payGateToll } from '../actions';
import { generateSectorMap, nodeById } from '../mapgen';
import { generateManifest } from '../manifests';
import { sectorScale } from '../price';
import { resonanceNeeded, gateToll } from '../formulas';
import { mulberry32 } from '../rng';

describe('gate resonance', () => {
  it('fresh states start uncharged', () => {
    expect(createInitialState().gateResonance).toBe(0);
  });

  it('a big MOVED flip earns +1; penny flips and wash-trades earn none', () => {
    const s = createInitialState();
    s.rank = 10;
    s.cargo = {
      neutrino_lenses: { qty: 20, avgCost: 1, srcStation: 'frostdock' }, // bought elsewhere → qualifies
      warp_cells: { qty: 20, avgCost: 1, srcStation: s.currentStation }, // WASH TRADE: bought here → never earns
      scrap_metal: { qty: 1, avgCost: 9.99 },                            // penny flip → below the floor
    };
    store.value = s;
    expect(sellGood('neutrino_lenses', 20).ok).toBe(true);
    expect(store.value.gateResonance).toBe(1);
    expect(sellGood('warp_cells', 20).ok).toBe(true);
    expect(store.value.gateResonance).toBe(1); // wash trade earned nothing despite big profit
    expect(sellGood('scrap_metal', 1).ok).toBe(true);
    expect(store.value.gateResonance).toBe(1);
  });

  it('manifest delivery earns +3', () => {
    const s = createInitialState();
    s.rank = 8;
    const m = generateManifest(s, mulberry32(4), 1, Date.now() + 1);
    m.expiresAt = Date.now() + 10 * 60_000;
    s.manifests = [m];
    s.currentStation = m.stationId;
    const cargo: typeof s.cargo = {};
    for (const it of m.items) cargo[it.goodId] = { qty: it.qty, avgCost: 1 };
    s.cargo = cargo;
    store.value = s;
    expect(deliverManifest(m.id).ok).toBe(true);
    expect(store.value.gateResonance).toBe(3);
  });

  it('manifest bought AT the delivery door earns no resonance', () => {
    const s = createInitialState();
    s.rank = 8;
    const m = generateManifest(s, mulberry32(4), 1, Date.now() + 1);
    m.expiresAt = Date.now() + 10 * 60_000;
    s.manifests = [m];
    s.currentStation = m.stationId;
    const cargo: typeof s.cargo = {};
    for (const it of m.items) cargo[it.goodId] = { qty: it.qty, avgCost: 1, srcStation: m.stationId };
    s.cargo = cargo;
    store.value = s;
    expect(deliverManifest(m.id).ok).toBe(true); // delivery still pays credits/XP
    expect(store.value.gateResonance).toBe(0);   // ...but charges require moved goods
  });

  it('an uncharged gate refuses past S10; a charged one opens and resets', () => {
    const s = createInitialState();
    s.runSeed = 12345;
    s.sector = 11;
    s.rank = 150;
    s.credits = gateToll(12) * 2;
    const map = generateSectorMap(11, s.runSeed);
    s.currentStation = map.nodes.find((n) => n.kind === 'gate')!.id;
    s.gateResonance = 0;
    store.value = s;
    const refused = payGateToll();
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain('uncharged');
    store.value = { ...store.value, gateResonance: resonanceNeeded(12) };
    expect(payGateToll().ok).toBe(true);
    expect(store.value.sector).toBe(12);
    expect(store.value.gateResonance).toBe(0); // reset on entry
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/engine/__tests__/resonance.test.ts` — Expected: FAIL (field missing / no gating). A TS compile failure on the missing field IS the expected RED.

- [ ] **Step 3: State fields** — `src/engine/state.ts`:

3i. In `GameState` after `visitedBeacons`, add:

```ts
  /** Gate Resonance charges toward the NEXT sector's gate; earned in-sector, resets on entry. */
  gateResonance: number;
```

and `gateResonance: 0,` in `createInitialState`'s literal (after `visitedBeacons: [],`).

3ii. In `interface CargoEntry`, add an optional provenance field (ANTI-EXPLOIT — resonance only rewards goods that MOVED; wash-trading buy-sell at one station must earn nothing):

```ts
  /** Node the good was last bought/looted at (most-recent-acquisition-wins). Optional — legacy saves lack it. */
  srcStation?: string;
```

No backfill needed anywhere: the field is optional, and `undefined` reads as "origin unknown" which SAFELY earns resonance (legacy cargo can't wash-trade retroactively).

- [ ] **Step 4: Earn sites in `src/engine/actions.ts`** — add `resonanceNeeded, RESONANCE_FLIP_FLOOR, SECTOR_CAP` to the existing `./formulas` import. Then:

4a-pre. Provenance plumbing in `src/engine/actions.ts` — the `addCargo` helper gains an optional source param. Its head

```ts
function addCargo(cargo: Record<string, CargoEntry>, goodId: string, qty: number, atCost: number): Record<string, CargoEntry> {
```

becomes

```ts
function addCargo(cargo: Record<string, CargoEntry>, goodId: string, qty: number, atCost: number, srcStation?: string): Record<string, CargoEntry> {
```

and its returned entry merge gains the field (most-recent-acquisition-wins):

```ts
  return { ...cargo, [goodId]: { qty: newQty, avgCost: newAvg, srcStation: srcStation ?? existing.srcStation } };
```

Then two call sites pass their location: `buyGood`'s `cargo: addCargo(s.cargo, goodId, buyQty, price)` becomes `cargo: addCargo(s.cargo, goodId, buyQty, price, s.currentStation)`, and `claimSalvage`'s `cargo: addCargo(s.cargo, good.id, qty, 0)` becomes `cargo: addCargo(s.cargo, good.id, qty, 0, s.currentStation)`. All OTHER addCargo callers (encounters, motherlode, trader gifts, petty salvage) stay as-is — loot without provenance sells for resonance anywhere, which is fine.

4a. `sellGood` — inside its `setState`, immediately after the `st = stampCodex(st, 'goods', goodId);` line, add (note the provenance guard — selling where you bought earns NOTHING):

```ts
    if (profit / sectorScale(s.sector) >= RESONANCE_FLIP_FLOOR && entry.srcStation !== s.currentStation) {
      st = { ...st, gateResonance: st.gateResonance + 1 };
      if (s.sector < SECTOR_CAP && resonanceNeeded(s.sector + 1) > 0) emit({ type: 'floater', text: '+1 ⚡', kind: 'info' });
    }
```

(`entry` is `sellGood`'s existing cargo-entry binding, captured before the setState.)

4b. `deliverManifest` — inside its `setState`, immediately after the big `let st: GameState = { ... };` literal, add (ANTI-EXPLOIT: buying the items AT the delivery door earns no resonance — every item must have been sourced elsewhere):

```ts
    const itemsMoved = m.items.every((it) => s.cargo[it.goodId]?.srcStation !== m.stationId);
    if (itemsMoved) {
      st = { ...st, gateResonance: st.gateResonance + 3 };
      if (s.sector < SECTOR_CAP && resonanceNeeded(s.sector + 1) > 0) emit({ type: 'floater', text: '+3 ⚡', kind: 'info' });
    }
```

4c. `claimSalvage` — its `setState` currently merges `cargo` and `lastSalvageAt`; add `gateResonance: s.gateResonance + 1,` to that merge object.

4d. `payGateToll` — after the gate-docking check and before the toll check, add:

```ts
  const need = resonanceNeeded(dest);
  if (state.gateResonance < need) {
    return { ok: false, reason: `Gate uncharged — ${need - state.gateResonance} more resonance.` };
  }
```

and add `gateResonance: 0,` to its `setState` return merge (next to `sector: dest`).

4e. Backfills — `bootGame` merged literal and `importSave` merged literal each gain:

```ts
    gateResonance: (loaded as Partial<GameState>).gateResonance ?? 0,
    pendingRimClamp: (loaded as Partial<GameState>).pendingRimClamp ?? false,
```

(in importSave the casts are just `loaded.gateResonance ?? 0` / `loaded.pendingRimClamp ?? false`), and `src/engine/save.ts` `importSaveCode` gains, next to the other backfills:

```ts
  if (typeof (parsed as Record<string, unknown>).gateResonance !== 'number') (parsed as Record<string, unknown>).gateResonance = 0;
  if (typeof (parsed as Record<string, unknown>).pendingRimClamp !== 'boolean') (parsed as Record<string, unknown>).pendingRimClamp = false;
```

Also add the field to `GameState` in `src/engine/state.ts` (next to `gateResonance`):

```ts
  /** One-shot flag: a >S99 legacy save was clamped on load; App shows the monument moment once. */
  pendingRimClamp: boolean;
```

with `pendingRimClamp: false,` in `createInitialState` — Task 5's clamps set it true, and Task 5 wires the one-time celebration.

- [ ] **Step 5: Verify** — focused PASS; `npm test` green; `npm run typecheck` exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/engine/state.ts src/engine/actions.ts src/engine/save.ts src/engine/__tests__/resonance.test.ts
git commit -m "feat: Gate Resonance — in-sector charges gate every sector past S10

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Gate panel + HUD resonance UI

**Files:**
- Modify: `src/components/WaypointPanel.tsx` (gate branch rewrite)
- Modify: `src/components/Hud.tsx` (charged-gate ticker)

**Interfaces:**
- Consumes: `SECTOR_CAP`, `resonanceNeeded`, `sectorUnlockRank` (Task 1), `state.gateResonance` (Task 3), existing `nextSectorToll`/`payGateToll`/`canEnterNextSector`.

- [ ] **Step 1: Gate branch** — in `src/components/WaypointPanel.tsx`, add `SECTOR_CAP, resonanceNeeded` to the existing `../engine/formulas` import (which has `sectorUnlockRank`), then replace the entire `{node.kind === 'gate' && (...)}` block (currently the `canEnterNextSector ? toll-row : empty-hint` ternary) with:

```tsx
      {node.kind === 'gate' && (() => {
        if (s.sector >= SECTOR_CAP) {
          return (
            <div class="more-section">
              <div class="empty-hint">🌌 THE RIM — Sector 99. The lanes end here. You walked them all.</div>
            </div>
          );
        }
        const dest = s.sector + 1;
        const rankReq = sectorUnlockRank(dest);
        if (rankReq > 0 && s.rank < rankReq) {
          return (
            <div class="more-section">
              <div class="empty-hint">The gate ignores you. Reach Rank {rankReq}.</div>
            </div>
          );
        }
        const need = resonanceNeeded(dest);
        const charged = s.gateResonance >= need;
        return (
          <div class="more-section">
            {need > 0 && (
              <div class="list-row">
                <span>⚡ Resonance {formatNum(Math.min(s.gateResonance, need))} / {formatNum(need)}</span>
                <span class="mono" style={{ fontSize: 10, opacity: 0.7 }}>{charged ? 'CHARGED' : 'flips · contracts · salvage'}</span>
              </div>
            )}
            <div class="list-row">
              <span>🌀 Sector {dest} — toll {formatCredits(nextSectorToll(s))}</span>
              <button class="btn btn-primary" disabled={!charged || s.credits < nextSectorToll(s)} onClick={() => payGateToll()}>PAY TOLL</button>
            </div>
          </div>
        );
      })()}
```

(`formatNum` is already imported in this file; `canEnterNextSector` becomes unused in this file after the rewrite — REMOVE it from the `../engine/actions` import to keep strict hygiene.)

- [ ] **Step 2: HUD ticker** — in `src/components/Hud.tsx`, add `resonanceNeeded, SECTOR_CAP` via a new import `import { resonanceNeeded, SECTOR_CAP } from '../engine/formulas';`, and after the daily-streak ticker push add:

```ts
  if (s.sector < SECTOR_CAP) {
    const gateNeed = resonanceNeeded(s.sector + 1);
    if (gateNeed > 0 && s.gateResonance >= gateNeed) tickerItems.push(`⚡ Gate charged — Sector ${s.sector + 1} awaits`);
  }
```

- [ ] **Step 3: Verify** — `npm run typecheck` exit 0; `npm test` green.

- [ ] **Step 4: Commit**

```bash
git add src/components/WaypointPanel.tsx src/components/Hud.tsx
git commit -m "feat: gate panel shows resonance progress; HUD calls out charged gates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: S99 cap, monument, legacy clamp + honor badges + 'eternal' SFX

**Files:**
- Modify: `src/config/events.ts` (HONOR_BADGES; JACKPOTS_BY_ID merge)
- Modify: `src/config/codex.ts` (Monuments set)
- Modify: `src/engine/actions.ts` (cap in canEnterNextSector; S99 celebration; bootGame clamp)
- Modify: `src/engine/save.ts` (importSaveCode clamp + badges)
- Modify: `src/engine/bus.ts` + `src/engine/audio.ts` (`'eternal'`)
- Test: `src/engine/__tests__/rimcap.test.ts`

**Interfaces:**
- Produces: `HONOR_BADGES: JackpotDef[]` (ids `rim_walker`, `beyond_the_rim`) exported from events.ts — merged into `JACKPOTS_BY_ID` but NOT into `JACKPOTS` (the arrival-roll pool and the Jackpot Legend codex set both derive from `JACKPOTS` and must not change). New codex set `honor_badges` ("Monuments", kind 'jackpots'). SfxId `'eternal'`.
- Clamp rule (both load paths): `sector > 99` → sector/maxSectorReached/bests.deepestSector clamp to 99; if `currentStation` starts with `'wp-'` it belonged to a >99 sector map → reset to `'rust_harbor'`; stamp BOTH badges (rim_walker + beyond_the_rim). Reaching S99 through play stamps `rim_walker` only, with the celebration.

- [ ] **Step 1: Write the failing test** — create `src/engine/__tests__/rimcap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { importSaveCode } from '../save';
import { createInitialState } from '../state';
import { HONOR_BADGES, JACKPOTS, JACKPOTS_BY_ID } from '../../config/events';
import { CODEX_SETS } from '../../config/codex';
import { SECTOR_CAP } from '../formulas';

function encode(save: unknown): string {
  // mirrors exportSaveCode (save.ts) and the existing activetime.test pattern;
  // btoa is typed by the DOM lib — do NOT use Buffer (no @types/node in this repo)
  return btoa(unescape(encodeURIComponent(JSON.stringify(save))));
}

describe('sector 99 cap + legacy clamp', () => {
  it('badges resolve in JACKPOTS_BY_ID but stay out of the arrival pool', () => {
    expect(JACKPOTS_BY_ID['rim_walker']).toBeDefined();
    expect(JACKPOTS_BY_ID['beyond_the_rim']).toBeDefined();
    expect(JACKPOTS.some((j) => j.id === 'rim_walker' || j.id === 'beyond_the_rim')).toBe(false);
    const monuments = CODEX_SETS.find((s) => s.id === 'honor_badges');
    expect(monuments?.memberIds.sort()).toEqual(['beyond_the_rim', 'rim_walker']);
    expect(HONOR_BADGES.length).toBe(2);
  });

  it('imported god-saves clamp to S99, fix waypoint positions, and earn both badges', () => {
    const god = createInitialState();
    god.sector = 121;
    god.maxSectorReached = 121;
    god.bests.deepestSector = 121;
    god.currentStation = 'wp-s121-3';
    const loaded = importSaveCode(encode(god));
    expect(loaded.sector).toBe(SECTOR_CAP);
    expect(loaded.maxSectorReached).toBe(SECTOR_CAP);
    expect(loaded.bests.deepestSector).toBe(SECTOR_CAP);
    expect(loaded.currentStation).toBe('rust_harbor');
    expect(loaded.codex.jackpots['rim_walker']).toBe(true);
    expect(loaded.codex.jackpots['beyond_the_rim']).toBe(true);
    expect((loaded as unknown as Record<string, unknown>).pendingRimClamp).toBe(true);
  });

  it('normal saves pass through the clamp untouched', () => {
    const s = createInitialState();
    s.sector = 12;
    s.maxSectorReached = 12;
    const loaded = importSaveCode(encode(s));
    expect(loaded.sector).toBe(12);
    expect(loaded.codex.jackpots['rim_walker']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/engine/__tests__/rimcap.test.ts` — Expected: FAIL (no HONOR_BADGES export).

- [ ] **Step 3: Badges** — `src/config/events.ts`: after the JACKPOTS array, add:

```ts
// Honor badges — codex-only monuments; deliberately EXCLUDED from JACKPOTS so the
// arrival roll and the Jackpot Legend set never include them.
export const HONOR_BADGES: JackpotDef[] = [
  { id: 'rim_walker', name: 'RIM WALKER', icon: '🎖️', copy: 'Sector 99. The lanes end here. You walked them all.' },
  { id: 'beyond_the_rim', name: 'BEYOND THE RIM', icon: '🗿', copy: 'You sailed past the edge before there was an edge.' },
];
```

and change the JACKPOTS_BY_ID line to:

```ts
export const JACKPOTS_BY_ID: Record<string, JackpotDef> = Object.fromEntries([...JACKPOTS, ...HONOR_BADGES].map((j) => [j.id, j]));
```

`src/config/codex.ts`: add `HONOR_BADGES` to the `./events` import and append to CODEX_SETS:

```ts
  { id: 'honor_badges', name: 'Monuments', icon: '🗿', kind: 'jackpots', memberIds: HONOR_BADGES.map((b) => b.id) },
```

(Note: completing this set grants the usual +1% codex income; only pre-cap legacy saves can ever finish it — that display is the point.)

- [ ] **Step 4: Cap + celebration** — `src/engine/actions.ts`:

4a. `canEnterNextSector` becomes:

```ts
export function canEnterNextSector(state: GameState): boolean {
  return state.sector < SECTOR_CAP && state.rank >= sectorUnlockRank(state.sector + 1);
}
```

4b. In `payGateToll`, inside its `setState` updater, wrap the returned merge in a variable so it can be stamped: change `return { ...s, credits: ... };` structure to build `let st: GameState = { ...existing merge... };` then before returning add:

```ts
    if (dest === SECTOR_CAP) st = stampCodex(st, 'jackpots', 'rim_walker');
    return st;
```

and AFTER the `setState` call, REPLACE the existing three celebration emits (`sfx 'toll'` / `confetti 'big'` / the `SECTOR ${dest} — everything's about to get expensive.` toast) with a branch so exactly ONE celebration fires per gate:

```ts
  if (dest === SECTOR_CAP) {
    emit({ type: 'sfx', id: 'eternal' });
    emit({ type: 'confetti', power: 'big' });
    emit({ type: 'haptic', pattern: 'jackpot' });
    emit({ type: 'toast', text: 'THE RIM — SECTOR 99. There is nothing further. There is nothing better.', icon: '🎖️' });
  } else {
    emit({ type: 'sfx', id: 'toll' });
    emit({ type: 'confetti', power: 'big' });
    emit({ type: 'toast', text: `SECTOR ${dest} — everything's about to get expensive.`, icon: '🌌' });
  }
```

4c. `bootGame` — immediately after the merged-state literal (with all its backfills), add the clamp:

```ts
  if (state.sector > SECTOR_CAP) {
    if (!Array.isArray(state.quests)) state = { ...state, quests: [] }; // stampCodex maps over quests
    state = {
      ...state,
      sector: SECTOR_CAP,
      maxSectorReached: Math.min(state.maxSectorReached, SECTOR_CAP),
      bests: { ...state.bests, deepestSector: Math.min(state.bests.deepestSector, SECTOR_CAP) },
      currentStation: state.currentStation.startsWith('wp-') ? 'rust_harbor' : state.currentStation,
      pendingRimClamp: true,
    };
    state = stampCodex(state, 'jackpots', 'rim_walker');
    state = stampCodex(state, 'jackpots', 'beyond_the_rim');
  }
```

- [ ] **Step 5: Import-path clamp** — `src/engine/save.ts`: add `import { SECTOR_CAP } from './formulas';` (cycle-safe: formulas.ts's only dependency on `./state` is `import type`, erased at emit under isolatedModules; its runtime deps — config/rigs, config/codex, ./price — never reach save.ts). Then in `importSaveCode`, next to the other backfills, add:

```ts
  const p = parsed as Record<string, any>;
  if (typeof p.sector === 'number' && p.sector > SECTOR_CAP) {
    p.sector = SECTOR_CAP;
    if (typeof p.maxSectorReached === 'number') p.maxSectorReached = Math.min(p.maxSectorReached, SECTOR_CAP);
    if (p.bests && typeof p.bests.deepestSector === 'number') p.bests.deepestSector = Math.min(p.bests.deepestSector, SECTOR_CAP);
    if (typeof p.currentStation === 'string' && p.currentStation.startsWith('wp-')) p.currentStation = 'rust_harbor';
    if (p.codex && p.codex.jackpots) {
      p.codex.jackpots['rim_walker'] = true;
      p.codex.jackpots['beyond_the_rim'] = true;
    }
    p.pendingRimClamp = true;
  }
```

- [ ] **Step 6: SFX** — `src/engine/bus.ts`: append `| 'eternal'` to SfxId. `src/engine/audio.ts` `play()` switch:

```ts
      case 'eternal':
        this.tone(40, 4, { startFreq: 30, gain: 0.3 });
        [261.63, 329.63, 392, 523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, 0.6, { type: 'triangle', gain: 0.16, delay: 0.4 + i * 0.22 }));
        this.tone(1046.5, 2.2, { gain: 0.12, delay: 1.9 });
        this.noise(1.5, { gain: 0.1, filterType: 'highpass', filterFreq: 5000, filterFreqEnd: 12000, delay: 1.2 });
        break;
```

- [ ] **Step 6b: One-time clamp celebration** — a silently clamped god-save would read as corruption. Add a clear action in `src/engine/actions.ts` (near `dismissPendingJackpot`):

```ts
export function acknowledgeRimClamp(): void {
  setState((s) => ({ ...s, pendingRimClamp: false }));
}
```

and in `src/app.tsx`, with the other effects, add (import `acknowledgeRimClamp` from `'./engine/actions'` and `emit` from `'./engine/bus'` — check both against existing imports first):

```ts
  useEffect(() => {
    if (!s.pendingRimClamp) return;
    emit({ type: 'sfx', id: 'eternal' });
    emit({ type: 'confetti', power: 'big' });
    emit({ type: 'toast', text: 'The charts end at Sector 99 now — and you were already past it. RIM WALKER + BEYOND THE RIM earned.', icon: '🗿' });
    acknowledgeRimClamp();
  }, [s.pendingRimClamp]);
```

- [ ] **Step 7: Verify** — focused PASS; `npm test` green; `npm run typecheck` exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/config/events.ts src/config/codex.ts src/engine/actions.ts src/engine/save.ts src/engine/state.ts src/engine/bus.ts src/engine/audio.ts src/app.tsx src/engine/__tests__/rimcap.test.ts
git commit -m "feat: Sector 99 cap with monument, honor badges, legacy god-save clamp

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Seeded good icons (user report)

**Files:**
- Modify: `src/engine/sectorgen.ts`
- Test: append to `src/engine/__tests__/mass.test.ts`

**Interfaces:**
- Procedural good icons roll from per-band pools via a per-good side rng — the main generator stream MUST stay byte-identical (the pinned legacy snapshot in mass.test.ts is the guard).

- [ ] **Step 1: Write the failing test** — append to `src/engine/__tests__/mass.test.ts` (inside the existing describe or a new one):

```ts
describe('seeded good icons', () => {
  const POOLS = [
    ['🔩', '⚙️', '🧱', '🪨', '🛢️', '📦'],
    ['🔮', '💠', '🧪', '🪙', '🎛️', '🧿'],
    ['🧬', '🦠', '💎', '🧫', '⚗️', '🪬'],
    ['🛰️', '☄️', '🌠', '🪐', '⚛️', '🌌'],
  ];

  it('icons come from the band pool, deterministically', () => {
    const a = generateSectorGoods(2, 777);
    const b = generateSectorGoods(2, 777);
    expect(a.map((g) => g.icon)).toEqual(b.map((g) => g.icon));
    a.forEach((g, band) => expect(POOLS[band]).toContain(g.icon));
  });

  it('band icons VARY across sectors (the reported bug: they were all identical)', () => {
    for (let band = 0; band < 4; band++) {
      const icons = new Set<string>();
      for (let s = 2; s <= 12; s++) icons.add(generateSectorGoods(s, 0)[band].icon);
      expect(icons.size).toBeGreaterThan(1);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/engine/__tests__/mass.test.ts` — Expected: the variety test FAILS (all sectors share one icon per band); CRITICALLY the pinned legacy snapshot test must still PASS before AND after this task.

- [ ] **Step 3: Implement** — `src/engine/sectorgen.ts`: replace `const TIER_ICONS = ['🔩', '🔮', '🧬', '🛰️'];` with:

```ts
const TIER_ICON_POOLS = [
  ['🔩', '⚙️', '🧱', '🪨', '🛢️', '📦'],
  ['🔮', '💠', '🧪', '🪙', '🎛️', '🧿'],
  ['🧬', '🦠', '💎', '🧫', '⚗️', '🪬'],
  ['🛰️', '☄️', '🌠', '🪐', '⚛️', '🌌'],
];
```

and in `generateSectorGoods`, next to the existing mass side-roll, add:

```ts
    // Icon rolls from its own side rng — same isolation rule as the mass roll:
    // the main `rng` stream must keep emitting the exact legacy sequence.
    const iconRng = mulberry32((hashSeed(`s${sector}_g${band}-icon`) ^ (runSeed >>> 0)) >>> 0);
    const icon = TIER_ICON_POOLS[band][Math.floor(iconRng() * TIER_ICON_POOLS[band].length)];
```

and change the pushed literal's `icon: TIER_ICONS[band],` to `icon,`.

- [ ] **Step 4: Verify** — `npx vitest run src/engine/__tests__/mass.test.ts` all PASS (snapshot included); `npm test` green; `npm run typecheck` exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/sectorgen.ts src/engine/__tests__/mass.test.ts
git commit -m "fix: procedural good icons roll from seeded per-band pools (user report)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Balance sim v4 — ladder pacing gates

**Files:**
- Modify: `scripts/balance-sim.mjs` (append a ladder section; existing model/gates untouched)

**Interfaces:**
- `npm run balance` now prints the original five PASS lines with BYTE-IDENTICAL values, plus four new ladder gates. Planning-run values: total ≈ 548h, S20 ≈ 6.4h, final gate ≈ 31.8h.

- [ ] **Step 1: Append to `scripts/balance-sim.mjs`** — after the existing `process.exit(failed ? 1 : 0);` REMOVE that line and append this section (the exit moves to the end):

```js
// ---------------------------------------------------------------------------
// Endgame ladder (spec 2026-07-17): tapered scale/tolls + Gate Resonance.
// Mirrors: price.ts sectorScale taper, formulas.ts gateToll/resonanceNeeded.
const sectorScaleV2 = (s) => Math.pow(8, Math.min(s, 10) - 1) * Math.pow(1.6, Math.max(0, s - 10));
const resonanceNeeded = (d) => (d <= 10 ? 0 : Math.ceil(6 * Math.pow(1.062, d - 10)));

// Optimal active climber: late-game loop ≈ 181s (recycler 5), charges/loop =
// 1 qualifying flip + 30% manifests (+3) + 10% salvage (+1) = 2.0
// (valid because resonance requires MOVED goods — wash-trades and at-the-door
// manifest buys earn nothing, so a charge really costs a travel loop)
const LOOP_EARLY = 2 * 1.8 * 1.15 * 65 + 2 * 1.8 * 3 + 25;
const LOOP_LATE = 2 * 1.8 * 1.15 * 35 + 2 * 1.8 * 3 + 25;
const CHARGES_PER_LOOP = 1 + 0.3 * 3 + 0.1;

let ladderTotalH = 0;
let s20H = 0;
let lastGateH = 0;
for (let dest = 2; dest <= 99; dest++) {
  const loop = dest < 15 ? LOOP_EARLY : LOOP_LATE;
  const loopsPerHour = 3600 / loop;
  const hours = dest <= 10 ? 0.4 : resonanceNeeded(dest) / (CHARGES_PER_LOOP * loopsPerHour);
  ladderTotalH += hours;
  if (dest === 20) s20H = ladderTotalH;
  if (dest === 99) lastGateH = hours;
}
console.log(`\nladder: total S99 = ${ladderTotalH.toFixed(0)}h · S20 @ ${s20H.toFixed(1)}h · final gate ${lastGateH.toFixed(1)}h · S99 scale ${sectorScaleV2(99).toExponential(2)}`);

const ladderChecks = [
  ['ladder: total time to S99 in [450h, 650h]', ladderTotalH >= 450 && ladderTotalH <= 650],
  ['ladder: final S99 gate in [25h, 40h]', lastGateH >= 25 && lastGateH <= 40],
  ['ladder: S20 cumulative <= 8h (early game stays quick)', s20H <= 8],
  ['ladder: S99 prices stay readable (< 1e27 scale)', sectorScaleV2(99) < 1e27],
];
for (const [label, ok] of ladderChecks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
```

**IMPORTANT:** the pre-existing trader/rig model above this section still uses the flat `sectorScale = (s) => Math.pow(8, s - 1)` — that is CORRECT and must not be edited: that model only ever reaches S2-S3 within its 60-hour window, where the taper is the identity, and its five gates must stay byte-identical.

- [ ] **Step 2: Run** — `npm run balance` — Expected: the original five PASS lines with unchanged values, then the ladder line, then four more PASS lines; exit 0. (Planning observed: total = 548h, S20 = 6.4h, final gate = 31.8h.)

- [ ] **Step 3: Commit**

```bash
git add scripts/balance-sim.mjs
git commit -m "test: ladder pacing gates — 450-650h to S99, 25-40h final gate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: v2.2.0 + final verification

**Files:**
- Modify: `package.json`, `src/components/MoreScreen.tsx`

- [ ] **Step 1: Version** — `package.json` `"version": "2.1.0"` → `"2.2.0"`; MoreScreen About line `JUNKRUN v2.1 ·` → `JUNKRUN v2.2 ·`. Commit:

```bash
git add package.json src/components/MoreScreen.tsx
git commit -m "chore: v2.2.0 — the Sector 99 ladder

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Full gate**

```bash
npm run typecheck && npm test && npm run balance && npm run build
```

Expected: all four succeed (nine PASS lines from balance).

- [ ] **Step 3: Manual QA checklist** (report results; fix nothing without a task):
  - Import a >S99 god-save code → clamps to S99, both badges appear under Monuments, no console errors, market renders at rust_harbor.
  - In a dev save at S11+: flips/contracts/salvage tick the ⚡ counter; gate panel shows progress; uncharged gate refuses with the reason; charged gate opens and resets resonance.
  - Sector 1-10 play feels identical (prices, tolls, rank gates).
  - Sector 2+ market shows varied band icons.

- [ ] **Step 4: STOP.** Report completion. The controller merges/tags/deploys per the user's standing instruction.

---

## Self-review notes (already applied)

- Spec coverage: taper → T1; tolls → T1; resonance → T1+T3+T4; XP normalization → T2; cap/monument/legacy/badges → T5; icons → T6; sim gates → T7; version → T8.
- Save-compat: `gateResonance` backfills ×3 (T3); clamp in both load paths (T5) with the wp-currentStation fix; badges never enter the arrival pool; save.ts deliberately hardcodes CAP=99 with a mirror comment (formulas import would create a state↔save cycle).
- Type consistency: `resonanceNeeded`/`SECTOR_CAP`/`RESONANCE_FLIP_FLOOR` defined in T1, consumed T3/T4/T5; `HONOR_BADGES` defined T5 events.ts, consumed same-task codex.ts; `'eternal'` added to the union in the same task that emits it.
- Sectors 1-10 identity is pinned by ladder.test.ts (scale/tolls/rank gates) and by the sim's original five gates staying byte-identical.
- Adversarial review pass (22 agents, 2026-07-17): 17 confirmed findings → 11 distinct fixes applied, notably the resonanceNeeded(90)=739 pin, Buffer→btoa, the wash-trade/at-the-door resonance exploits (CargoEntry.srcStation provenance), the procedural-goods unlock-rank cap, the double-celebration branch, and the pendingRimClamp one-time monument moment.

---

### Task 9: Codex tap tooltips (user report)

User report: codex cells are bare icon tiles — "kind of meaningless". On mobile there is no
hover, so cells become tappable: tapping toasts the entry's name (discovered) or a
kind-specific hint (undiscovered).

**Files:**
- Modify: `src/components/MoreScreen.tsx`
- Test: none (UI toast wiring; typecheck + manual)

- [ ] **Step 1: Name + hint helpers** — in `src/components/MoreScreen.tsx`, next to the existing `codexIcon` helper, add:

```ts
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
```

and import `emit` from `'../engine/bus'`.

- [ ] **Step 2: Tappable cells** — in the Codex section's cell render, replace

```tsx
                {set.memberIds.map((id) => (
                  <div key={id} class={`codex-cell${bucket[id] ? ' got' : ''}`}>{codexIcon(set.kind, id)}</div>
                ))}
```

with

```tsx
                {set.memberIds.map((id) => (
                  <div
                    key={id}
                    class={`codex-cell${bucket[id] ? ' got' : ''}`}
                    onClick={() =>
                      emit({
                        type: 'toast',
                        text: bucket[id] ? codexName(set.kind, id) : CODEX_HINTS[set.kind] ?? '???',
                        icon: bucket[id] ? codexIcon(set.kind, id) : '❔',
                      })
                    }
                  >
                    {codexIcon(set.kind, id)}
                  </div>
                ))}
```

Also make the Milestone Wall cells consistent — replace their `title={`10^${p}`}` div with the same pattern:

```tsx
              <div key={p} class="codex-cell got" onClick={() => emit({ type: 'toast', text: `Milestone — crossed ₡10^${p} net worth`, icon: '🏆' })}>🏆</div>
```

- [ ] **Step 3: Verify** — `npm run typecheck` exit 0; `npm test` green. Manual: tapping a lit codex cell toasts its name; a dark cell toasts the hint.

- [ ] **Step 4: Commit**

```bash
git add src/components/MoreScreen.tsx
git commit -m "feat: codex cells toast their name or an undiscovered hint on tap

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Contract goods identification + source hint (user report)

User report: "the trade route goods are unknown, making it hard to buy them" — contract items
render as bare icons. Items gain their NAME and a cheapest-source station hint.

**Files:**
- Modify: `src/components/ContractsPanel.tsx`
- Modify: `src/style.css`

- [ ] **Step 1: Named items with source hints** — in `src/components/ContractsPanel.tsx`:
  - add imports:

```ts
import { STATIONS } from '../config/stations';
import { getPrice } from '../engine/pricing';
import { stationDisplayName } from '../engine/sectorgen';
```

(keep existing imports; `goodById` and `STATIONS_BY_ID` are already there.)
  - inside the manifest map, before `return`, add a source-hint helper over unlocked stations:

```ts
        const cheapestSource = (goodId: string): string | null => {
          let best: { id: string; price: number } | null = null;
          for (const st of STATIONS) {
            if (st.unlockRank > s.rank) continue;
            const p = getPrice(s, st.id, goodId);
            if (!best || p < best.price) best = { id: st.id, price: p };
          }
          return best ? stationDisplayName(best.id, s.sector, s.runSeed ?? 0) : null;
        };
```

  - replace the item chip render:

```tsx
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
```

- [ ] **Step 2: Styles** — append to `src/style.css`:

```css
.contract-row .c-items { flex-wrap: wrap; }
.contract-row .c-src { opacity: 0.65; font-size: 10px; }
```

- [ ] **Step 3: Verify** — `npm run typecheck` exit 0; `npm test` green. Manual: contracts list each good's name; unfilled items show where it's cheapest right now; the hint disappears once the item is fulfilled.

- [ ] **Step 4: Commit**

```bash
git add src/components/ContractsPanel.tsx src/style.css
git commit -m "feat: contracts name their goods and point at the cheapest source

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Addendum note

Tasks 9-10 were added after the Tasks 1-8 adversarial review began (user reports mid-flight);
they receive controller-level review at execution instead.
