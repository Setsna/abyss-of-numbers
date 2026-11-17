// Gemeinsame Helfer der Aufgabenformate (Phase 5, Etappe 3).

export const MAX_TRIES = 10000;

export function drawUntil(draw, accept) {
  for (let i = 0; i < MAX_TRIES; i++) {
    const v = draw();
    if (accept(v)) return v;
  }
  throw new Error('keine passende Aufgabe gefunden');
}

// Drei falsche Antworten: zuerst typische Fehler (candidates), sonst Nachbarzahlen.
// Alle verschieden, ganzzahlig, zwischen min und max, nicht gleich der richtigen.
// step: Abstand der Nachbarzahlen im Rückfall (10 bei glatten Zehnerzahlen)
export function pickWrong(correct, candidates, { min, max, step = 1 }, rng) {
  const seen = new Set([correct]);
  const ok = (n) => Number.isInteger(n) && n >= min && n <= max && !seen.has(n);
  const pool = [];
  for (const n of candidates) if (ok(n)) { seen.add(n); pool.push(n); }
  const picked = rng.shuffle(pool).slice(0, 3);
  for (let k = 1; picked.length < 3; k++) {
    for (const n of [correct + k * step, correct - k * step]) if (picked.length < 3 && ok(n)) { seen.add(n); picked.push(n); }
    if (k * step > max - min + 3) throw new Error('keine drei falschen Antworten möglich');
  }
  return picked;
}

export function placeCorrect(correct, wrong, rng) {
  const choices = rng.shuffle([correct, ...wrong]);
  return { choices, correctIndex: choices.indexOf(correct) };
}

// 63 → 36; nur zweistellig, Einer ≠ 0, Ziffern verschieden, sonst null
export function swapDigits(n) {
  if (n < 10 || n > 99 || n % 10 === 0) return null;
  const tens = Math.floor(n / 10), ones = n % 10;
  return tens === ones ? null : ones * 10 + tens;
}
