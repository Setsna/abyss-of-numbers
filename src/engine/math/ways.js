// Rechenwege nach einem Fehler (Phase 6b, Etappe 5; Regelwerk 8.1). Liefert { key, parts } oder null.
// parts sind fertige Rechnungen („56 + 20 = 76“) oder das Ergebnis; die Wörter dazu stehen in
// texts/de.json unter way.<key> mit den Platzhaltern {0}, {1}, {2}.
//   steps       erst die höhere Stelle, dann die Rechenstelle (56 + 29: 56 + 20, dann 76 + 9);
//               hat die zweite Zahl nur eine Stelle: erst zum Zehner, dann weiter (48 + 6: 48 + 2, 50 + 4);
//               Punkt vor Strich: erst die Punktrechnung
//   scaled      die kleine Aufgabe dahinter (45 + 30 = 75, also 450 + 300 = 750; 3 · 6 = 18, also 3 · 60 = 180)
//   core        Malaufgabe von der Kernaufgabe aus (5 · 8 + 2 · 8)
//   inverse     Umkehraufgabe (8 · 7 = 56, also 56 : 7 = 8)
//   complement  erst zum Zehner (Hunderter), dann zum Ziel (37 + 3 = 40, 40 + 60 = 100, zusammen 63)
// null: ohne Übergang, Kernaufgaben und einschrittiges Ergänzen bekommen nur die richtige Rechnung.
import { calcPlace, digitAt } from './places.js?v=91f88903';
import { commonRound } from './mistakes.js?v=91f88903';
import { formatEquation, formatNumber } from './format.js?v=91f88903';

const SIGN = { add: '+', sub: '−', mul: '·', div: ':' };
const APPLY = { add: (x, y) => x + y, sub: (x, y) => x - y, mul: (x, y) => x * y, div: (x, y) => x / y };
const eq = (op, x, y) => formatEquation(op, x, y, APPLY[op](x, y));
const CORE = [2, 5, 10];
const nextMult = (a, k) => Math.ceil((a + 1) / k) * k;

function plusMinus(op, a, b) {
  const k = commonRound(a, b);
  // die kleine Aufgabe dahinter nur, wenn sie wirklich klein ist (Durchsicht 6b: nicht 86 700 + 3)
  if (k >= 10 && a / k < 100 && b / k < 100) return { key: 'scaled', parts: [eq(op, a / k, b / k), eq(op, a, b)] };
  const p = calcPlace(b);
  const crosses = op === 'add' ? digitAt(a, p) + digitAt(b, p) >= 10 : digitAt(a, p) < digitAt(b, p);
  if (!crosses) return null;
  const high = b - digitAt(b, p) * p; // Teil der zweiten Zahl über der Rechenstelle
  if (high > 0) return { key: 'steps', parts: [eq(op, a, high), eq(op, APPLY[op](a, high), b - high)] };
  // zweite Zahl nur an einer Stelle: erst an dieser Stelle zum Zehner (Hunderter) auffüllen, dann weiter.
  // Nur die Ziffer der Rechenstelle zählt (Review 7b, B2): 371 000 + 70 000 → erst + 30 000, dann + 40 000,
  // nicht „+ 29 000 bis 400 000“.
  const d = digitAt(a, p);
  const first = (op === 'add' ? 10 - d : d) * p;
  if (d === 0 || first >= b) return null; // 200 − 8: kein Zwischenschritt zum Zehner
  const mid = APPLY[op](a, first);
  return { key: 'steps', parts: [eq(op, a, first), eq(op, mid, b - first)] };
}

function times(a, b) {
  const round = (x) => (x >= 20 && x % 10 === 0 ? x / calcPlace(x) : x);
  if (round(a) === 1 || round(b) === 1) return null; // 1 · 4 hilft bei 100 · 40 nicht (Durchsicht 6b)
  if (round(a) !== a || round(b) !== b) return { key: 'scaled', parts: [eq('mul', round(a), round(b)), eq('mul', a, b)] };
  if (CORE.includes(a) || CORE.includes(b)) return null;
  const base = a >= 6 ? 5 : 2;
  return { key: 'core', parts: [eq('mul', base, b), eq('mul', a - base, b), formatNumber(a * b)] };
}

function divide(a, b) {
  const r = a / b;
  if (b <= 10 && r <= 10 && (CORE.includes(b) || CORE.includes(r))) return null;
  return { key: 'inverse', parts: [eq('mul', r, b), eq('div', a, b)] };
}

function complement({ a, target }) {
  const next = nextMult(a, 10 * calcPlace(a));
  if (next >= target) return null;
  return { key: 'complement', parts: [eq('add', a, next - a), eq('add', next, target - next), formatNumber(target - a)] };
}

function pointFirst({ a, op, point, b, c, bracket = false, aFirst = false }) {
  if (bracket) {
    // Klammer zuerst (Klasse 4): 2 · (80 + 20): erst 80 + 20 = 100, dann 2 · 100 = 200
    const inner = APPLY[op](b, c);
    return { key: 'steps', parts: [eq(op, b, c), point === 'mul' && aFirst ? eq('mul', a, inner) : eq(point, inner, a)] };
  }
  const v = APPLY[point](b, c);
  return { key: 'steps', parts: [eq(point, b, c), eq(op, a, v)] };
}

// Rechenweg von der getippten Nachbaraufgabe aus (Phase 7a, Kritik P2): passt zum Hinweis „Das ist das
// Ergebnis der Nachbaraufgabe.“ 4 · 4, getippt 12: „3 · 4 = 12, und noch 4 dazu: 16.“ Ein Faktor um 1 oder 2
// daneben, bei Zehner- und Hunderterzahlen um 1 oder 2 an ihrer Stelle (3 · 60, getippt 150: 3 · 50). Sonst null.
export function neighborWay(a, b, wrong) {
  const result = a * b;
  if (!Number.isInteger(wrong) || wrong === result) return null;
  for (const first of [true, false]) {
    const x = first ? a : b;
    const unit = x >= 20 && x % 10 === 0 ? calcPlace(x) : 1;
    for (const k of [1, -1, 2, -2]) {
      const nx = x + k * unit;
      if (nx < 1) continue;
      const [na, nb] = first ? [nx, b] : [a, nx];
      if (na * nb !== wrong) continue;
      return { key: wrong < result ? 'neighborUp' : 'neighborDown', parts: [eq('mul', na, nb), formatNumber(Math.abs(result - wrong)), formatNumber(result)] };
    }
  }
  return null;
}

export function wayFor(kind, n) {
  switch (kind) {
    case 'add': case 'sub': return plusMinus(kind, n.a, n.b);
    case 'mul': return times(n.a, n.b);
    case 'div': return divide(n.a, n.b);
    case 'comp': return complement(n);
    case 'pvs': return pointFirst(n);
    default: return null;
  }
}

// Rechenweg zu einer Übungsaufgabe aus ihrem Schlüssel („add:56:29“, „complement:37:100“); sonst null.
// Die Übungsliste speichert nur den Text; der Rechenweg wird beim Anzeigen neu erzeugt.
export function wayForKey(key) {
  const [kind, x, y] = String(key).split(':');
  const a = Number(x);
  const b = Number(y);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
  if (APPLY[kind]) return wayFor(kind, { a, b });
  if (kind === 'complement') return wayFor('comp', { a, target: b });
  return null;
}
