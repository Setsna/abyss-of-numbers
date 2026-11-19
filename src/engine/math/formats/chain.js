// Kettenaufgabe (Konzept 8.2, Blasenkette; Regelwerk 5.6): mit dem Ergebnis weiterrechnen, drei Glieder,
// zum Beispiel 24 + 8 = 32, 32 − 5 = 27, 27 + 6 = 33. Die Stufe nennt Start (Zahlbereich), die
// Plus- und Minusglieder (plusMinus) und die Grenzen der Zwischenergebnisse (min, max).
// Mit `mulFirst` ist das erste Glied „mal 2, 3, 4 oder 5“ (Einmaleins beziehungsweise Zehnereinmaleins);
// sonst gibt es kein Malglied (D13: kein 18 · 3).
// Falsche Antworten je Glied: die Fehlertypen der Rechenart (linkMistakes je Rechenart).
// Jedes Glied ist ein Schritt mit vier Antworten.
import { formatEquation, formatExpression } from '../format.js?v=0bcb9d58';
import { mistakesFor, pickChoices, commonRound } from '../mistakes.js?v=0bcb9d58';
import { calcPlace } from '../places.js?v=0bcb9d58';
import { MAX_TRIES } from './common.js?v=0bcb9d58';
import { wayFor } from '../ways.js?v=0bcb9d58';

const drawRange = (r, rng) => r.min + (r.step ?? 1) * rng.nextInt(0, Math.floor((r.max - r.min) / (r.step ?? 1)));

function drawLinks(stage, rng) {
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const start = drawRange(stage.start, rng);
    const links = [];
    let v = start;
    let ok = true;
    for (let i = 0; i < stage.links && ok; i++) {
      let link;
      if (i === 0 && stage.mulFirst) {
        const b = rng.pick(stage.mulFirst);
        link = { op: 'mul', b, result: v * b };
      } else {
        const op = rng.nextUint32() % 2 === 0 ? 'add' : 'sub';
        const b = drawRange(stage.plusMinus, rng);
        link = { op, b, result: op === 'add' ? v + b : v - b };
      }
      ok = link.result >= stage.min && link.result <= stage.max;
      links.push({ ...link, from: v });
      v = link.result;
    }
    if (ok) return { start, links };
  }
  throw new Error('keine passende Kette gefunden');
}

export function generate(stage, area, rng) {
  const { start, links } = drawLinks(stage, rng);
  const steps = links.map((link, i) => {
    const { op, b, result, from } = link;
    const plusMinus = op !== 'mul';
    const cands = mistakesFor(op, { mistakes: stage.linkMistakes[op] }, { a: from, b, result });
    const k = plusMinus ? commonRound(from, b) : 1;
    const { choices, correctIndex, choiceTypes } = pickChoices(result, cands, {
      min: plusMinus ? 0 : 1, max: area.maxNumber, roundTo: k, fillStep: plusMinus ? k : Math.min(calcPlace(result), 10),
    }, rng);
    return {
      prompt: 'task.chain',
      promptParams: { n: i + 1, of: links.length },
      display: `${formatExpression(op, from, b)} = ?`,
      choices, correctIndex, choiceTypes,
      solutionText: formatEquation(op, from, b, result),
      practiceKey: `${op}:${from}:${b}`,
      ladder: 'chain', stageId: stage.id,
      way: wayFor(op, { a: from, b }),
    };
  });
  return {
    format: 'chain',
    chain: { start, links: links.map(({ op, b, result }) => ({ op, b, result })) },
    steps,
    noTempo: true,
    extraMs: stage.extraMs ?? 0,
    practiceKey: `chain:${start}:${links.map((l) => `${l.op}${l.b}`).join(':')}`,
    ladder: 'chain', stageId: stage.id,
  };
}
