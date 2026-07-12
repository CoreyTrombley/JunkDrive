// 100% synthesized SFX via Web Audio — spec §14.2. Zero audio files.
import { effect } from '@preact/signals';
import { onUiEvent, type SfxId, type UiEvent } from './bus';
import { getState } from './store';
import type { Ambience } from '../config/types';

const SEMITONE = Math.pow(2, 1 / 12);

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  startFreq?: number;
  delay?: number;
  detuneCents?: number;
  bus?: GainNode | null;
}

interface NoiseOpts {
  gain?: number;
  delay?: number;
  filterType?: BiquadFilterType;
  filterFreq?: number;
  filterFreqEnd?: number;
  filterQ?: number;
}

// ---------------------------------------------------------------------------
// Station ambience — a quiet sustained bed (for warmth/glue) plus a real
// sequenced melodic voice on top, so each station plays an actual little
// repeating tune built from its own `motif`, instead of one static dyad.
// ---------------------------------------------------------------------------

interface AmbiencePattern {
  stepMs: number;                 // ms between sequencer steps
  waveform: OscillatorType;       // melody voice timbre
  noteDur: number;                // seconds each melody note rings
  gain: number;                   // peak gain per melody note
  degrees: (number | null)[];     // scale-degree index per step, null = rest
  bedGain: number;                // gain of the sustained foundation under the melody
  bedWave: OscillatorType;
  shimmer?: boolean;              // adds a quiet octave-up partial (bell-like ring)
  detuneJitter?: number;          // ± cents of random detune per note (eerie/glitchy)
}

const AMBIENCE_PATTERNS: Record<Ambience, AmbiencePattern> = {
  // Rust Harbor — industrial home base: a driving low pulse with an occasional accent.
  thrum: { stepMs: 340, waveform: 'triangle', noteDur: 0.22, gain: 0.09, bedGain: 0.13, bedWave: 'sawtooth', degrees: [0, null, 0, 2, 0, null, 1, null] },
  // Neon Bazaar — bright, chattery market noise: fast bouncy upper-register hits.
  plink: { stepMs: 210, waveform: 'sine', noteDur: 0.16, gain: 0.07, bedGain: 0.05, bedWave: 'sine', degrees: [2, 4, 1, 3, null, 2, 4, null] },
  // Frostdock — icy and spacious: sparse ringing bell tones with a shimmering overtone.
  bell: { stepMs: 900, waveform: 'sine', noteDur: 1.1, gain: 0.11, bedGain: 0.04, bedWave: 'sine', degrees: [0, null, null, 2, null, 4, null, null], shimmer: true },
  // The Greenhouse — organic and breathing: a slow overlapping chord that swells and shifts.
  pad: { stepMs: 1400, waveform: 'sine', noteDur: 2.6, gain: 0.08, bedGain: 0.12, bedWave: 'sine', degrees: [0, 2, 4, 2] },
  // Ember Works — the forge never sleeps: rhythmic hammer-stab hits, short and percussive.
  stab: { stepMs: 500, waveform: 'sawtooth', noteDur: 0.14, gain: 0.12, bedGain: 0.09, bedWave: 'sawtooth', degrees: [0, null, 0, null, 2, null, 0, 4] },
  // Halo Court — opulent and sparkly: a classic up-down arpeggio, glittering and fast.
  arp: { stepMs: 160, waveform: 'triangle', noteDur: 0.13, gain: 0.075, bedGain: 0.05, bedWave: 'sine', degrees: [0, 1, 2, 3, 4, 3, 2, 1] },
  // The Signal — mysterious broadcast: a low detuned drone bed with a sparse, eerie phrase.
  drone: { stepMs: 1800, waveform: 'sine', noteDur: 1.6, gain: 0.09, bedGain: 0.15, bedWave: 'sawtooth', degrees: [0, null, null, null, 3, null, 1, null], detuneJitter: 18 },
};

/** Normalizes any station's 2-4 note motif into a fixed 5-degree scale (wrapping up an
 *  octave each time the motif repeats), so the same index-based patterns above work for
 *  every station while still sounding like *that station's* own musical signature. */
function buildScale(motif: number[]): number[] {
  const base = motif && motif.length ? motif : [220, 277];
  const degrees = 5;
  const scale: number[] = [];
  for (let i = 0; i < degrees; i++) {
    const octave = Math.floor(i / base.length);
    scale.push(base[i % base.length] * Math.pow(2, octave));
  }
  return scale;
}

