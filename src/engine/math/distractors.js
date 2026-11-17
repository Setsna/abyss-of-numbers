// Drei falsche Antworten als typische Fehler (Konzept 8.3, Plan Etappe 2).
// Das genaue Regelwerk je Aufgabentyp schreibt Phase 6a.

function swapDigits(n) {
  // nur zweistellig mit Einer ≠ 0 und verschiedenen Ziffern: 63 → 36
  if (n < 10 || n > 99 || n % 10 === 0) return null;
  const tens = Math.floor(n / 10), ones = n % 10;
  return tens === ones ? null : ones * 10 + tens;
}

function candidates(operation, a, b, result) {
  switch (operation) {
    case 'add':
      return [result - 10, result + 10, result - 1, result + 1, swapDigits(result)];
    case 'sub': {
      // Zehner minus Zehner und größere minus kleinere Einerziffer: 52 − 38 → 26
      const tens = Math.floor(a / 10) - Math.floor(b / 10);
      const ones = Math.abs((a % 10) - (b % 10));
      return [result + 10, result - 10, result + 1, result - 1, tens * 10 + ones];
    }
    case 'mul':
      return [a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b, a + b];
    case 'div':
      return [result + 1, result - 1, result + 2, b, result * 2];
    default:
      throw new Error(`unbekannte Rechenart: ${operation}`);
  }
}

// Zahlenraum bis 1000 mit glatten Zehnerzahlen (Phase 5, Etappe 5): typische Fehler sind
// Stellenfehler (eine Null zu viel oder zu wenig, Zehner und Hunderter verwechselt), daneben
// um 10 oder 100. Falsche Antworten bleiben glatte Zehnerzahlen.
function roundCandidates(operation, a, b, result) {
  switch (operation) {
    case 'add': return [result + 10, result - 10, result + 100, result - 100, b % 100 === 0 ? a + b / 10 : a + b * 10];
    case 'sub': return [result + 10, result - 10, result + 100, result - 100, b % 100 === 0 ? a - b / 10 : a - b * 10];
    case 'mul': {
      const [small, tens] = a % 10 === 0 ? [b, a] : [a, b];
      return [result / 10, result * 10, (small + 1) * tens, (small - 1) * tens, small * (tens + 10), small * (tens - 10)];
    }
    default: return null;
  }
}

function isRound(operation, a, b, result, maxNumber) {
  if (maxNumber < 1000 || operation === 'div' || result % 10 !== 0) return false;
  return operation === 'mul' ? (a % 10 === 0) !== (b % 10 === 0) : a % 10 === 0 && b % 10 === 0;
}

export function distractorsFor(operation, a, b, result, maxNumber, rng) {
  const seen = new Set([result]);
  const round = isRound(operation, a, b, result, maxNumber);
  // Plus und Minus: falsche Antworten bleiben glatte Zehner; beim Mal ist „eine Null zu wenig“ (18) gewollt
  const ok = (n) => Number.isInteger(n) && n >= 0 && n <= maxNumber && !seen.has(n) && (!round || operation === 'mul' || n % 10 === 0);
  const pool = [];
  for (const n of (round ? roundCandidates(operation, a, b, result) : candidates(operation, a, b, result))) {
    if (ok(n)) { seen.add(n); pool.push(n); }
  }
  const picked = rng.shuffle(pool).slice(0, 3);
  const unit = round ? 10 : 1;
  for (let k = 2; picked.length < 3; k++) {
    for (const n of [result + k * unit, result - k * unit]) {
      if (picked.length < 3 && ok(n)) { seen.add(n); picked.push(n); }
    }
    if (k > maxNumber + 3) throw new Error('keine drei falschen Antworten möglich');
  }
  return picked;
}
