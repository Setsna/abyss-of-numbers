// Ergänzen zur Zielzahl (Konzept 8.2, Seetang-Trank; Regelwerk 5.5): „37 + ? = 40“.
// Die Stufe nennt die erste Zahl (a als Zahlbereich) und das Ziel: eine feste Zahl (to: 100, 1000)
// oder das nächste Vielfache (toNext: 10, 100).
// Falsche Antworten: F-COMP-a jede Ziffer einzeln zu 10 ergänzt (37 → 73), F-COMP-b an der
// nächsthöheren Stelle um 1 daneben, F-COMP-c an der Rechenstelle um 1 daneben (A-9),
// F-COMP-d die letzte Ziffer der ersten Zahl genannt (37 + ? = 40 → 7), F-COMP-e nur bis zum
// nächsten Zehner (bei glatten Zahlen: Hunderter) ergänzt (37 + ? = 100 → 3).
import { drawUntil } from './common.js?v=650280d9';
import { pickChoices, commonRound } from '../mistakes.js?v=650280d9';
import { calcPlace, digitAt } from '../places.js?v=650280d9';
import { wayFor } from '../ways.js?v=650280d9';
import { formatNumber } from '../format.js?v=650280d9';

const nextMult = (a, k) => Math.ceil((a + 1) / k) * k;

function digitComplement(a, target) {
  const p = calcPlace(a);
  let out = 0;
  for (let q = p; q < target; q *= 10) out += (10 - digitAt(a, q)) * q;
  return out;
}

export function generate(stageIn, area, rng) {
  // Klasse 4: eine von mehreren Varianten (zum nächsten Zehntausender oder Hunderttausender)
  const stage = stageIn.variants ? { ...stageIn, ...rng.pick(stageIn.variants) } : stageIn;
  const r = stage.a;
  const step = r.step ?? 1;
  const a = drawUntil(() => r.min + step * rng.nextInt(0, Math.floor((r.max - r.min) / step)),
    (n) => !(r.notMultipleOf && n % r.notMultipleOf === 0));
  const target = stage.to ?? nextMult(a, stage.toNext);
  const answer = target - a;
  const p = calcPlace(answer);
  const pa = calcPlace(a);
  const all = {
    'F-COMP-a': [digitComplement(a, target)],
    'F-COMP-b': [answer - 10 * p, answer + 10 * p],
    'F-COMP-c': [answer - p, answer + p],
    'F-COMP-d': [digitAt(a, pa) * pa],
    'F-COMP-e': [nextMult(a, 10 * pa) - a],
  };
  const cands = stage.mistakes.flatMap((type) => all[type].map((value) => ({ value, type })));
  const k = commonRound(a, target);
  const { choices, correctIndex, choiceTypes } = pickChoices(answer, cands, { min: 1, max: area.maxNumber, roundTo: k, exclude: [a, target] }, rng); // nie Startzahl oder Ziel (Review 7b, B9)
  return {
    format: 'complement',
    a, target,
    prompt: 'task.complement',
    display: `${formatNumber(a)} + ? = ${formatNumber(target)}`,
    choices, correctIndex, choiceTypes,
    solutionText: `${formatNumber(a)} + ${formatNumber(answer)} = ${formatNumber(target)}`,
    extraMs: stage.extraMs ?? 0,
    timeClass: stage.time ?? null, // Regelwerk 5.5: Stufe 3 und 6 mittel; ohne Angabe die Grundzeit des Formats
    practiceKey: `complement:${a}:${target}`,
    ladder: 'comp', stageId: stage.id,
    way: wayFor('comp', { a, target }),
  };
}
