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