class Synth {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxGain: GainNode | null = null;
  ambienceBus: GainNode | null = null;
  musicBus: GainNode | null = null;
  noiseBuffer: AudioBuffer | null = null;

  ambienceOsc: OscillatorNode[] = [];
  ambienceEnv: GainNode | null = null;
  ambienceTimer: number | null = null;
  currentAmbienceKey: string | null = null;
  private lastAmbience: { key: string; motif: number[]; type: Ambience } | null = null;

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(ctx.destination);
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.7;
    this.sfxGain.connect(this.master);
    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = 0.2;
    this.ambienceBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.2;
    this.musicBus.connect(this.master);
    this.noiseBuffer = this.makeNoiseBuffer(ctx);
    return ctx;
  }

  private makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  unlock(): void {
    const ctx = this.ensureCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  /** Tab/PWA backgrounded — freeze the whole graph rather than letting the ambience bed
   *  (raw oscillators with no scheduled stop) keep humming unheard. Also cancels the
   *  ambience sequencer's pending setTimeout so it doesn't queue up a burst of notes
   *  that would all land at once when the context's clock resumes. */
  suspendForBackground(): void {
    if (this.ambienceTimer) {
      clearTimeout(this.ambienceTimer);
      this.ambienceTimer = null;
    }
    // No state check before calling: suspend() on an already-suspended (or not-yet-
    // resumed) context is a harmless no-op per spec, and skipping the call when we're
    // unsure of the current state risks leaving it running.
    this.ctx?.suspend().catch(() => {
      /* some browsers reject if the context is mid-transition — harmless, next
         visibilitychange or SFX will settle it */
    });
  }

  /** Tab/PWA foregrounded again — resume the audio clock and cleanly restart the
   *  ambience sequencer (its timer loop was torn down on suspend, and its closure
   *  can't be resumed in place), rather than leaving it silently stalled forever. */
  resumeFromBackground(): void {
    if (!this.ctx) return;
    this.ctx.resume().catch(() => {});
    if (this.lastAmbience) {
      const { key, motif, type } = this.lastAmbience;
      this.currentAmbienceKey = null; // bypass the same-key no-op guard so it truly restarts
      this.startAmbience(key, motif, type);
    }
  }

  setVolumes(sfx: number, ambience: number, music: number, muted: boolean): void {
    if (!this.sfxGain || !this.ambienceBus || !this.musicBus) return;
    this.sfxGain.gain.value = muted ? 0 : sfx;
    this.ambienceBus.gain.value = muted ? 0 : ambience;
    this.musicBus.gain.value = muted ? 0 : music;
  }

  duck(active: boolean): void {
    if (!this.ambienceBus || !this.musicBus || !this.ctx) return;
    const t = this.ctx.currentTime;
    const s = getState().settings;
    this.ambienceBus.gain.cancelScheduledValues(t);
    this.ambienceBus.gain.linearRampToValueAtTime(active ? s.ambienceVolume * 0.5 : s.ambienceVolume, t + (active ? 0.05 : 0.4));
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.linearRampToValueAtTime(active ? s.musicVolume * 0.5 : s.musicVolume, t + (active ? 0.05 : 0.4));
  }

  private tone(freq: number, dur: number, opts: ToneOpts = {}): void {
    const ctx = this.ctx;
    const bus = opts.bus ?? this.sfxGain;
    if (!ctx || !bus) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    if (opts.startFreq) {
      osc.frequency.setValueAtTime(Math.max(1, opts.startFreq), t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq), t0 + dur);
    } else {
      osc.frequency.setValueAtTime(freq, t0);
    }
    if (opts.detuneCents) osc.detune.setValueAtTime(opts.detuneCents, t0);
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.015, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  private noise(dur: number, opts: NoiseOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = ctx.createBiquadFilter();
    filt.type = opts.filterType ?? 'bandpass';
    filt.frequency.setValueAtTime(opts.filterFreq ?? 2000, t0);
    if (opts.filterFreqEnd) filt.frequency.exponentialRampToValueAtTime(Math.max(1, opts.filterFreqEnd), t0 + dur);
    filt.Q.value = opts.filterQ ?? 1;
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.18;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  play(id: SfxId, evt: Extract<UiEvent, { type: 'sfx' }>): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    switch (id) {
      case 'tap':
        this.tone(1200, 0.03, { type: 'square', gain: 0.12 });
        break;
      case 'buy':
        this.tone(300, 0.08, { type: 'triangle', startFreq: 600, gain: 0.18 });
        break;
      case 'sell':
        this.tone(659.25, 0.12, { gain: 0.22 });
        this.tone(783.99, 0.12, { gain: 0.18, delay: 0.02 });
        this.noise(0.05, { gain: 0.1, filterType: 'highpass', filterFreq: 4000 });
        break;
      case 'lucky_flip':
        this.tone(659.25, 0.1, { gain: 0.22 });
        this.tone(783.99, 0.1, { gain: 0.18, delay: 0.02 });
        [880, 1046.5, 1318.5].forEach((f, i) => this.tone(f, 0.12, { gain: 0.16, delay: 0.08 + i * 0.07 }));
        this.noise(0.3, { gain: 0.12, filterType: 'highpass', filterFreq: 6000, filterFreqEnd: 12000, delay: 0.05 });
        break;
      case 'streak_up': {
        const stack = evt.data ?? 1;
        this.tone(440 * Math.pow(SEMITONE, stack * 2), 0.08, { type: 'square', gain: 0.14 });
        break;
      }
      case 'streak_break':
        this.tone(80, 0.3, { type: 'sawtooth', startFreq: 200, gain: 0.16 });
        break;
      case 'rank_up':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.18, { gain: 0.2, delay: i * 0.09 }));
        this.noise(0.5, { gain: 0.08, filterType: 'highpass', filterFreq: 8000, delay: 0.25 });
        break;
      case 'quest_claim':
        this.tone(523.25, 0.1, { gain: 0.2 });
        this.tone(783.99, 0.16, { gain: 0.22, delay: 0.11 });
        break;
      case 'jump':
        this.noise(1.4, { gain: 0.15, filterType: 'bandpass', filterFreq: 200, filterFreqEnd: 2200, filterQ: 0.7 });
        break;
      case 'arrival': {
        const motif = evt.stationMotif ?? [440, 554];
        motif.forEach((f, i) => this.tone(f, 0.22, { gain: 0.15, delay: i * 0.09 }));
        break;
      }
      case 'event_card':
        this.tone(220, 0.4, { gain: 0.12 });
        this.noise(0.15, { gain: 0.06, filterType: 'highpass', filterFreq: 5000, delay: 0.2 });
        break;
      case 'jackpot':
        this.tone(60, 0.5, { gain: 0.35 });
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(f, 0.15, { gain: 0.18, delay: 0.1 + i * 0.06 }));
        this.noise(0.6, { gain: 0.18, filterType: 'highpass', filterFreq: 3000, delay: 0.1 });
        break;
      case 'coin_cascade': {
        const n = 8 + Math.floor(Math.random() * 7);
        for (let i = 0; i < n; i++) {
          const semis = Math.random() * 6 - 3;
          this.tone(1046.5 * Math.pow(SEMITONE, semis), 0.09, { gain: 0.14, delay: i * 0.06 });
        }
        break;
      }
      case 'cant_afford':
        this.tone(100, 0.06, { type: 'square', gain: 0.15 });
        break;
      case 'wormhole':
        this.tone(30, 3, { startFreq: 400, gain: 0.3 });
        this.noise(2.5, { gain: 0.15, filterType: 'lowpass', filterFreq: 6000, filterFreqEnd: 200, delay: 0.3 });
        break;
      case 'toll':
        this.tone(90, 0.5, { startFreq: 260, gain: 0.25 });
        this.noise(0.3, { gain: 0.1, filterType: 'lowpass', filterFreq: 1200 });
        break;
    }
  }

  startAmbience(key: string, motif: number[], type: Ambience): void {
    this.lastAmbience = { key, motif, type };
    if (this.currentAmbienceKey === key) return;
    this.stopAmbience();
    const ctx = this.ensureCtx();
    if (!ctx || !this.ambienceBus) return;
    this.currentAmbienceKey = key;

    const cfg = AMBIENCE_PATTERNS[type] ?? AMBIENCE_PATTERNS.pad;
    const scale = buildScale(motif);
    const root = scale[0] / 2;

    // Quiet sustained foundation — a cushion under the melody, not the whole sound.
    const o1 = ctx.createOscillator();
    o1.type = cfg.bedWave;
    o1.frequency.value = root;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = root * 1.5;
    o2.detune.value = -6;

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 800;

    const env = ctx.createGain();
    env.gain.value = 0.0001;

    o1.connect(filt);
    o2.connect(filt);
    filt.connect(env);
    env.connect(this.ambienceBus);

    const t = ctx.currentTime;
    env.gain.linearRampToValueAtTime(cfg.bedGain, t + 1.5);

    o1.start();
    o2.start();
    this.ambienceOsc = [o1, o2];
    this.ambienceEnv = env;

    // The actual tune: a small sequencer stepping through a pattern built from the
    // station's own motif, so every station has real melodic movement, not just a hum.
    let step = 0;
    const advance = () => {
      const degree = cfg.degrees[step % cfg.degrees.length];
      if (degree !== null) {
        const octaveFlip = Math.random() < 0.12 ? 2 : 1;
        const freq = scale[degree] * octaveFlip;
        const detune = cfg.detuneJitter ? (Math.random() * 2 - 1) * cfg.detuneJitter : 0;
        this.tone(freq, cfg.noteDur, { type: cfg.waveform, gain: cfg.gain, detuneCents: detune, bus: this.musicBus });
        if (cfg.shimmer) {
          this.tone(freq * 2, cfg.noteDur * 0.6, { type: 'sine', gain: cfg.gain * 0.35, delay: 0.02, bus: this.musicBus });
        }
      }
      step++;
      this.ambienceTimer = window.setTimeout(advance, cfg.stepMs);
    };
    this.ambienceTimer = window.setTimeout(advance, cfg.stepMs * 0.5);
  }

  stopAmbience(): void {
    if (this.ambienceTimer) {
      clearTimeout(this.ambienceTimer);
      this.ambienceTimer = null;
    }
    this.currentAmbienceKey = null;
    const ctx = this.ctx;
    const oscs = this.ambienceOsc;
    const env = this.ambienceEnv;
    if (ctx && env) {
      const t = ctx.currentTime;
      try {
        env.gain.cancelScheduledValues(t);
        env.gain.linearRampToValueAtTime(0.0001, t + 0.4);
      } catch {
        /* ignore */
      }
    }
    this.ambienceOsc = [];
    this.ambienceEnv = null;
    if (oscs.length) {
      setTimeout(() => oscs.forEach((o) => {
        try { o.stop(); } catch { /* already stopped */ }
      }), 500);
    }
  }
}

