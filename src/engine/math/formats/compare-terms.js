// Terme vergleichen (Konzept 8.2, Tintenwolke; Lehrplan „Terme vergleichen“, PDF S. 16):
// „Welche Rechnung hat denselben Wert wie 4 · 6?“ Vier Rechnungen, genau eine hat denselben Wert.
// Die gleichwertige Rechnung ist eine Plus- oder Minusaufgabe; die anderen haben einen Wert, der
// knapp daneben liegt (±1 bzw. ±10 bei glatten Zehnerzahlen, ±2, ±10/±100). Vorläufig (D29).
import { generateSolve } from '../generate.js';
import { formatExpression } from '../format.js';
import { placeCorrect, MAX_TRIES } from './common.js';

const OPS = ['add', 'sub', 'mul', 'div'];

// Eine Plus- oder Minusrechnung mit dem Wert v, Zahlen im Gebiet; glatt, wenn v glatt ist.
function termFor(v, unit, max, rng, avoid) {
  for (let i = 0; i < 200; i++) {
    const b = unit * rng.nextInt(1, 9);
    const useSub = rng.nextUint32() % 2 === 0;
    const text = useSub ? (v + b <= max ? formatExpression('sub', v + b, b) : null) : (v - b >= 1 ? formatExpression('add', v - b, b) : null);
    if (text && !avoid.has(text)) return text;
  }
  return null;
}

export function generate(level, area, rng) {
  const max = area.maxNumber;
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const base = generateSolve(rng.pick(OPS), level, area, rng);
    const v = base.result;
    const unit = max >= 1000 && v % 10 === 0 && v >= 100 ? 10 : 1;
    if (v < 2) continue;
    const avoid = new Set([base.prompt]);
    const right = termFor(v, unit, max, rng, avoid);
    if (!right) continue;
    avoid.add(right);
    const offsets = rng.shuffle([unit, -unit, 2 * unit, -2 * unit, 10 * unit, -10 * unit]);
    const wrong = [];
    for (const d of offsets) {
      if (wrong.length === 3) break;
      const w = v + d;
      if (w < 1 || w > max || wrong.some((x) => x.value === w)) continue;
      const text = termFor(w, unit, max, rng, avoid);
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
      promptParams: { expr: base.prompt },
      value: v,
      values: choices.map((c) => valueOf.get(c)),
      choices, correctIndex,
      solutionText: `${base.prompt} = ${right} = ${v}`,
      practiceKey: `compareTerms:${base.operation}:${base.a}:${base.b}`,
    };
  }
  throw new Error('keine gleichwertige Rechnung gefunden');
}
