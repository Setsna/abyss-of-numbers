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
export function createAudio({ sounds, enabled = true, music = false, volume = 1, context = null, timers = globalThis, random = Math.random } = {}) {
  let on = Boolean(enabled);
  let musicOn = Boolean(music);
  let vol = clamp01(volume);
  let ctx = null;
  let master = null;
  let musicNodes = null;
  let noiseBuffer = null;
  let scene = 'base';

  const sceneOf = (id) => (sounds?.ambience?.[id] ? id : 'base');
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
    if (!ctx || musicNodes || !sounds?.music) return;
    const m = sounds.music;
    const amb = sounds.ambience?.[scene] ?? null;
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
    timers.clearTimeout(musicNodes.timer);
    for (const o of musicNodes.oscillators) o.stop();
    for (const src of musicNodes.sources) src.stop();
    musicNodes.bus.disconnect?.();
    musicNodes = null;
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
