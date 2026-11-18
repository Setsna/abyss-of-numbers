// Ton (Phase 5, Etappe 9): Klänge werden mit der Web-Audio-Schnittstelle des Browsers erzeugt,
// ohne Tondateien und ohne etwas von außen. Was wie klingt und welches Ereignis welchen Klang
// auslöst, steht in config/audio/sounds.json.
//
// Safari erlaubt Ton erst nach einer Berührung: Bis unlock() aufgerufen wurde, bleibt alles still.
// Ton (Klänge) und Musik (leise Unterwasser-Fläche) sind getrennt abschaltbar; die Lautstärke
// gilt für beides. „Weniger Bewegung“ betrifft den Ton nicht.

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

// Klangschlüssel für ein Ereignis: zuerst „typ:ergebnis“ bzw. „typ:raumart“, dann „typ“; sonst null.
export function soundKeyFor(event, map) {
  if (!event || !map) return null;
  const detail = event.outcome ?? event.roomType;
  if (detail !== undefined && `${event.type}:${detail}` in map) return map[`${event.type}:${detail}`];
  if (detail !== undefined && Object.keys(map).some((k) => k.startsWith(`${event.type}:`))) return null;
  return map[event.type] ?? null;
}

// context: Funktion, die einen AudioContext liefert (im Browser () => new AudioContext()).
// timers, random: austauschbar für Tests (Blasen werden mit setTimeout zufällig geplant).
//
// Hintergrundklang je Ort (setScene, nach Ingos Probespiel 17.11.2026): Meeresrauschen (gefiltertes
// Rauschen, das langsam an- und abschwillt), tiefes Brummen und ab und zu Blubberblasen.
// Werte je Station und Gebiet in sounds.json → ambience. Hängt am Schalter „Musik“.
//
// Musikstücke (D35, 18.11.2026): Gibt es für den Ort ein Stück (sounds.json → tracks) und kann das Spiel
// Dateien laden (loadTrack: url → ArrayBuffer), läuft statt des erzeugten Klangs das Stück in Schleife.
// Die Stücke sind als nahtlose Schleife geschnitten; der stille Vorlauf, den der AAC-Kodierer vorn anhängt,
// wird beim Abspielen übersprungen (loopStart), die Schleife ist genau loopSeconds lang.
// Lässt sich ein Stück nicht laden, klingt der erzeugte Hintergrund wie bisher.
// Ort 'boss' gibt es nur als Stück; ohne Stück klingt dort der Hintergrund der Station.
const FADE_IN = 1.2;
const FADE_OUT = 0.6;

// Beginn der Musik in einem dekodierten Stück (Sekunden): erste Stelle, an der ein Kanal hörbar wird
export function musicStart(buffer, threshold = 0.003) {
  const n = buffer.numberOfChannels ?? 1;
  let first = buffer.length;
  for (let c = 0; c < n; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < Math.min(first, d.length); i++) if (Math.abs(d[i]) > threshold) { first = i; break; }
  }
  return first >= buffer.length ? 0 : first / buffer.sampleRate;
}

