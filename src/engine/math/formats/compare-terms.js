// Terme vergleichen (Konzept 8.2, Tintenwolke; Lehrplan „Terme vergleichen“, PDF S. 16; Regelwerk 5.7):
// „Welche Rechnung hat denselben Wert wie 4 · 6?“ Die Vorgabe kommt aus der Mal-Stufe des Plans.
// Vier Plus- oder Minusrechnungen im Zahlenraum des Gebiets, genau eine hat denselben Wert.
// Zweite Zahl 2 bis 9, bei einem glatten Wert ein Vielfaches seiner Rechenstelle p (A-9: Stelle der
// letzten Ziffer ≠ 0; 40 → 10 bis 90, 320 000 → 10 000 bis 90 000). Die anderen Werte liegen an der
// Rechenstelle um 1 oder 2 oder an der nächsthöheren Stelle um 1 daneben (±p, ±2p, ±10p). So ist keine
// Rechnung glatter als die anderen, und keine braucht Entbündeln über mehrere Stellen (Durchsicht 6b).
import { LADDERS } from '../ladders/index.js?v=36a3ca2d';
import { formatExpression } from '../format.js?v=36a3ca2d';
import { placeCorrect, MAX_TRIES } from './common.js?v=36a3ca2d';
import { calcPlace } from '../places.js?v=36a3ca2d';

// Eine Plus- oder Minusrechnung mit dem Wert v; null, wenn keine passt
function termFor(v, p, max, rng, avoid) {
  for (let i = 0; i < 200; i++) {
    const y = p === 1 ? rng.nextInt(2, 9) : p * rng.nextInt(1, 9);
    const useSub = rng.nextUint32() % 2 === 0;
    const text = useSub ? (v + y <= max ? formatExpression('sub', v + y, y) : null) : (v - y >= 1 ? formatExpression('add', v - y, y) : null);
    if (text && !avoid.has(text)) return text;
  }
  return null;
}

export function generate(stages, area, rng) {
  const max = area.maxNumber;
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const base = LADDERS.mul.drawStage(stages.mul, rng);
    const v = base.result;
    const expr = formatExpression('mul', base.a, base.b);
    const p = calcPlace(v);
    const avoid = new Set();
    const right = termFor(v, p, max, rng, avoid);
    if (!right) continue;
    avoid.add(right);
    const wrong = [];
    for (const d of rng.shuffle([p, -p, 2 * p, -2 * p, 10 * p, -10 * p])) {
      if (wrong.length === 3) break;
      const w = v + d;
      if (w < 1 || w > max) continue;
      const text = termFor(w, p, max, rng, avoid);
      if (!text) continue;
      avoid.add(text);
      wrong.push({ text, value: w });
    }
    if (wrong.length < 3) continue;
    const { choices, correctIndex } = placeCorrect(right, wrong.map((x) => x.text), rng);
    const valueOf = new Map([[right, v], ...wrong.map((x) => [x.text, x.value])]);
    return {
      format: 'compareTerms',
      prompt: 'task.compareTerms',
      promptParams: { expr },
      value: v,
      values: choices.map((c) => valueOf.get(c)),
      choices, correctIndex,
      solutionText: `${expr} = ${right} = ${v}`,
      practiceKey: `compareTerms:mul:${base.a}:${base.b}`,
    };
  }
  throw new Error('keine gleichwertige Rechnung gefunden');
}
