// Deferred "Add to Home Screen" — earned, not nagged. Fired once, after the
// player hires their first manager (the moment the game's thesis lands).
// Spec §15.2.
import { emit } from './bus';

let deferredPrompt: any = null;
let offered = false;

export function initInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e;
  });
}

export function maybeOfferInstall(): void {
  if (offered) return;
  offered = true;
  if (deferredPrompt) {
    emit({ type: 'toast', text: 'JUNKRUN runs great as an app. Add it to your home screen! 📲', icon: '📲' });
    try {
      deferredPrompt.prompt();
    } catch {
      /* some browsers require a direct user gesture — the toast still informs them */
    }
  }
}
