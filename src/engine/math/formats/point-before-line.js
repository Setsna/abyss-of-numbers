// Punkt vor Strich und Klammern (Konzept 7.4 und 9, Herr des Grabens; Lehrplan PDF S. 14; Regelwerk 5.6, 6.6).
// Formen (stage.form):
//   point (Standard)  a + b · c, a − b · c oder a ± b : c; der Strich steht vorn, damit die Regel zählt.
//                     b : c aus dem kleinen Einmaleins (divFrom: facts) oder dem Zehnereinmaleins (tens)
//   bracketMul        a · (b ± c) oder (b ± c) · a mit glatten Zehnern in der Klammer (Klasse 4)
//   bracketDiv        (b ± c) : a, der Wert der Klammer geteilt durch a ist eine Aufgabe des Zehnereinmaleins
// Falsche Antworten: F-PVS-a von links nach rechts gerechnet (immer dabei, wenn ganzzahlig und im
// Zahlenraum), F-PVS-b die erste Zahl vergessen, F-PVS-c um 1 oder 10 daneben; bei Klammern F-KL-a Klammer
// nicht beachtet, F-KL-b nur die erste Zahl der Klammer verrechnet, F-KL-c um 10 daneben.
import { pickChoices } from '../mistakes.js?v=7aea6f1b';
import { wayFor } from '../ways.js?v=7aea6f1b';
import { formatNumber as fmt } from '../format.js?v=7aea6f1b';
import { MAX_TRIES } from './common.js?v=7aea6f1b';

const SIGN = { add: '+', sub: '−', mul: '·', div: ':' };
const APPLY = { add: (x, y) => x + y, sub: (x, y) => x - y, mul: (x, y) => x * y, div: (x, y) => x / y };
const draw = (r, rng) => r.min + (r.step ?? 1) * rng.nextInt(0, Math.floor((r.max - r.min) / (r.step ?? 1)));

// b : c als Umkehraufgabe aus dem kleinen Einmaleins oder dem Zehnereinmaleins
function drawDivision(stage, rng) {
  const from = rng.pick(stage.divFrom ?? ['facts']);
  if (from === 'facts') { const c = draw(stage.factors, rng); const q = draw(stage.factors, rng); return [c * q, c, q]; }
  const s = rng.nextInt(2, 9);
  const t = 10 * rng.nextInt(2, 9);
  return rng.nextUint32() % 2 === 0 ? [s * t, s, t] : [s * t, t, s];
}

function finish(stage, area, rng, { a, op, b, c, result, text, wrong, parts }) {
  const cands = stage.mistakes.flatMap((type) => (wrong[type] ?? []).map((v) => ({ value: v, type })));
  // Klammerformen (Klasse 4): Ergebnisse sind glatte Zehner, aufgefüllt wird in Zehnerschritten
  const fillStep = parts?.bracket && result % 10 === 0 ? 10 : 1;
  const { choices, correctIndex, choiceTypes } = pickChoices(result, cands, { min: 0, max: area.maxNumber, prefer: [stage.mistakes[0], 1], fillStep }, rng);
  return {
    format: 'pointBeforeLine',
    operation: stage.point,
    parts: { a, op, point: stage.point, b, c, result, ...parts },
    prompt: 'task.pointBeforeLine',
    display: `${text} = ?`,
    choices, correctIndex, choiceTypes,
    solutionText: `${text} = ${fmt(result)}`,
    practiceKey: `pointBeforeLine:${a}:${op}:${b}:${stage.point}:${c}${parts?.bracket ? `:${parts.aFirst ? 'a' : 'b'}` : ''}`,
    ladder: 'pvs', stageId: stage.id,
    way: wayFor('pvs', { a, op, point: stage.point, b, c, ...parts }),
  };
}

function point(stage, area, rng) {
  for (let i = 0; i < MAX_TRIES; i++) {
    const op = rng.pick(stage.ops);
    let b; let c; let value;
    if (stage.point === 'mul') { b = draw(stage.factors, rng); c = draw(stage.factors, rng); value = b * c; }
    else [b, c, value] = drawDivision(stage, rng);
    const a = draw(stage.a, rng);
    const result = APPLY[op](a, value);
    if (result < stage.resultMin || result > stage.resultMax) continue;
    const ltr = APPLY[stage.point](APPLY[op](a, b), c);
    const text = `${fmt(a)} ${SIGN[op]} ${fmt(b)} ${SIGN[stage.point]} ${fmt(c)}`;
    return finish(stage, area, rng, { a, op, b, c, result, text,
      wrong: { 'F-PVS-a': [ltr], 'F-PVS-b': [value], 'F-PVS-c': [result + 1, result - 1, result + 10, result - 10] } });
  }
  throw new Error('keine Punkt-vor-Strich-Aufgabe gefunden');
}

function bracketMul(stage, area, rng) {
  for (let i = 0; i < MAX_TRIES; i++) {
    const op = rng.pick(stage.ops);
    const b = draw(stage.inner, rng);
    const c = draw(stage.inner, rng);
    const inner = APPLY[op](b, c);
    if (inner < stage.innerMin || inner > stage.innerMax) continue;
    const a = draw(stage.a, rng);
    const result = a * inner;
    if (result > stage.resultMax) continue;
    const aFirst = rng.nextUint32() % 2 === 0;
    const text = aFirst ? `${a} · (${b} ${SIGN[op]} ${c})` : `(${b} ${SIGN[op]} ${c}) · ${a}`;
    const ignore = aFirst ? APPLY[op](a * b, c) : APPLY[op](b, c * a); // Klammer nicht beachtet
    return finish(stage, area, rng, { a, op, b, c, result, text, parts: { bracket: true, aFirst },
      wrong: { 'F-KL-a': [ignore], 'F-KL-b': [a * b], 'F-KL-c': [result + 10, result - 10] } });
  }
  throw new Error('keine Klammeraufgabe gefunden');
}

function bracketDiv(stage, area, rng) {
  for (let i = 0; i < MAX_TRIES; i++) {
    const op = rng.pick(stage.ops);
    const a = draw(stage.a, rng);
    const result = draw(stage.quotient, rng);
    const inner = a * result;
    const c = draw(stage.inner, rng);
    const b = op === 'add' ? inner - c : inner + c;
    const r = stage.inner;
    if (b < r.min || b > r.max || b % (r.step ?? 1) !== 0) continue;
    const text = `(${fmt(b)} ${SIGN[op]} ${fmt(c)}) : ${a}`;
    const ignore = APPLY[op](b, c / a); // Klammer nicht beachtet: b ± c : a
    return finish(stage, area, rng, { a, op, b, c, result, text, parts: { bracket: true, aFirst: false },
      wrong: { 'F-KL-a': [ignore], 'F-KL-b': [b / a], 'F-KL-c': [result + 10, result - 10] } });
  }
  throw new Error('keine Klammeraufgabe mit Geteilt gefunden');
}

export function generate(stage, area, rng) {
  const form = stage.form ?? 'point';
  const task = form === 'bracketMul' ? bracketMul(stage, area, rng) : form === 'bracketDiv' ? bracketDiv(stage, area, rng) : point(stage, area, rng);
  task.extraMs = stage.extraMs ?? 0;
  return task;
}
