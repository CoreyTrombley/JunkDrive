import { useEffect, useState } from 'preact/hooks';
import { store } from './engine/store';
import { STATIONS_BY_ID } from './config/stations';
import type { PendingOfflineReport } from './engine/state';
import { Starfield } from './components/Starfield';
import { Hud } from './components/Hud';
import { TabBar, type TabId } from './components/TabBar';
import { FxLayer } from './components/FxLayer';
import { QuestRailStrip } from './components/QuestRailStrip';
import { MarketScreen } from './components/MarketScreen';
import { MapScreen } from './components/MapScreen';
import { YardScreen } from './components/YardScreen';
import { ShipScreen } from './components/ShipScreen';
import { MoreScreen } from './components/MoreScreen';
import { EncounterModal } from './components/EncounterModal';
import { JackpotModal } from './components/JackpotModal';
import { OfflineModal } from './components/OfflineModal';
import { Onboarding } from './components/Onboarding';
import { emit, onUiEvent } from './engine/bus';
import { dressStationForSector } from './engine/sectorgen';
import { setStationAmbience } from './engine/audio';
import { generateSectorMap, nodeById, WAYPOINT_THEME } from './engine/mapgen';
import { acknowledgeRimClamp } from './engine/actions';

export function App() {
  const s = store.value;
  const [tab, setTab] = useState<TabId>('market');
  const [shake, setShake] = useState(false);
  const [hyperspace, setHyperspace] = useState(false);
  const [activeEncounterId, setActiveEncounterId] = useState<string | null>(null);
  const [activeJackpotId, setActiveJackpotId] = useState<string | null>(null);
  const [activeOfflineReport, setActiveOfflineReport] = useState<PendingOfflineReport | null>(s.pendingOfflineReport);

  useEffect(
    () =>
      onUiEvent((e) => {
        if (e.type === 'shake') {
          setShake(true);
          setTimeout(() => setShake(false), 320);
        }
      }),
    []
  );

  useEffect(() => {
    if (s.pendingEncounter) setActiveEncounterId(s.pendingEncounter.encounterId);
  }, [s.pendingEncounter?.rolledAt]);

  useEffect(() => {
    if (s.pendingJackpot) setActiveJackpotId(s.pendingJackpot.jackpotId);
  }, [s.pendingJackpot?.triggeredAt]);

  useEffect(() => {
    if (s.pendingOfflineReport) setActiveOfflineReport(s.pendingOfflineReport);
  }, [s.pendingOfflineReport]);

  useEffect(() => {
    if (!s.pendingRimClamp) return;
    emit({ type: 'sfx', id: 'eternal' });
    emit({ type: 'confetti', power: 'big' });
    emit({ type: 'toast', text: 'The charts end at Sector 99 now — and you were already past it. RIM WALKER + BEYOND THE RIM earned.', icon: '🗿' });
    acknowledgeRimClamp();
  }, [s.pendingRimClamp]);

  const map = generateSectorMap(s.sector, s.runSeed ?? 0);
  const node = nodeById(map, s.currentStation);
  const station = node?.kind === 'station' ? STATIONS_BY_ID[s.currentStation] : undefined;
  const theme = station?.theme ?? WAYPOINT_THEME;
  const dressing = station ? dressStationForSector(s.currentStation, s.sector, s.runSeed ?? 0) : { name: node?.name ?? '', hueShift: 0 };

  useEffect(() => {
    const shell = document.getElementById('app-shell-el');
    if (shell) {
      shell.style.setProperty('--bg', theme.bg);
      shell.style.setProperty('--surface', theme.surface);
      shell.style.setProperty('--accent', theme.accent);
      shell.style.setProperty('--accent2', theme.accent2);
      shell.style.setProperty('--text', theme.text);
      shell.style.setProperty('--glow', theme.glow);
      shell.style.setProperty('--sector-hue', `${dressing.hueShift}deg`);
    }
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.setAttribute('content', theme.bg);
    setStationAmbience(s.currentStation, theme.motif, theme.ambienceType);
  }, [s.currentStation, s.sector]);

  function renderScreen() {
    switch (tab) {
      case 'market': return <MarketScreen />;
      case 'map': return <MapScreen onHyperspace={setHyperspace} onArrive={() => setTab('market')} />;
      case 'ship': return <ShipScreen />;
      case 'yard': return <YardScreen />;
      case 'more': return <MoreScreen />;
      default: return null;
    }
  }

  return (
    <div id="app-shell-el" class={`app-shell${shake ? ' shake' : ''}${s.settings.reducedMotion ? ' reduced-motion' : ''}`}>
      <Starfield
        hue={theme.particleHue}
        overlay={theme.overlay}
        hyperspace={hyperspace}
        reducedMotion={s.settings.reducedMotion}
      />
      <Hud />
      {renderScreen()}
      <QuestRailStrip />
      <TabBar active={tab} onChange={setTab} />
      <FxLayer />
      {activeEncounterId && <EncounterModal encounterId={activeEncounterId} onDone={() => setActiveEncounterId(null)} />}
      {activeJackpotId && <JackpotModal jackpotId={activeJackpotId} onDone={() => setActiveJackpotId(null)} />}
      {activeOfflineReport && <OfflineModal report={activeOfflineReport} onDone={() => setActiveOfflineReport(null)} />}
      <Onboarding />
    </div>
  );
}
