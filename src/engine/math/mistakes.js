// Typische Fehler mit Kennung (Phase 6b; Regelwerk 4 und die Fehlertabellen in 5.1 und 5.2).
// mistakesFor liefert die Kandidaten in der Reihenfolge der Tabelle; welche Typen eine Stufe
// zeigt, steht in der Stufe (`mistakes`). pickChoices wählt drei falsche Antworten nach A-2,
// A-4, A-5 und der Zusatzregel „gleiche Einerziffer“; aufgefüllte Nachbarwerte haben den Typ null.
import { calcPlace, digitAt } from './places.js?v=ea296573';
import { swapDigits } from './formats/common.js?v=ea296573';
import { formatNumber } from './format.js?v=ea296573';

const crossesAdd = (a, b, p) => digitAt(a, p) + digitAt(b, p) >= 10;
const crossesSub = (a, b, p) => digitAt(a, p) < digitAt(b, p);

// An jeder Stelle die kleinere von der größeren Ziffer (76 − 59 → 23)
function smallerFromLarger(a, b) {
  let out = 0;
  for (let p = 1; p <= Math.max(a, b); p *= 10) out += Math.abs(digitAt(a, p) - digitAt(b, p)) * p;
  return out;
}

const RULES = {
  add: {
    'F-ADD-a': ({ a, b, result }, p) => (crossesAdd(a, b, p) ? [result - 10 * p] : []),
    'F-ADD-b': ({ result }, p) => [result + 10 * p],
    'F-ADD-c': ({ result }, p) => [result - p, result + p],
    'F-ADD-d': ({ result }) => [swapDigits(result)],
    'F-ADD-e': ({ a, b }) => [a + b * 10, a + b / 10],
  },
  sub: {
    'F-SUB-a': ({ a, b, result }, p) => (crossesSub(a, b, p) ? [result + 10 * p] : []),
    'F-SUB-b': ({ a, b }) => [smallerFromLarger(a, b)],
    'F-SUB-c': ({ result }, p) => [result - p, result + p],
    'F-SUB-d': ({ result }, p) => [result - 10 * p],
    'F-SUB-e': ({ a, b }) => [a - b * 10, a - b / 10],
    'F-SUB-f': ({ a, b }) => [a + b],
  },
  // Regelwerk 5.3: Nachbaraufgabe (ein Faktor um 1 oder 2 daneben, kein Faktor 0), addiert,
  // eine Null zu wenig, Nachbaraufgabe bei Zehner- und Hunderterzahlen
  mul: {
    // nach Abstand geordnet: erst ein Faktor um 1, dann um 2 daneben
    'F-MUL-a': ({ a, b }) => [-1, 1, -2, 2].flatMap((d) => [a + d >= 1 ? (a + d) * b : null, b + d >= 1 ? a * (b + d) : null]),
    'F-MUL-b': ({ a, b }) => [a + b],
    'F-MUL-c': ({ result }) => [result / 10],
    // Nachbaraufgabe an der Stelle beider Faktoren (3 · 60 → 2 · 60, 3 · 70; 40 · 70 → 30 · 70, 40 · 80)
    'F-MUL-d': ({ a, b }) => {
      const [s, big] = a < b ? [a, b] : [b, a];
      const u = calcPlace(big);
      const v = calcPlace(s);
      return [(s - v) * big, (s + v) * big, s * (big - u), s * (big + u)];
    },
    // eine Null zu viel (Klasse 4: 300 · 10 → 30 000)
    'F-MUL-e': ({ result }) => [result * 10],
  },
  // Regelwerk 5.4: Nachbar in der Reihe, Divisor genannt, eine Null zu viel oder zu wenig,
  // Nachbaraufgabe bei Zehner- und Hunderterzahlen
  div: {
    'F-DIV-a': ({ result }) => [result - 1, result + 1, result - 2, result + 2],
    'F-DIV-b': ({ b }) => [b],
    'F-DIV-c': ({ result }) => [result * 10, result / 10],
    'F-DIV-d': ({ result }) => [result - calcPlace(result), result + calcPlace(result)],
  },
};

export function mistakesFor(ladder, stage, numbers) {
  const rules = RULES[ladder];
  if (!rules) throw new Error(`keine Fehlertypen für ${ladder}`);
  const p = calcPlace(numbers.b);
  const out = [];
  for (const type of stage.mistakes ?? []) {
    const rule = rules[type];
    if (!rule) throw new Error(`unbekannter Fehlertyp ${type}`);
    for (const value of rule(numbers, p)) if (value !== null) out.push({ value, type });
  }
  return out;
}

// Gemeinsame Zehnerpotenz zweier Zahlen (A-5): 450 und 300 → 10, 34 und 30 → 1
export function commonRound(a, b) {
  let k = 1;
  while (a % (k * 10) === 0 && b % (k * 10) === 0) k *= 10;
  return k;
}

// correct: Zahl; candidates: [{ value, type }]; opts: { min, max, roundTo = 1, sameUnits = false, prefer = null, fillStep }
// prefer: [Fehlertyp, Anzahl] – so viele falsche Antworten dieses Typs zuerst (Mal: „zwei aus derselben Reihe“)
export function pickChoices(correct, candidates, { min, max, roundTo = 1, sameUnits = false, prefer = null, fillStep = roundTo }, rng) {
  const seen = new Set([correct]);
  const ok = (n) => Number.isInteger(n) && n >= min && n <= max && n % roundTo === 0 && !seen.has(n);
  const pool = [];
  for (const m of candidates) if (ok(m.value)) { seen.add(m.value); pool.push(m); }
  const shuffled = rng.shuffle(pool);
  const picked = [];
  if (prefer) for (const m of shuffled) if (m.type === prefer[0] && picked.length < prefer[1]) picked.push(m);
  if (sameUnits) {
    const same = shuffled.find((m) => m.value % 10 === correct % 10);
    if (same) picked.push(same);
  }
  for (const m of shuffled) if (picked.length < 3 && !picked.includes(m)) picked.push(m);
  // Auffüllen mit Nachbarwerten; bei der Einerziffer-Regel zuerst ± 10
  const fill = (step) => {
    for (let k = 1; picked.length < 3 && k * step <= max - min + step; k++) {
      for (const n of [correct + k * step, correct - k * step]) {
        if (picked.length < 3 && ok(n)) { seen.add(n); picked.push({ value: n, type: null }); }
      }
    }
  };
  if (sameUnits && !picked.some((m) => m.value % 10 === correct % 10)) {
    for (let k = 1; k * 10 <= max; k++) {
      const n = [correct - 10 * k, correct + 10 * k].find(ok);
      if (n === undefined) continue;
      seen.add(n);
      if (picked.length === 3) picked.pop(); // letzter Platz geht an die Einerziffer-Regel
      picked.push({ value: n, type: null });
      break;
    }
  }
  fill(fillStep);
  if (picked.length < 3) throw new Error('keine drei falschen Antworten möglich');
  const order = rng.shuffle([{ value: correct, type: null }, ...picked.slice(0, 3)]);
  return {
    choices: order.map((m) => formatNumber(m.value)),
    correctIndex: order.findIndex((m) => m.value === correct),
    choiceTypes: order.map((m) => (m.value === correct ? null : m.type)),
  };
}
