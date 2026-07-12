import { render } from 'preact';
import { App } from './app';
import { bootGame, startGameLoop } from './engine/actions';
import { initAudio, refreshAudioVolumes } from './engine/audio';
import { initHaptics } from './engine/haptics';
import { initInstallPrompt } from './engine/installPrompt';
import './style.css';

bootGame();
startGameLoop();
initAudio();
initHaptics();
initInstallPrompt();
refreshAudioVolumes();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Relative, not '/sw.js' — an absolute root path breaks if this is ever hosted
    // from a subdirectory (e.g. a GitHub Pages project site), since it would resolve
    // against the domain root instead of wherever this file actually lives.
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline install is a nice-to-have, not required for gameplay */
    });
  });
}

const root = document.getElementById('app');
if (root) render(<App />, root);
