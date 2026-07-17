import { store } from '../engine/store';
import { updateSettings } from '../engine/actions';

export function OptionsScreen() {
  const s = store.value;

  return (
    <div class="card">
      <div class="card-header"><span class="ch-icon">⚙️</span>SETTINGS</div>
      <div class="toggle-row">
        <span>Chill Mode (softer FOMO)</span>
        <button class={`toggle${s.settings.chillMode ? ' on' : ''}`} onClick={() => updateSettings({ chillMode: !s.settings.chillMode })}><span class="knob" /></button>
      </div>
      <div class="toggle-row">
        <span>Reduced Motion</span>
        <button class={`toggle${s.settings.reducedMotion ? ' on' : ''}`} onClick={() => updateSettings({ reducedMotion: !s.settings.reducedMotion })}><span class="knob" /></button>
      </div>
      <div class="toggle-row">
        <span>Haptics</span>
        <button class={`toggle${s.settings.haptics ? ' on' : ''}`} onClick={() => updateSettings({ haptics: !s.settings.haptics })}><span class="knob" /></button>
      </div>
      <div class="toggle-row">
        <span>Mute All Audio</span>
        <button class={`toggle${s.settings.muted ? ' on' : ''}`} onClick={() => updateSettings({ muted: !s.settings.muted })}><span class="knob" /></button>
      </div>
      <div class="toggle-row">
        <span style={{ flex: 1 }}>SFX Volume</span>
        <input type="range" min={0} max={1} step={0.05} value={s.settings.sfxVolume} style={{ width: 110 }}
          onInput={(e) => updateSettings({ sfxVolume: Number((e.target as HTMLInputElement).value) })} />
      </div>
      <div class="toggle-row">
        <span style={{ flex: 1 }}>Ambience Volume</span>
        <input type="range" min={0} max={1} step={0.05} value={s.settings.ambienceVolume} style={{ width: 110 }}
          onInput={(e) => updateSettings({ ambienceVolume: Number((e.target as HTMLInputElement).value) })} />
      </div>
      <div class="toggle-row">
        <span style={{ flex: 1 }}>Music Volume</span>
        <input type="range" min={0} max={1} step={0.05} value={s.settings.musicVolume} style={{ width: 110 }}
          onInput={(e) => updateSettings({ musicVolume: Number((e.target as HTMLInputElement).value) })} />
      </div>
    </div>
  );
}
