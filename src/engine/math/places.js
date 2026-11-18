// Stellenwerte (Regelwerk A-9, Phase 6b).
// Rechenstelle: Stelle der letzten Ziffer ≠ 0 (56 → 1, 450 → 10, 30 000 → 10 000). 0 hat keine Stelle.

export function calcPlace(n) {
  if (!Number.isInteger(n) || n === 0) return 0;
  let place = 1;
  let m = Math.abs(n);
  while (m % 10 === 0) { m /= 10; place *= 10; }
  return place;
}

// Ziffer an einer Stelle: digitAt(4567, 100) → 5
export function digitAt(n, place) {
  return Math.floor(Math.abs(n) / place) % 10;
}

export function isMultipleOf(n, k) {
  return k > 0 && n % k === 0;
}

// Stelle, in die der erste Übergang führt (Phase 7a, D47: „Hier geht es über den Zehner.“):
// 56 + 29 → 10, 450 + 370 → 100, 200 − 8 → 10; ohne Übergang oder bei Mal und Geteilt null.
export function crossPlace(op, a, b) {
  if (op !== 'add' && op !== 'sub') return null;
  for (let p = 1; p <= Math.max(a, b); p *= 10) {
    const x = digitAt(a, p);
    const y = digitAt(b, p);
    if (op === 'add' ? x + y >= 10 : x < y) return p * 10;
  }
  return null;
}
