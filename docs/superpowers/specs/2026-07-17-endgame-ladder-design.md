# JUNKRUN Endgame Ladder — Design Spec (Sector 99, D2-style)

Date: 2026-07-17. User brief: "I want sector 99 to feel like trying to get to Diablo 2 level 99."
User-confirmed choices: Gate Resonance mechanic · ~500-hour ladder · legacy saves clamp to S99
with a monument · per-sector XP normalization. Also folds in a user report: procedural goods
reuse one icon per tier band — icons become seeded per-band pools.

## Why (the runaway)

A real save reached sector 121 / rank 12,278 / ₡3.4×10¹³⁴: income scales ×8 per sector
(prices AND yard parity) while tolls grow ×15 per sector from a base wealth can lap within a
sector — wealth compounds intra-sector, so gates became trivial and every number inflated into
meaninglessness. Sectors need a gate that cannot be lump-sum bought, and power needs a taper.

## The ladder (all sim-verified, variant "G")

### 1. Tapered sector power
`sectorScale(s) = 8^(min(s,10)−1) × 1.6^max(0, s−10)`
Full ×8 jumps through S10 (unchanged early/mid game), then +60% per sector. S99 scale ≈ 2×10²⁶
(top prices ≈ ₡5×10³² — readable with the suffix ladder). Yard parity uses the same function,
so trade:rig balance stays sector-invariant automatically.

### 2. Tapered tolls (secondary gate)
`gateToll(d) = 2,000,000 × 15^(min(d,10)−2) × 1.5^max(0, d−10)`
Past S10 tolls grow slightly SLOWER than income (1.5 < 1.6) — credits are the entry fee, not
the wall. The wall is:

### 3. Gate Resonance (the D2 XP analog)
- New state: `gateResonance: number` — charges accumulated in the CURRENT sector; resets to 0
  on every sector entry and on prestige. Not transferable, not buyable.
- Earning (active play only):
  - **+3** per manifest delivery
  - **+1** per profitable sale whose sector-normalized profit `profit / sectorScale(sector)`
    is ≥ **2,000** (a competent mid-hold flip qualifies; penny flips don't)
  - **+1** per salvage-field claim
- Requirement to open gate → sector d: `resonanceNeeded(d) = d ≤ 10 ? 0 : ceil(6 × 1.062^(d−10))`
  (S11: 7 · S30: 20 · S50: 67 · S75: 300 · S90: 739 · S99: 1269 charges).
- Rank requirements: unchanged for d ≤ 10 (rank 20…100); **none past S10** — resonance is the
  gate, rank becomes a pure prestige ladder.
- Gate panel shows `Resonance N / needed` alongside the toll; HUD ticker calls out a charged gate.

**Sim-verified pacing (optimal active play, ~20 loops/hour late-game):** S20 @ ~6.4h ·
S50 @ ~31h · S90 @ ~320h · S99 @ **~548h total**, with the S98→99 gate alone ≈ **32 hours**.
The S90→99 stretch is ~230h — the D2 95-to-99 wall.

### 4. XP normalization (rank runaway fix)
`saleXp = max(1, ceil(3 × (profit / sectorScale(sector))^0.42))` — a good flip in S50 ranks
like a good flip in S3. Sector 1 is numerically identical to today (scale 1), so early-game
pacing and the shipped R13/R20/R25 gates are untouched. Manifest XP flows through the same
normalization. Existing ranks are historic — no retroactive change (you stay 12,278).
Sim: rank ≈ 127 at the S99 summit.

### 5. Sector 99 cap + monument
- `canEnterNextSector` is false at s ≥ 99; the S99 gate node renders as **THE RIM** — monument
  copy, no toll ("The lanes end here. You walked them all.").
- Arriving in S99 fires the biggest celebration in the game (new `'eternal'` SFX, big confetti,
  toast) and stamps a codex badge **RIM WALKER** (rendered in the jackpots codex set).
- **Legacy clamp**: saves with sector > 99 clamp to 99 (`sector`, `maxSectorReached`,
  `bests.deepestSector`) in both load paths, keep all wealth, receive RIM WALKER instantly plus
  an exclusive **BEYOND THE RIM** badge only pre-cap saves can ever own.

### 6. Seeded good icons (user report)
Procedural goods currently take one fixed icon per tier band (every sector's band-1 good is 🔮).
Each band gets an icon POOL, picked by a per-good side-channel rng (`hashSeed(id+'-icon') ^ runSeed`)
— same isolation technique as the mass roll, so the legacy generator stream stays byte-identical
(pinned snapshot test still guards it):
- band 0 (bulk): 🔩 ⚙️ 🧱 🪨 🛢️ 📦 · band 1 (refined): 🔮 💠 🧪 🪙 🎛️ 🧿
- band 2 (exotic): 🧬 🦠 💎 🧫 ⚗️ 🪬 · band 3 (celestial): 🛰️ ☄️ 🌠 🪐 ⚛️ 🌌
Icons of existing procedural goods may change once on upgrade (cosmetic only; ids/prices stable).

## Compatibility & invariants

- Sector 1–10 gameplay, prices, tolls, rank gates: **numerically identical** to v2.1.
- All shipped sim gates (mid-game trade:rig band, R13/R20/R25) must still pass unchanged.
- New save fields (`gateResonance`) backfill across bootGame / importSave / importSaveCode.
- The balance sim gains ladder gates: total S99 time ∈ [450h, 650h]; final gate ∈ [25h, 40h];
  S20 cumulative ≤ 8h; existing gates byte-unchanged.
- Version: **v2.2.0**.

## Out of scope

Resonance decay, ladder seasons/resets, leaderboards, post-99 content (the badge IS the content),
retroactive rank rescaling.
