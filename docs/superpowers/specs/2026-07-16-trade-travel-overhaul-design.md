# JUNKRUN Trade & Travel Overhaul — Design Spec

Date: 2026-07-16. Covers four user-requested features. Design choices marked **[USER-OVERRIDABLE]**
were selected by the assistant when the user was away; each has listed alternatives and can be
swapped before the implementation plan executes.

## Goals (user's words, paraphrased)

1. A better way to sort and/or filter the goods list on the market screen.
2. Simulate global trade beyond the current random-walk timer: more dynamic pricing, plus an
   objective built around buying **combinations** of items to sell.
3. A larger, grid-influenced map with different routes between points — a gentle
   traveling-salesman puzzle.
4. Item size/weight limits what you can hold; the ship's weight cap must be expandable.

All tuning below is sim-verified (extension of `scripts/balance-sim.mjs` model): with every new
system on, trade:rig ratio stays 0.58 @₡1M and 1.37 @₡10M (approved band 0.30–1.25 / 0.90–1.75),
and optimal-play rank pacing is R13 ≈ 1.1h, R20 ≈ 1.4h, R25 ≈ 1.5h — modestly slower than today
(0.91h R20) because routing is now real gameplay; sanity variants without manifests and with heavy
manifest play stay inside the bands.

---

## Feature 4 — Tonnage cargo (built first; everything else prices against it)

**Chosen: pure tonnage.** [USER-OVERRIDABLE — alternatives: dual slots+weight; weight-as-speed-penalty]

- Every `Good` gains `mass` (tons). Hand-authored for the 24 sector-1 goods
  (bulk freight heavy → exotics light): scrap_metal 6, water_ice 4.5, protein_packs 3,
  hull_plates 7.5, copper_coil 4.5, coolant 3.75, fuel_rods 4.5, spore_crates 2.25, med_gel 1.5,
  machine_parts 3.75, circuit_bundles 1.2, earth_relics 0.9, alien_ceramics 1.8,
  banned_ai_chips 0.6, warp_cells 1.2, neutrino_lenses 0.75, alien_artifacts 0.9,
  cryo_megafauna 3.0, antimatter_vials 0.45, singularity_shards 0.4, dark_relics 0.45,
  stellar_cores 1.5, ghost_ships 4.5, time_crystals 0.25. Procedural goods: band masses
  [6, 3.75, 1.5, 0.6] × rand(0.7, 1.3), rolled with the good (seeded, id-stable).
- `maxHold` becomes **tons**: base 20t + cargo_hold ×5t/level (cost 800 × 1.65^lvl, unchanged
  curve) — all multiplied by a new late-game upgrade **Graviton Frame**: ×(1 + 0.25·level),
  max 5, cost 250,000 × 5^lvl. `bigger_bones` relic becomes +8t × 2^(level−1) — +8t at level 1, doubling each level.
- `usedHold` = Σ qty × mass. Trade sheet caps qty by `floor(freeTons / mass)`; HUD/ship screens
  show `12.4t / 20t`.
- Save migration: none needed — over-capacity legacy cargo is never dropped; it just blocks new
  buying until sold down (free space computes ≤ 0).

## Feature 2 — Living economy: station stocks + trade manifests

**Chosen: both systems.** [USER-OVERRIDABLE — alternatives: stocks only; manifests only]

### Station stocks (dynamic pricing)
- Each (station, good) has stock `S`, lazily initialized to its baseline `B`: exporter
  (bias < 0.8) B=120, importer (bias > 1.25) B=40, neutral B=70.
- Price gains a stock multiplier: `S ≤ B → 1 + 0.5·(1 − S/B)` (scarcity, up to ×1.5);
  `S > B → max(0.7, 1 − 0.3·(S/B − 1))` (glut, down to ×0.7).
- Buying q units removes q from S (floor 0); selling adds q (soft cap via the ×0.7 floor).
- Every market pulse (180s), S regenerates 12% of the way to B (20% at exporter stations),
  including offline fast-forward. So hammering one route degrades its margin within a few loops
  and recovers in ~15–30 min — the world visibly reacts and pushes route rotation.
- Stored as `state.stocks: Record<stationId, Record<goodId, number>>`, sparse (only touched
  entries), missing = baseline. Legacy saves need no migration.

### Trade manifests (the combination objective)
- 3 concurrent contract offers in `state.manifests`. Each: deliver a **combo** of 2–3 distinct
  goods (e.g. 8× Coolant + 4× Med-Gel + 2× Machine Parts) to a named station within 20–40 min,
  for a lump payment at a **1.7–2.2× premium** over galactic base value, plus XP at 1.5× the
  equivalent sale XP. Quantities are scaled to ~60–90% of the player's current hold tonnage.
- Goods are picked so their cheap sources are *not* the delivery station — assembling a manifest
  means visiting 2–3 stops, which is the TSP-lite objective the map (feature 3) rewards.
