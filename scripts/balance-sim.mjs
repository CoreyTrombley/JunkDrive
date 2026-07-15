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
