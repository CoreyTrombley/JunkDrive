import { useEffect } from 'preact/hooks';
import { store } from '../engine/store';
import { setOnboardingStep, completeOnboarding } from '../engine/actions';
import { unlockAudio } from '../engine/audio';

const STEP_TEXT: Record<number, string> = {
  1: '🐜 Rust Harbor is stocked. Buy 3 Scrap Metal on the MARKET tab to get started.',
  2: '🚀 Now jump to Neon Bazaar on the MAP tab — new place, new prices, new sound.',
  3: '💰 Sell that scrap here for a profit. Watch the number move.',
  4: '🏗️ Rank 3 unlocks THE YARD — your idle income HQ.',
  5: '🤖 At the Yard: buy a Vending Drone, then tap it a few times to run it by hand.',
  6: '⏳ Once you can afford it, hire CLAMP. It earns while you fly — even offline.',
  7: "✅ You're set. Keep flipping, keep climbing. The Drift is endless.",
};

export function Onboarding() {
  const s = store.value;
  const step = s.onboarding.step;

  useEffect(() => {
    if (step === 1 && (s.cargo['scrap_metal']?.qty ?? 0) >= 3) setOnboardingStep(2);
    else if (step === 2 && s.codex.stations['neon_bazaar']) setOnboardingStep(3);
    else if (step === 3 && s.stats.totalSales >= 1) setOnboardingStep(4);
    else if (step === 4 && s.rank >= 3) setOnboardingStep(5);
    else if (step === 5 && (s.rigs['vending_drones']?.owned ?? 0) >= 1) setOnboardingStep(6);
    else if (step === 6 && s.rigs['vending_drones']?.managed) setOnboardingStep(7);
  });

  useEffect(() => {
    if (step === 7) {
      const id = setTimeout(() => completeOnboarding(false), 4500);
      return () => clearTimeout(id);
    }
  }, [step]);

  if (s.onboarding.complete) return null;

  if (step === 0) {
    return (
      <div class="sheet-backdrop center">
        <div class="card-modal" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 44 }}>🚀</div>
          <h2 style={{ margin: '10px 0' }}>JUNKRUN</h2>
          <p style={{ whiteSpace: 'pre-line', opacity: 0.85, fontSize: 13, lineHeight: 1.5 }}>
            You own a ship. Barely.{'\n'}The Drift is full of junk.{'\n'}Junk is full of money.
          </p>
          <button
            class="btn btn-primary btn-block"
            onClick={() => { unlockAudio(); setOnboardingStep(1); }}
          >
            LAUNCH 🚀
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="onboarding-banner">
      {STEP_TEXT[step] ?? ''}
      <div class="ob-skip" onClick={() => completeOnboarding(true)}>Skip tutorial ✕</div>
    </div>
  );
}
