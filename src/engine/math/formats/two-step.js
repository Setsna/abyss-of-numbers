// Zwei Rechenschritte in einer Rechnung (Konzept 7.4, Wächter der Stadt): erst die Rechnung der
// Karte (Rechenart der Karte, Regeln des Gebiets), dann plus oder minus glatte Zehner:
// 3 · 60 − 30, 450 + 300 − 70. Der Punkt-Teil steht immer vorn, die Reihenfolge ist also
// eindeutig. Falsche Antworten: zweiter Schritt vergessen, Vorzeichen vertauscht, um 10 und
// um 100 daneben. Vorläufige Regeln (D29).
import { generateSolve } from '../generate.js';
import { OPERATOR_SIGN } from '../format.js';
import { pickWrong, placeCorrect, MAX_TRIES } from './common.js';

export function generate(level, area, rng, spec = {}) {
  const r = area.twoStep ?? { cMin: 1, cMax: 9, unit: 10 };
  const op = spec.operation ?? 'add';
  for (let i = 0; i < MAX_TRIES; i++) {
    const first = generateSolve(op, level, area, rng);
    const mid = first.result;
    const op2 = rng.nextUint32() % 2 === 0 ? 'add' : 'sub';
    const k = r.unit * rng.nextInt(r.cMin, r.cMax);
    const result = op2 === 'add' ? mid + k : mid - k;
    if (result < 0 || result > area.maxNumber) continue;
    const other = op2 === 'add' ? mid - k : mid + k;
    // „zweiten Schritt vergessen“ (mid) ist immer dabei, die übrigen zwei werden gelost
    const rest = pickWrong(result, [other, result + 10, result - 10, result + 100, result - 100].filter((n) => n !== mid), { min: 0, max: area.maxNumber, step: 10 }, rng)
      .filter((n) => n !== mid);
    const wrong = [mid, ...rest].slice(0, 3);
    const { choices, correctIndex } = placeCorrect(String(result), wrong.map(String), rng);
    const text = `${first.a} ${OPERATOR_SIGN[op]} ${first.b} ${OPERATOR_SIGN[op2]} ${k}`;
    return {
      format: 'twoStep',
      operation: op,
      parts: { a: first.a, b: first.b, mid, op2, c: k, result },
      prompt: 'task.twoStep',
      display: `${text} = ?`,
      choices, correctIndex,
      solutionText: `${text} = ${result}`,
      practiceKey: `twoStep:${op}:${first.a}:${first.b}:${op2}:${k}`,
    };
  }
  throw new Error('keine passende Aufgabe mit zwei Schritten gefunden');
}
