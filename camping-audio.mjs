const MUTE_PREFERENCE = 'last-piece-camp-muted';
const VOLUME_PREFERENCE = 'last-piece-volume';
const STYLE_PREFERENCE = 'last-piece-sound-style';
const DEFAULT_VOLUME = 75;

// Original eight-bar D-major loop. Each bar has a bass note, a voicing, and eight melody slots.
const CAMP_SONG = [
  [50, [57, 62, 64, 66], [69, null, 66, 64, 62, null, 66, 69]],
  [49, [57, 61, 64, 69], [71, 69, null, 64, 66, null, 64, null]],
  [47, [54, 57, 62, 66], [66, null, 74, 71, 69, null, 66, 62]],
  [43, [55, 59, 62, 66], [67, null, 66, 62, 59, null, 62, null]],
  [42, [57, 62, 64, 66], [62, 66, 69, null, 76, null, 74, 69]],
  [40, [52, 55, 59, 62], [71, null, 74, 71, 67, 64, null, 62]],
  [43, [55, 59, 62, 66], [67, 66, null, 62, 71, null, 69, 67]],
  [45, [57, 62, 64, 69], [64, null, 62, 64, 61, null, 64, 66]],
];

const BRIGHT_SONG = [
  [53, [60, 65, 69, 72], [77, 76, 72, null, 69, 72, 74, 76]],
  [57, [57, 60, 64, 67], [76, null, 74, 72, 76, null, 79, 76]],
  [58, [58, 62, 65, 69], [77, 74, 70, 69, 67, null, 69, 70]],
  [48, [55, 60, 64, 70], [72, null, 74, 76, 79, 76, 72, null]],
];

const WOOD_SONG = [
  [43, [55, 58, 62, 65], [62, null, null, 58, 55, null, 58, null]],
  [46, [53, 58, 62, 65], [65, null, 62, null, 60, null, 58, null]],
  [48, [55, 60, 63, 67], [63, null, 60, 58, null, 55, 60, null]],
  [41, [53, 57, 60, 65], [57, null, 60, null, 62, 60, 57, null]],
];

const STYLES = {
  camp: {
    song: CAMP_SONG, eighth: 30 / 90, harmonics: [0, 1, 0.38, 0.19, 0.10, 0.045, 0.025],
    cutoff: [3200, 820], sustain: 1, clickType: 'triangle', clickPitch: 1, noisePitch: 1, chimeOffset: 0,
  },
  bright: {
    song: BRIGHT_SONG, eighth: 30 / 116, harmonics: [0, 1, 0.18, 0.05, 0.34, 0.29, 0.08, 0.04],
    cutoff: [5900, 1800], sustain: 0.88, clickType: 'sine', clickPitch: 1.45, noisePitch: 1.7, chimeOffset: 7,
  },
  wood: {
    song: WOOD_SONG, eighth: 30 / 76, harmonics: [0, 1, 0.49, 0.034, 0.12, 0.012],
    cutoff: [1700, 480], sustain: 0.64, clickType: 'sine', clickPitch: 0.72, noisePitch: 0.55, chimeOffset: -12,
  },
};

function readPreference(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; }
  catch { return fallback; }
}

function savePreference(key, value) {
  try { localStorage.setItem(key, String(value)); } catch {}
}

function volumePercent(value) {
  const percent = Number(value);
  return Number.isFinite(percent) ? Math.min(100, Math.max(0, Math.round(percent))) : DEFAULT_VOLUME;
}