- Delivering: at the target station, one button turns in the goods (must all be in cargo),
  pays out, rolls a replacement offer. Expired offers auto-reroll. A `deliver_manifest` quest
  kind joins the quest pool. Manifest payouts bypass stock depletion (contracted price).
- UI: a Contracts panel on the Map screen (where routes are planned) + HUD ticker lines.

## Feature 3 — Warp-lane graph map (TSP-lite)

**Chosen: warp-lane graph over a grid layout.** [USER-OVERRIDABLE — alternatives: free-jump
range grid; tile-by-tile movement. Ideas for all three were drafted; this one reads best on a
phone and gives authored route character.]

- Each sector's map is a **generated graph**: 12 nodes placed on a 6×5 virtual grid (spread by
  seeded rejection sampling), connected by ~16–19 warp lanes: 2–3 nearest-neighbor links per
  node + union-find connectivity repair + 2 long "shortcut" lanes. Degree ≤ 4. Seeded by
  `hashSeed('map-sector-N') ^ runSeed` — every collapse rolls a new topology, same as routes.
- **Nodes**: the 7 existing stations (full markets, unchanged identities/themes) + 5 waypoints:
  - 2 **Outposts** — mini-markets stocking 5 seeded goods at neutral bias, no events, no scans;
  - 1 **Fuel Depot** — buy fuel pips for credits (2% of net worth each, min ₡50);
  - 1 **Salvage Field** — free grab of 1–4 units of a random unlocked good every 10 min;
  - 1 **Beacon** — pure junction; first visit stamps the codex and pays a little XP.
  The sector gate is a 13th node pinned at the grid's far edge.
- **Lanes** carry: fuel cost (1 for short, 2 for long — ~75/25 mix), and a trait: `safe` (70%),
  `pirate` (20%, traversing rolls a 30% pirate-toll encounter mid-hop), `express` (10%, travel
  animation halved and tagged FAST).
- **Travel**: movement is lane-by-lane. Tapping any reachable node computes the cheapest path
  (Dijkstra on fuel) and shows it; a **route queue** lets you add multiple stops in order and
  see total fuel + pirate exposure before committing — choosing the visit order is the puzzle.
  Hops execute sequentially with the existing travel overlay; each hop commits, so closing the
  app mid-route just leaves you at the last node. Arrival events roll only at the final stop.
- **Fuel economy rebalanced for multi-hop**: base max fuel 5 → 8; regen 75s → 65s base,
  recycler −6s/level, floor 35s. (Sim-verified above.)
- Waypoints use a shared "deep space" theme + drone-family ambience with a distinct motif;
  `scanChance` 0; `getPrice` at waypoints uses neutral bias (outposts ×0.95–1.15 seeded).
- Legacy saves: `currentStation` always maps to a station node (stations always exist as nodes);
  waypoint ids are namespaced `wp-s{sector}-{i}`.

## Feature 1 — Market sort & filter

**Chosen: sort selector + filter chips, persisted in settings.** [USER-OVERRIDABLE —
alternatives: sort-only; full search + saved views]

- Sort: Default (tier), Price ↑↓, % vs galactic average, Owned, Profit if sold here, **₡/ton**
  (value density — pairs with tonnage).
- Filter chips: Owned · Affordable · Hide contraband · Tier (1–6 picker).
- One compact control row above the goods list; state lives in `settings.marketSort` /
  `settings.marketFilters` so it persists across sessions (and merges cleanly into old saves).

## Cross-cutting

- **Balance gates updated**: `scripts/balance-sim.mjs` gains the tonnage/stock/manifest/lane
  model (constants above) with PASS/FAIL gates: ratio@1e6 ∈ [0.30, 1.25], ratio@1e7 ∈
  [0.90, 1.75], R13 ≥ 0.5h, R20 ≤ 1.5h, R25 ≤ 1.8h.
- **Testing**: vitest units for mass math, stock evolution, manifest generation/delivery, graph
  generation invariants (connectivity, degree cap, fuel costs, determinism per seed), Dijkstra
  correctness, sort/filter predicates. UI verified by typecheck + manual QA.
- **Audio**: new SFX ids for manifest accept/deliver, depot refuel, salvage grab, express lane.
- **Save-compat**: all new state fields (`stocks`, `manifests`, `settings.marketSort/…`) backfill
  via the existing bootGame/importSave fresh-defaults merges; goods keep their ids; no field is
  repurposed.
- **Build order** (each phase leaves the game shippable): Phase 1 tonnage + market UI →
  Phase 2 stocks + manifests (on the current ring map) → Phase 3 the lane-graph map.

## Out of scope (explicitly)

Interconnected good-price webs (opaque, hard to tune); tile-by-tile ship movement; text search
and saved market views; manifest chains/reputation (possible follow-up).
