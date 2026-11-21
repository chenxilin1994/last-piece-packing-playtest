const SOUND_PREFERENCE = 'last-piece-camp-muted';
const EIGHTH = 60 / 90 / 2;

// Original eight-bar D-major loop. Each bar has a bass note, a voicing, and eight melody slots.
const SONG = [
  [50, [57, 62, 64, 66], [69, null, 66, 64, 62, null, 66, 69]],
  [49, [57, 61, 64, 69], [71, 69, null, 64, 66, null, 64, null]],
  [47, [54, 57, 62, 66], [66, null, 74, 71, 69, null, 66, 62]],
  [43, [55, 59, 62, 66], [67, null, 66, 62, 59, null, 62, null]],
  [42, [57, 62, 64, 66], [62, 66, 69, null, 76, null, 74, 69]],
  [40, [52, 55, 59, 62], [71, null, 74, 71, 67, 64, null, 62]],
  [43, [55, 59, 62, 66], [67, 66, null, 62, 71, null, 69, 67]],
  [45, [57, 62, 64, 69], [64, null, 62, 64, 61, null, 64, 66]],
];

function readMute() {
  try { return localStorage.getItem(SOUND_PREFERENCE) === '1'; }
  catch { return false; }
}

export function createGameAudio(button) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const voices = new Set();
  let context;
  let music;
  let effects;
  let pluckWave;
  let texture;
  let muted = readMute();
  let timer = null;
  let step = 0;
  let nextNote = 0;
  let pendingEffect;

  function allowed() {
    return !muted && !document.hidden;
  }

  function updateButton() {
    if (!button) return;
    const playing = allowed() && context?.state === 'running';
    button.disabled = !AudioContextClass;
    button.dataset.state = !AudioContextClass ? 'unavailable' : muted ? 'muted' : playing ? 'on' : 'ready';
    button.setAttribute('aria-pressed', String(playing));
    button.setAttribute('aria-label', playing ? '关闭声音' : '开启声音');
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
    voices.add(source);
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
    const oscillator = context.createOscillator();
    oscillator.setPeriodicWave(pluckWave);
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    const filter = context.createBiquadFilter();
    filter.frequency.setValueAtTime(3200, at);
    filter.frequency.exponentialRampToValueAtTime(820, at + decay);
    voice(oscillator, target, at, decay, volume, filter);
  }

  function click(from, to, at, decay, volume) {
    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(to, at + decay);
    voice(oscillator, effects, at, decay, volume);
  }

  function rustle(frequency, at, decay, volume) {
    const source = context.createBufferSource();
    source.buffer = texture;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.75;
    voice(source, effects, at, decay, volume, filter);
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
    // Skip an expired scheduling window after a mobile tab or event loop pause.
    if (nextNote < context.currentTime) nextNote = context.currentTime + 0.04;
    while (nextNote < context.currentTime + 0.24) {
      const beat = step % 8;
      const [bass, chord, melody] = SONG[Math.floor(step / 8)];
      if (beat === 0 || beat === 4) {
        pluck(bass + (beat === 4 ? 12 : 0), nextNote, 0.68, beat === 0 ? 0.12 : 0.074);
      }
      if (beat === 2 || beat === 6) {
        chord.forEach((note, i) => pluck(note, nextNote + i * 0.019, 0.56, 0.041));
      }
      if (melody[beat]) pluck(melody[beat], nextNote, 0.43, beat % 2 === 0 ? 0.117 : 0.089);
      nextNote += EIGHTH;
      step = (step + 1) % (SONG.length * 8);
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
    updateButton();
  }

  function wake(gesture = false) {
    if (!allowed() || !AudioContextClass || (!context && !gesture)) return;
    try {
      if (!context) {
        context = new AudioContextClass();
        music = context.createGain();
        music.gain.value = 0.38;
        music.connect(context.destination);
        effects = context.createGain();
        effects.gain.value = 0.76;
        effects.connect(context.destination);
        pluckWave = context.createPeriodicWave(
          new Float32Array(7), new Float32Array([0, 1, 0.38, 0.19, 0.10, 0.045, 0.025]),
        );
        texture = context.createBuffer(1, Math.ceil(context.sampleRate * 0.35), context.sampleRate);
        const channel = texture.getChannelData(0);
        for (let i = 0; i < channel.length; i += 1) channel[i] = Math.random() * 2 - 1;
        context.addEventListener('statechange', refresh);
      }
      if (context.state === 'running') refresh();
      else context.resume().then(refresh).catch(updateButton);
    } catch {
      updateButton();
    }
  }

  function pause() {
    pendingEffect = undefined;
    for (const source of voices) source.stop();
    refresh();
  }

  function onGesture(event) {
    if (!event.isTrusted || button?.contains(event.target)) return;
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

  button?.addEventListener('click', () => {
    muted = button.dataset.state === 'on';
    try { localStorage.setItem(SOUND_PREFERENCE, muted ? '1' : '0'); } catch {}
    if (muted) pause();
    else wake(true);
    updateButton();
  });
  updateButton();

  return {
    play(name) {
      if (!allowed() || !AudioContextClass || !Object.hasOwn(sounds, name)) return;
      if (context?.state === 'running') sounds[name](context.currentTime + 0.01);
      else pendingEffect = { name, time: performance.now() };
    },
  };
}
