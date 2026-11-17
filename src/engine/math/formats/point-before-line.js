// Punkt vor Strich (Konzept 7.4 und 9, Herr des Grabens; Lehrplan Ende Klasse 4, PDF S. 14):
// a + b · c oder a − b · c mit dem kleinen Einmaleins, Ergebnis 0 bis 100. Der Strich steht vorn,
// damit die Regel zählt. Typischer Fehler: von links nach rechts gerechnet ((a + b) · c), dazu
// a vergessen (b · c) und um 1 oder 10 daneben. Vorläufige Regeln (D29).
import { pickWrong, placeCorrect, MAX_TRIES } from './common.js';

const SIGN = { add: '+', sub: '−' };

export function generate(level, area, rng) {
  const r = area.pointBeforeLine ?? { factorMin: 2, factorMax: 10, addMin: 2, addMax: 40, subMin: 20, subMax: 100, max: 100 };
  for (let i = 0; i < MAX_TRIES; i++) {
    const op = rng.nextUint32() % 2 === 0 ? 'add' : 'sub';
    const b = rng.nextInt(r.factorMin, r.factorMax);
    const k = rng.nextInt(r.factorMin, r.factorMax);
    const a = op === 'add' ? rng.nextInt(r.addMin, r.addMax) : rng.nextInt(r.subMin, r.subMax);
    const result = op === 'add' ? a + b * k : a - b * k;
    if (result < 0 || result > r.max) continue;
    const leftToRight = op === 'add' ? (a + b) * k : (a - b) * k;
    const seen = new Set([result]);
    const wrong = [];
    if (leftToRight >= 0 && leftToRight <= area.maxNumber && leftToRight !== result) { wrong.push(leftToRight); seen.add(leftToRight); }
    const rest = pickWrong(result, [b * k, result + 1, result - 1, result + 10, result - 10].filter((n) => !seen.has(n)), { min: 0, max: area.maxNumber }, rng)
      .filter((n) => !seen.has(n)).slice(0, 3 - wrong.length);
    wrong.push(...rest);
    if (wrong.length < 3) continue;
    const { choices, correctIndex } = placeCorrect(String(result), wrong.map(String), rng);
    const text = `${a} ${SIGN[op]} ${b} · ${k}`;
    return {
      format: 'pointBeforeLine',
      operation: 'mul',
      parts: { a, op, b, c: k, result },
      prompt: 'task.pointBeforeLine',
      display: `${text} = ?`,
      choices, correctIndex,
      solutionText: `${text} = ${result}`,
      practiceKey: `pointBeforeLine:${a}:${op}:${b}:${k}`,
    };
  }
  throw new Error('keine Punkt-vor-Strich-Aufgabe gefunden');
}