export const audio = new Synth();

const DUCK_ON = new Set<SfxId>(['rank_up', 'jackpot', 'wormhole', 'lucky_flip']);

export function initAudio(): void {
  // Settings only live in reactive state (updateSettings just writes `store`) — without
  // this, moving the volume sliders or flipping Muted updated the UI but never touched
  // the actual Web Audio gain nodes, since setVolumes() was previously only ever called
  // once at boot/unlock. This keeps the real output in sync with settings from now on.
  effect(() => {
    const s = getState().settings;
    audio.setVolumes(s.sfxVolume, s.ambienceVolume, s.musicVolume, s.muted);
  });

  onUiEvent((e) => {
    if (e.type !== 'sfx') return;
    const s = getState().settings;
    if (s.muted) return;
    // A background setTimeout (e.g. a travel timer completing while the tab is hidden)
    // can still emit SFX events; play() would otherwise force-resume a suspended context
    // as a side effect, undoing the pause below the instant one fires.
    if (typeof document !== 'undefined' && document.hidden) return;
    audio.play(e.id, e);
    if (DUCK_ON.has(e.id)) {
      audio.duck(true);
      setTimeout(() => audio.duck(false), 1500);
    }
  });

  // Stop audio the instant the page/PWA is sent to the background — otherwise the
  // ambience bed (plain oscillators with no scheduled stop) keeps generating sound
  // that's inaudible in most browser tabs but can keep playing on some Android PWA
  // shells, plus it wastes battery either way. Picks back up cleanly on return.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) audio.suspendForBackground();
      else audio.resumeFromBackground();
    });
  }
}

export function unlockAudio(): void {
  audio.unlock();
  refreshAudioVolumes();
}

export function setStationAmbience(stationId: string, motif: number[], type: Ambience): void {
  audio.startAmbience(stationId, motif, type);
}

export function refreshAudioVolumes(): void {
  const s = getState().settings;
  audio.setVolumes(s.sfxVolume, s.ambienceVolume, s.musicVolume, s.muted);
}
