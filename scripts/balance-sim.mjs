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
  { unlockRank: 1, base: 35, mass: 75 },   // hull plates
  { unlockRank: 3, base: 150, mass: 22.5 }, // spore crates
  { unlockRank: 6, base: 900, mass: 9 },  // earth relics
  { unlockRank: 9, base: 6500, mass: 12 }, // warp cells
  { unlockRank: 10, base: 9000, mass: 7.5 },
  { unlockRank: 15, base: 45000, mass: 9 },
  { unlockRank: 17, base: 90000, mass: 4.5 },
  { unlockRank: 19, base: 140000, mass: 4 },
  { unlockRank: 22, base: 500000, mass: 4.5 },
  { unlockRank: 24, base: 900000, mass: 15 },
  { unlockRank: 26, base: 1500000, mass: 45 },
  { unlockRank: 28, base: 2500000, mass: 2.5 },
];
const bestGood = (rank) => { let b = GOODS[0]; for (const g of GOODS) if (g.unlockRank <= rank) b = g; return b; };
const sectorScale = (s) => Math.pow(8, s - 1);
const gateToll = (d) => 2_000_000 * Math.pow(15, d - 2);
const sectorUnlockRank = (d) => 20 + (d - 2) * 10;
const xpToNext = (lvl) => Math.round(12 * Math.pow(lvl, 1.8));

const P = {
  tapsPerSec: 2,
  exporterMid: 0.575, importerMid: 1.60,
  holdBaseM3: 200, holdPerLevelM3: 50, cargoBaseCost: 800, cargoGrowth: 1.65,
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
    const tons = (P.holdBaseM3 + cargoLvl * P.holdPerLevelM3) * (1 + P.gravitonPct * gravitonLvl);
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

// ---------------------------------------------------------------------------
// Endgame ladder (spec 2026-07-17): tapered scale/tolls + Gate Resonance.
// Mirrors: price.ts sectorScale taper, formulas.ts gateToll/resonanceNeeded.
const sectorScaleV2 = (s) => Math.pow(8, Math.min(s, 10) - 1) * Math.pow(1.6, Math.max(0, s - 10));
const resonanceNeeded = (d) => (d <= 10 ? 0 : Math.ceil(6 * Math.pow(1.062, d - 10)));

// Optimal active climber: late-game loop ≈ 181s (recycler 5), charges/loop =
// 1 qualifying flip + 30% manifests (+3) + 10% salvage (+1) = 2.0
// (valid because resonance requires MOVED goods — wash-trades and at-the-door
// manifest buys earn nothing, so a charge really costs a travel loop)
// (flip charges are per-good-per-docking, so chunked sales cannot inflate the rate)
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