export function createAudio({ sounds, enabled = true, music = false, volume = 1, context = null, timers = globalThis, random = Math.random, loadTrack = null } = {}) {
  let on = Boolean(enabled);
  let musicOn = Boolean(music);
  let vol = clamp01(volume);
  let ctx = null;
  let master = null;
  let musicNodes = null;
  let noiseBuffer = null;
  let scene = 'base';

  const sceneOf = (id) => (sounds?.ambience?.[id] || sounds?.tracks?.[id] ? id : 'base');
  const trackCache = new Map(); // Ort → Versprechen auf den dekodierten Puffer (null, wenn es nicht klappt)

  function loadBuffer(id) {
    if (!trackCache.has(id)) {
      const tr = sounds.tracks[id];
      trackCache.set(id, Promise.resolve()
        .then(() => loadTrack(tr.file))
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => null));
    }
    return trackCache.get(id);
  }

  // Stück für den Ort starten; bis es geladen ist, bleibt es still. Klappt das Laden nicht, Ersatzklang.
  function startTrack(id) {
    const tr = sounds.tracks[id];
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, ctx.currentTime);
    bus.connect(master);
    const nodes = { bus, oscillators: [], sources: [], timer: null, track: id };
    musicNodes = nodes;
    loadBuffer(id).then((buffer) => {
      if (musicNodes !== nodes) return; // inzwischen anderer Ort oder Musik aus
      if (!buffer) { musicNodes = null; bus.disconnect?.(); startSynth(); return; }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const start = musicStart(buffer);
      src.loopStart = start;
      src.loopEnd = Math.min(buffer.duration, start + tr.loopSeconds);
      src.connect(bus);
      src.start(0, start);
      nodes.sources.push(src);
      bus.gain.setValueAtTime(0, ctx.currentTime);
      bus.gain.linearRampToValueAtTime(tr.gain ?? 0.45, ctx.currentTime + FADE_IN);
    });
  }
  const between = ([a, b]) => a + (b - a) * random();

  // braunes Rauschen (weich, wie Brandung), 4 Sekunden, läuft in Schleife
  function getNoise() {
    if (noiseBuffer) return noiseBuffer;
    const length = Math.floor(ctx.sampleRate * 4);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    return noiseBuffer;
  }

  function wave(param, hz, depth, nodes) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = depth;
    lfo.connect(g);
    g.connect(param);
    lfo.start();
    nodes.push(lfo);
  }

  function bubble(amb, nodes) {
    const b = amb.bubbles;
    const n = Math.round(between(b.count));
    let t = ctx.currentTime;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const dur = b.ms / 1000;
      const from = b.fromHz * (0.8 + 0.4 * random());
      o.type = 'sine';
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(from * (b.toHz / b.fromHz), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(b.gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(nodes.bus);
      o.start(t);
      o.stop(t + dur + 0.02);
      t += dur * 0.8;
    }
  }

  function scheduleBubble(amb, nodes) {
    nodes.timer = timers.setTimeout(() => {
      if (musicNodes !== nodes) return;
      bubble(amb, nodes);
      scheduleBubble(amb, nodes);
    }, between(amb.bubbles.everyMs));
  }

  function startMusic() {
    if (!ctx || musicNodes) return;
    if (loadTrack && sounds?.tracks?.[scene] && ctx.decodeAudioData) { startTrack(scene); return; }
    startSynth();
  }

  function startSynth() {
    if (!ctx || musicNodes || !sounds?.music) return;
    const m = sounds.music;
    const amb = sounds.ambience?.[scene] ?? sounds.ambience?.base ?? null;
    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(master);
    const nodes = { bus, oscillators: [], sources: [], timer: null };
    // Brummen: tiefe Töne, die langsam an- und abschwellen
    const droneBus = ctx.createGain();
    droneBus.gain.value = m.gain;
    droneBus.connect(bus);
    for (const hz of amb?.drone ?? m.notes) {
      const o = ctx.createOscillator();
      o.type = m.wave;
      o.frequency.value = hz;
      o.connect(droneBus);
      o.start();
      nodes.oscillators.push(o);
    }
    wave(droneBus.gain, m.lfoHz, m.lfoDepth, nodes.oscillators);
    if (amb) {
      // Meeresrauschen: Rauschen durch einen Tiefpass, Filter und Lautstärke wogen langsam
      const src = ctx.createBufferSource();
      src.buffer = getNoise();
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = amb.cutoffHz;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = amb.noiseGain;
      src.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(bus);
      src.start();
      nodes.sources.push(src);
      wave(filter.frequency, amb.swellHz, amb.swingHz, nodes.oscillators);
      wave(noiseGain.gain, amb.swellHz, amb.noiseGain * 0.5, nodes.oscillators);
      musicNodes = nodes;
      scheduleBubble(amb, nodes);
      return;
    }
    musicNodes = nodes;
  }

  function stopMusic() {
    if (!musicNodes) return;
    const nodes = musicNodes;
    musicNodes = null;
    timers.clearTimeout(nodes.timer);
    for (const o of nodes.oscillators) o.stop();
    if (nodes.track) {
      // Stück weich ausblenden
      const t = ctx.currentTime;
      nodes.bus.gain.cancelScheduledValues?.(t);
      nodes.bus.gain.setValueAtTime(nodes.bus.gain.value, t);
      nodes.bus.gain.linearRampToValueAtTime(0, t + FADE_OUT);
      for (const src of nodes.sources) src.stop(t + FADE_OUT);
      return;
    }
    for (const src of nodes.sources) src.stop();
    nodes.bus.disconnect?.();
  }

  function play(key) {
    if (!on || !ctx || !key) return false;
    const s = sounds?.sounds?.[key];
    if (!s) return false;
    const step = s.noteMs / 1000;
    let t = ctx.currentTime;
    for (const hz of s.notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = s.wave;
      o.frequency.setValueAtTime(hz, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(s.gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + step + 0.02);
      t += step;
    }
    return true;
  }

  return {
    // beim ersten Tipp aufrufen; danach ohne Wirkung
    unlock() {
      if (!ctx && context) {
        try {
          ctx = context();
          master = ctx.createGain();
          master.gain.value = vol;
          master.connect(ctx.destination);
        } catch {
          ctx = null; // kein Web Audio: das Spiel läuft still weiter
          return;
        }
      }
      if (ctx?.state === 'suspended') ctx.resume?.();
      if (musicOn) startMusic();
    },
    play,
    event(e) { return play(soundKeyFor(e, sounds?.events)); },
    events(list) { for (const e of list ?? []) play(soundKeyFor(e, sounds?.events)); },
    ui(name) { return play(sounds?.ui?.[name]); },
    setEnabled(value) { on = Boolean(value); },
    setMusic(value) {
      musicOn = Boolean(value);
      if (musicOn) startMusic();
      else stopMusic();
    },
    setVolume(value) {
      vol = clamp01(value);
      if (master) master.gain.value = vol;
    },
    get volume() { return vol; },
    get musicPlaying() { return Boolean(musicNodes); },
    // Ort wechseln: Station ('base') oder Gebiet; unbekannt → Station
    setScene(id) {
      const next = sceneOf(id);
      if (next === scene) return;
      scene = next;
      if (musicNodes) { stopMusic(); startMusic(); }
    },
    get scene() { return scene; },
  };
}
