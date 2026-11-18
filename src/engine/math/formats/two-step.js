// Zwei Rechenschritte in einer Rechnung (Konzept 7.4, Wächter der Stadt; Regelwerk 5.7): erst die
// Rechnung der Karte aus der Stufe ihrer Rechenart (stages), dann plus oder minus eine Ziffer 1 bis 9
// an der Stelle der letzten Ziffer ≠ 0 des Zwischenergebnisses, ohne Übergang:
// 3 · 60 − 30 = 150, 450 + 300 + 20 = 770. Der Punkt-Teil steht vorn, die Reihenfolge ist eindeutig.
// Falsche Antworten: zweiter Schritt vergessen (immer dabei), Vorzeichen vertauscht, an dieser Stelle um 1 daneben.
import { LADDERS } from '../ladders/index.js?v=650280d9';
import { OPERATOR_SIGN, formatNumber } from '../format.js?v=650280d9';
import { calcPlace, digitAt } from '../places.js?v=650280d9';
import { pickWrong, placeCorrect, MAX_TRIES } from './common.js?v=650280d9';

// first: { operation, a, b, result }; op2: 'add' | 'sub'; c: zweiter Schritt
export function composeTwoStep(first, op2, c, area, rng) {
  const mid = first.result;
  const result = op2 === 'add' ? mid + c : mid - c;
  const p = calcPlace(mid);
  const other = op2 === 'add' ? mid - c : mid + c;
  const rest = pickWrong(result, [other, result + p, result - p].filter((n) => n !== mid), { min: 0, max: area.maxNumber, step: p }, rng)
    .filter((n) => n !== mid);
  const wrong = [mid, ...rest].slice(0, 3);
  const { choices, correctIndex } = placeCorrect(formatNumber(result), wrong.map(formatNumber), rng);
  const text = `${formatNumber(first.a)} ${OPERATOR_SIGN[first.operation]} ${formatNumber(first.b)} ${OPERATOR_SIGN[op2]} ${formatNumber(c)}`;
  return {
    format: 'twoStep',
    operation: first.operation,
    parts: { a: first.a, b: first.b, mid, op2, c, result },
    prompt: 'task.twoStep',
    display: `${text} = ?`,
    choices, correctIndex,
    solutionText: `${text} = ${formatNumber(result)}`,
    practiceKey: `twoStep:${first.operation}:${first.a}:${first.b}:${op2}:${c}`,
  };
}

export function generate(stages, area, rng, spec = {}) {
  const op = spec.operation ?? 'add';
  for (let i = 0; i < MAX_TRIES; i++) {
    const first = { operation: op, ...LADDERS[op].drawStage(stages[op], rng) };
    const mid = first.result;
    const p = calcPlace(mid);
    const d0 = digitAt(mid, p);
    const op2 = rng.nextUint32() % 2 === 0 ? 'add' : 'sub';
    const maxDigit = op2 === 'add' ? 9 - d0 : d0; // ohne Übergang an der Stelle p
    if (maxDigit < 1) continue;
    const c = p * rng.nextInt(1, maxDigit);
    const result = op2 === 'add' ? mid + c : mid - c;
    if (result < 1 || result > area.maxNumber) continue;
    return composeTwoStep(first, op2, c, area, rng);
  }
  throw new Error('keine passende Aufgabe mit zwei Schritten gefunden');
}
