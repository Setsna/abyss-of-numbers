// Zufallsgenerator mit Seed (mulberry32). Das Verfahren ist festgelegt,
// damit die Godot-Fassung dieselben Zahlen liefert (Architektur, Abschnitt 5).

function makeRng(state) {
  let a = state | 0;
  const rng = {
    nextUint32() {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return (t ^ (t >>> 14)) >>> 0;
    },
    // beide Grenzen eingeschlossen
    nextInt(min, max) {
      return min + (rng.nextUint32() % (max - min + 1));
    },
    pick(array) {
      return array[rng.nextUint32() % array.length];
    },
    // liefert ein neues Array, die Eingabe bleibt unverändert
    shuffle(array) {
      const out = array.slice();
      for (let i = out.length - 1; i >= 1; i--) {
        const j = rng.nextUint32() % (i + 1);
        const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
      }
      return out;
    },
    getState() {
      return a >>> 0;
    },
  };
  return rng;
}

export function createRng(seed) {
  return makeRng(seed >>> 0);
}

export function createRngFromState(state) {
  return makeRng(state >>> 0);
}

export function fnv1a32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function deriveSeed(seed, label) {
  return (fnv1a32(label) ^ seed) >>> 0;
}
