// Kettenaufgabe (Konzept 8.2, Blasenkette): mit dem Ergebnis weiterrechnen, drei Glieder,
// zum Beispiel 24 + 8 = ?, dann 32 − 5 = ?, dann 27 + 6 = ?. Plus und Minus mit Zahlen bis 20,
// Mal nur, solange die Zahl höchstens `mulMaxStart` ist (kleines Einmaleins).
// Jedes Glied ist ein Schritt mit vier Antworten. Vorläufige Regeln (D29).
import { distractorsFor } from '../distractors.js';
import { formatEquation, OPERATOR_SIGN } from '../format.js';
import { placeCorrect, MAX_TRIES } from './common.js';

// Gerechnet in Einheiten (unit 10 im Zahlenraum bis 1000: 34 steht für 340); beim Mal ist der
// zweite Faktor nie skaliert (60 · 3).
function drawLink(value, r, rng) {
  for (let i = 0; i < MAX_TRIES; i++) {
    const ops = value <= r.mulMaxStart && r.mulFactors.length > 0 ? ['add', 'sub', 'mul'] : ['add', 'sub'];
    const op = rng.pick(ops);
    if (op === 'mul') {
      const b = rng.pick(r.mulFactors);
      if (value * b <= r.max && value >= 2) return { op, b, result: value * b };
    } else {
      const b = rng.nextInt(2, op === 'add' ? r.addMax : r.subMax);
      const result = op === 'add' ? value + b : value - b;
      if (result >= r.resultMin && result <= r.max) return { op, b, result };
    }
  }
  throw new Error('kein passendes Kettenglied gefunden');
}

export function generate(level, area, rng) {
  const r = area.chain;
  const u = r.unit ?? 1;
  const start = u * rng.nextInt(r.startMin, r.startMax);
  const links = [];
  const steps = [];
  let value = start;
  for (let i = 0; i < r.links; i++) {
    const s = drawLink(value / u, r, rng);
    const link = { op: s.op, b: s.op === 'mul' ? s.b : s.b * u, result: s.result * u };
    const wrong = distractorsFor(link.op, value, link.b, link.result, r.max * u, rng);
    const { choices, correctIndex } = placeCorrect(String(link.result), wrong.map(String), rng);
    steps.push({
      prompt: 'task.chain',
      promptParams: { n: i + 1, of: r.links },
      display: `${value} ${OPERATOR_SIGN[link.op]} ${link.b} = ?`,
      choices, correctIndex,
      solutionText: formatEquation(link.op, value, link.b, link.result),
      practiceKey: `${link.op}:${value}:${link.b}`,
    });
    links.push(link);
    value = link.result;
  }
  return {
    format: 'chain',
    chain: { start, links },
    steps,
    noTempo: true,
    practiceKey: `chain:${start}:${links.map((l) => `${l.op}${l.b}`).join(':')}`,
  };
}
