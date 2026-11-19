// Gemeinsame Zugarten der Leitern Plus und Minus (Phase 6b, Etappe 1; Regelwerk 5.1, 5.2).
// Die Grenzen jeder Stufe stehen in config/curricula/; hier steht nur die Form.
//
// Zahlbereich: { min, max, step = 1, notMultipleOf }  (notMultipleOf 10: Einer ≠ 0; 100: kein glatter Hunderter)
// Zugarten:
//   onePlace  zweite Zahl aus einer Liste von Bereichen (b: [Bereich, …]), an den Stellen
//             `checkPlaces` kein Übergang
//   pair      zwei Zahlen aus je einem Bereich; an der Stelle `carryAt` muss es einen Übergang geben
//             (`carry: true`) oder keinen (`carry: false`); ohne `carry` egal
//   either    eine von mehreren Varianten (`variants`, jede eine Stufe ohne id), gewichtet mit `weights`
// Für alle: Ergebnis zwischen `resultMin` und `resultMax` (wenn angegeben).
import { drawUntil } from '../formats/common.js?v=0bcb9d58';
import { digitAt } from '../places.js?v=0bcb9d58';

function rangeCount(r) {
  return Math.floor((r.max - r.min) / (r.step ?? 1)) + 1;
}

function drawRange(r, rng) {
  return r.min + (r.step ?? 1) * rng.nextInt(0, rangeCount(r) - 1);
}

// notMultipleOf: kein Vielfaches; noZeroDigit: keine Ziffer 0 (388 888 − 300, Regelwerk 6.2)
const fits = (n, r) => !(r.notMultipleOf && n % r.notMultipleOf === 0) && !(r.noZeroDigit && String(n).includes('0'));

// Gleichverteilt über die Vereinigung mehrerer Bereiche
function drawFromRanges(ranges, rng) {
  const total = ranges.reduce((s, r) => s + rangeCount(r), 0);
  let k = rng.nextInt(0, total - 1);
  for (const r of ranges) {
    const n = rangeCount(r);
    if (k < n) return { value: r.min + (r.step ?? 1) * k, range: r };
    k -= n;
  }
  throw new Error('Bereich leer');
}

export function makeLadder(op) {
  const apply = op === 'add' ? (a, b) => a + b : (a, b) => a - b;
  // Übergang an einer Stelle: Plus Ziffernsumme ≥ 10, Minus obere Ziffer kleiner als untere
  const crosses = op === 'add'
    ? (a, b, p) => digitAt(a, p) + digitAt(b, p) >= 10
    : (a, b, p) => digitAt(a, p) < digitAt(b, p);
  const resultOk = (s, result) => (s.resultMin === undefined || result >= s.resultMin) && (s.resultMax === undefined || result <= s.resultMax);

  function draw(s, rng) {
    switch (s.kind) {
      case 'onePlace':
        return drawUntil(
          () => {
            const a = drawRange(s.a, rng);
            const { value: b, range } = drawFromRanges(s.b, rng);
            return { a, b, okA: fits(a, s.a), okB: fits(b, range) };
          },
          ({ a, b, okA, okB }) => okA && okB && resultOk(s, apply(a, b)) && (s.checkPlaces ?? []).every((p) => !crosses(a, b, p)),
        );
      case 'pair':
        return drawUntil(
          () => ({ a: drawRange(s.a, rng), b: drawRange(s.b, rng) }),
          ({ a, b }) => fits(a, s.a) && fits(b, s.b) && resultOk(s, apply(a, b))
            && (s.carry === undefined || crosses(a, b, s.carryAt) === s.carry),
        );
      case 'either': {
        const weights = s.weights ?? s.variants.map(() => 1);
        let k = rng.nextInt(0, weights.reduce((x, y) => x + y, 0) - 1);
        let i = 0;
        while (k >= weights[i]) { k -= weights[i]; i += 1; }
        return draw({ ...s.variants[i], resultMin: s.resultMin, resultMax: s.resultMax }, rng);
      }
      default:
        throw new Error(`unbekannte Zugart ${s.kind}`);
    }
  }

  return {
    kinds: ['onePlace', 'pair', 'either'],
    drawStage(stage, rng) {
      const { a, b } = draw(stage, rng);
      return { a, b, result: apply(a, b) };
    },
  };
}