export function createGameAudio(button) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const settings = document.getElementById('sound-settings');
  const enabledControl = document.getElementById('sound-enabled');
  const volumeControl = document.getElementById('sound-volume');
  const volumeOutput = document.getElementById('sound-volume-value');
  const styleControls = [...(settings?.querySelectorAll('input[name="sound-style"]') ?? [])];
  const voices = new Map();
  let context;
  let master;
  let music;
  let effects;
  let pluckWaves;
  let texture;
  let muted = readPreference(MUTE_PREFERENCE, '0') === '1';
  let volume = volumePercent(readPreference(VOLUME_PREFERENCE, DEFAULT_VOLUME));
  const savedStyle = readPreference(STYLE_PREFERENCE, 'camp');
  let style = Object.hasOwn(STYLES, savedStyle) ? savedStyle : 'camp';
  let timer = null;
  let step = 0;
  let nextNote = 0;
  let pendingEffect;

  function allowed() {
    return !muted && volume > 0 && !document.hidden;
  }

  function updateControls() {
    const audible = Boolean(AudioContextClass) && !muted && volume > 0;
    if (button) {
      button.disabled = !AudioContextClass;
      button.dataset.enabled = String(audible);
      button.dataset.state = !AudioContextClass ? 'unavailable' : !audible ? 'muted'
        : allowed() && context?.state === 'running' ? 'on' : 'ready';
      button.setAttribute('aria-expanded', String(Boolean(settings?.open)));
      button.setAttribute('aria-label', '声音设置');
    }
    if (enabledControl) enabledControl.checked = !muted;
    if (volumeControl) volumeControl.value = String(volume);
    if (volumeOutput) volumeOutput.textContent = `${volume}%`;
    for (const control of styleControls) control.checked = control.value === style;
  }

  function voice(source, target, at, decay, volume, filter) {
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(volume, at + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    if (filter) {
      source.connect(filter);
      filter.connect(envelope);
    } else {
      source.connect(envelope);
    }
    envelope.connect(target);
    voices.set(source, target);
    source.onended = () => {
      voices.delete(source);
      source.disconnect();
      filter?.disconnect();
      envelope.disconnect();
    };
    source.start(at);
    source.stop(at + decay + 0.012);
  }

  function pluck(midi, at, decay, volume, target = music) {
    const preset = STYLES[style];
    const pitch = target === music ? midi : midi + preset.chimeOffset;
    const length = decay * preset.sustain;
    const oscillator = context.createOscillator();
    oscillator.setPeriodicWave(pluckWaves[style]);
    oscillator.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
    const filter = context.createBiquadFilter();
    filter.frequency.setValueAtTime(preset.cutoff[0], at);
    filter.frequency.exponentialRampToValueAtTime(preset.cutoff[1], at + length);
    voice(oscillator, target, at, length, volume, filter);
  }

  function click(from, to, at, decay, volume) {
    const preset = STYLES[style];
    const length = decay * preset.sustain;
    const oscillator = context.createOscillator();
    oscillator.type = preset.clickType;
    oscillator.frequency.setValueAtTime(from * preset.clickPitch, at);
    oscillator.frequency.exponentialRampToValueAtTime(to * preset.clickPitch, at + length);
    voice(oscillator, effects, at, length, volume);
  }

  function rustle(frequency, at, decay, volume) {
    const preset = STYLES[style];
    const source = context.createBufferSource();
    source.buffer = texture;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency * preset.noisePitch;
    filter.Q.value = 0.75;
    voice(source, effects, at, decay * preset.sustain, volume, filter);
  }

  const sounds = {
    pick(at) { rustle(2100, at, 0.09, 0.10); click(430, 360, at, 0.052, 0.075); },
    rotate(at) { click(720, 420, at, 0.052, 0.10); click(590, 340, at + 0.039, 0.059, 0.083); },
    place(at) { click(210, 98, at, 0.115, 0.16); rustle(1150, at, 0.055, 0.078); },
    reject(at) { click(171, 102, at, 0.11, 0.118); click(133, 78, at + 0.064, 0.104, 0.082); },
    undo(at) { pluck(60, at, 0.146, 0.076, effects); pluck(67, at + 0.052, 0.18, 0.092, effects); },
    reset(at) { pluck(66, at, 0.17, 0.09, effects); pluck(62, at + 0.073, 0.20, 0.105, effects); },
    hatch(at) { rustle(540, at, 0.22, 0.11); click(124, 48, at + 0.39, 0.19, 0.25); rustle(1900, at + 0.418, 0.071, 0.075); },
    win(at) { [62, 66, 69, 74].forEach((note, i) => pluck(note, at + i * 0.077, 0.42, 0.126, effects)); },
  };

  function scheduleMusic() {
    if (!allowed() || context.state !== 'running') return;
    const { song, eighth } = STYLES[style];
    // Skip an expired scheduling window after a mobile tab or event loop pause.
    if (nextNote < context.currentTime) nextNote = context.currentTime + 0.04;
    while (nextNote < context.currentTime + 0.24) {
      const beat = step % 8;
      const [bass, chord, melody] = song[Math.floor(step / 8)];
      if (beat === 0 || beat === 4) {
        pluck(bass + (beat === 4 ? 12 : 0), nextNote, 0.68, beat === 0 ? 0.12 : 0.074);
      }
      if (beat === 2 || beat === 6) {
        chord.forEach((note, i) => pluck(note, nextNote + i * 0.019, 0.56, 0.041));
      }
      if (melody[beat]) pluck(melody[beat], nextNote, 0.43, beat % 2 === 0 ? 0.117 : 0.089);
      nextNote += eighth;
      step = (step + 1) % (song.length * 8);
    }
  }

  function refresh() {
    if (allowed() && context?.state === 'running') {
      if (timer === null) {
        nextNote = context.currentTime + 0.045;
        scheduleMusic();
        timer = setInterval(scheduleMusic, 100);
      }
      const effect = pendingEffect;
      pendingEffect = undefined;
      if (effect && performance.now() - effect.time < 330) {
        sounds[effect.name](context.currentTime + 0.01);
      }
    } else {
      clearInterval(timer);
      timer = null;
      if (!allowed() && context?.state === 'running') {
        // Unmuting or returning to the tab can happen while suspension is pending.
        context.suspend().then(() => wake()).catch(() => {});
      }
    }
    updateControls();
  }

  function wake(gesture = false) {
    if (!allowed() || !AudioContextClass || (!context && !gesture)) return;
    try {
      if (!context) {
        context = new AudioContextClass();
        master = context.createGain();
        master.gain.value = volume / 100;
        master.connect(context.destination);
        music = context.createGain();
        music.gain.value = 0.38;
        music.connect(master);
        effects = context.createGain();
        effects.gain.value = 0.76;
        effects.connect(master);
        pluckWaves = Object.fromEntries(Object.entries(STYLES).map(([name, preset]) => [name,
          context.createPeriodicWave(new Float32Array(preset.harmonics.length), new Float32Array(preset.harmonics)),
        ]));
        texture = context.createBuffer(1, Math.ceil(context.sampleRate * 0.35), context.sampleRate);
        const channel = texture.getChannelData(0);
        for (let i = 0; i < channel.length; i += 1) channel[i] = Math.random() * 2 - 1;
        context.addEventListener('statechange', refresh);
      }
      if (context.state === 'running') refresh();
      else context.resume().then(refresh).catch(updateControls);
    } catch {
      updateControls();
    }
  }

  function pause() {
    pendingEffect = undefined;
    for (const source of voices.keys()) source.stop();
    refresh();
  }

  function play(name) {
    if (!allowed() || !AudioContextClass || !Object.hasOwn(sounds, name)) return;
    if (context?.state === 'running') sounds[name](context.currentTime + 0.01);
    else pendingEffect = { name, time: performance.now() };
  }

  function onGesture(event) {
    if (!event.isTrusted) return;
    // Touch unlocks on release, while a real mouse can play the pickup cue on press.
    if (event.type === 'pointerdown' && event.pointerType !== 'mouse') return;
    if (context?.state !== 'running' || timer === null) wake(true);
  }

  for (const name of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
    document.addEventListener(name, onGesture, true);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else wake();
  });

  button?.addEventListener('click', (event) => {
    if (settings && !settings.open) settings.showModal();
    wake(event.isTrusted);
    updateControls();
  });
  document.getElementById('sound-close')?.addEventListener('click', () => settings?.close());
  settings?.addEventListener('close', updateControls);

  enabledControl?.addEventListener('change', (event) => {
    muted = !enabledControl.checked;
    savePreference(MUTE_PREFERENCE, muted ? '1' : '0');
    if (muted) pause();
    else wake(event.isTrusted);
    updateControls();
  });

  volumeControl?.addEventListener('input', (event) => {
    const previous = volume;
    volume = volumePercent(volumeControl.value);
    if (volume !== previous) savePreference(VOLUME_PREFERENCE, volume);
    if (master) {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(volume / 100, now, 0.018);
    }
    if (volume === 0) pause();
    else if (previous === 0) wake(event.isTrusted);
    updateControls();
  });
  volumeControl?.addEventListener('change', () => play('place'));

  for (const control of styleControls) {
    control.addEventListener('change', (event) => {
      if (!control.checked || control.value === style || !Object.hasOwn(STYLES, control.value)) return;
      style = control.value;
      savePreference(STYLE_PREFERENCE, style);
      step = 0;
      for (const [source, target] of voices) {
        if (target === music) source.stop();
      }
      if (allowed() && context?.state === 'running') {
        nextNote = context.currentTime + 0.045;
        scheduleMusic();
      }
      wake(event.isTrusted);
      play('place');
      updateControls();
    });
  }
  updateControls();

  return { play };
}
