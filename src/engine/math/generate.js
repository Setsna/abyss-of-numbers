// Aufgabengenerator nach dem Regelwerk (Phase 6b, docs/superpowers/specs/2026-11-18-mathe-regelwerk-design.md).
// Jede Aufgabe kommt aus einer Leiterstufe (config/curricula/class<N>.json → ladders); der Kampf
// reicht die Stufen des Aufgabenplans als spec.stages herein. Formate: solve (Rechnung lösen),
// pickTrue, pickFalse, dazu die Formate unter formats/.
import { mistakesFor, pickChoices, commonRound } from './mistakes.js?v=5b590f55';
import { LADDERS, FORMAT_LADDER } from './ladders/index.js?v=5b590f55';
import { calcPlace } from './places.js?v=5b590f55';
import { formatExpression, formatEquation } from './format.js?v=5b590f55';
import { wayFor } from './ways.js?v=5b590f55';
import { placeCorrect, MAX_TRIES } from './formats/common.js?v=5b590f55';
import * as numberLine from './formats/number-line.js?v=5b590f55';
import * as sequence from './formats/sequence.js?v=5b590f55';
import * as complement from './formats/complement.js?v=5b590f55';
import * as chain from './formats/chain.js?v=5b590f55';
import * as wall from './formats/wall.js?v=5b590f55';
import * as match from './formats/match.js?v=5b590f55';
import * as twoStep from './formats/two-step.js?v=5b590f55';
import * as pointBeforeLine from './formats/point-before-line.js?v=5b590f55';
import * as compareTerms from './formats/compare-terms.js?v=5b590f55';
import * as divisibility from './formats/divisibility.js?v=5b590f55';

const FORMATS = { numberLine, sequence, complement, chain, wall, match, twoStep, pointBeforeLine, compareTerms, divisibility };
const OPERATIONS = ['add', 'sub', 'mul', 'div'];

// pickTrue: eine Gleichung stimmt, drei sind falsch. pickFalse: umgekehrt (Regelwerk 5.7).
// Jede Rechnung kommt aus der Stufe ihrer Rechenart (stages); eine falsche Gleichung zeigt den
// ersten Fehlertyp ihrer Stufe, der unter A-2 und A-5 möglich ist. Die gesuchte Gleichung ist items[0].
function wrongShown(op, stage, n, area, rng) {
  const plusMinus = op === 'add' || op === 'sub';
  const k = plusMinus ? commonRound(n.a, n.b) : 1;
  // Plus und Minus: nicht eine der beiden Zahlen als Ergebnis („789 + 100 = 789“ wäre ohne Rechnen als falsch
  // erkennbar, Phase 7a). Bei Geteilt bleibt der Teiler als Ergebnis, er ist ein typischer Fehler (F-DIV-b).
  const ok = (v) => Number.isInteger(v) && v !== n.result && !(plusMinus && (v === n.a || v === n.b)) && v >= (plusMinus ? 0 : 1) && v <= area.maxNumber && v % k === 0;
  const cands = mistakesFor(op, stage, n).filter((m) => ok(m.value));
  const type = stage.mistakes.find((t) => cands.some((m) => m.type === t));
  if (!type) return null;
  // nur die nächsten Nachbarn: 3 · 3 = 6, nicht 3 · 3 = 3; 12 : 3 = 5, nicht 12 : 3 = 2 (Phase 7a)
  const ofType = cands.filter((m) => m.type === type);
  const near = Math.min(...ofType.map((m) => Math.abs(m.value - n.result)));
  return rng.pick(ofType.filter((m) => Math.abs(m.value - n.result) === near)).value;
}

function buildPick(format, stages, area, rng) {
  const wantTrue = format === 'pickTrue';
  const ops = OPERATIONS.filter((op) => stages[op]);
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const items = Array.from({ length: 4 }, () => {
      const operation = rng.pick(ops);
      return { operation, ...LADDERS[operation].drawStage(stages[operation], rng) };
    });
    const lhs = items.map((it) => formatExpression(it.operation, it.a, it.b));
    // vier verschiedene Rechnungen; Tauschaufgaben zählen als dieselbe (A-3; Review 7b, B10)
    if (new Set(lhs).size < 4 || new Set(items.map((it) => taskKey(it.operation, it.a, it.b))).size < 4) continue;
    const shown = items.map((it, i) => ((i === 0) === wantTrue ? it.result : wrongShown(it.operation, stages[it.operation], it, area, rng)));
    if (shown.includes(null)) continue;
    const texts = items.map((it, i) => formatEquation(it.operation, it.a, it.b, shown[i]));
    const target = items[0];
    const { choices, correctIndex } = placeCorrect(texts[0], texts.slice(1), rng);
    return {
      format, operation: target.operation, a: target.a, b: target.b, result: target.result,
      prompt: `task.${format}`,
      choices, correctIndex,
      solutionText: formatEquation(target.operation, target.a, target.b, target.result),
      practiceKey: `${target.operation}:${target.a}:${target.b}`,
    };
  }
  throw new Error('keine vier verschiedenen Gleichungen gefunden');
}

// Schlüssel einer Rechnung für „keine Aufgabe doppelt im Kampf“ (A-3); Tauschaufgaben gleich
export function taskKey(operation, a, b) {
  const [x, y] = operation === 'add' || operation === 'mul' ? [Math.min(a, b), Math.max(a, b)] : [a, b];
  return `${operation}:${x}:${y}`;
}

const AVOID_TRIES = 60; // danach darf wiederholt werden (Vorrat der Stufe erschöpft)

// „Rechnung lösen“ aus einer Leiterstufe (Phase 6b, Regelwerk 5.1, 5.2). avoid: Set von taskKey oder null.
export function generateFromStage(ladder, stage, area, rng, avoid = null) {
  let n = LADDERS[ladder].drawStage(stage, rng);
  for (let i = 0; avoid && avoid.has(taskKey(ladder, n.a, n.b)) && i < AVOID_TRIES; i++) n = LADDERS[ladder].drawStage(stage, rng);
  return taskFromNumbers(ladder, stage, n, area, rng);
}

const APPLY = { add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => a / b };

// „Rechnung lösen“ mit vorgegebenen Zahlen (Übungsaufgabe aus der Liste des Kindes, Regelwerk 7.2);
// falsche Antworten nach den Fehlertypen der Stufe.
export function taskFromNumbers(ladder, stage, { a, b }, area, rng) {
  const result = APPLY[ladder](a, b);
  const n = { a, b, result };
  // A-5 nur bei Plus und Minus; bei Mal und Geteilt sind Nachbaraufgaben und Stellenfehler die typischen Fehler
  const plusMinus = ladder === 'add' || ladder === 'sub';
  const { choices, correctIndex, choiceTypes } = pickChoices(result, mistakesFor(ladder, stage, n), {
    min: plusMinus ? 0 : 1, max: area.maxNumber, roundTo: plusMinus ? commonRound(a, b) : 1,
    // Auffüllen bei Mal und Geteilt: an der Stelle des Ergebnisses (8000 → 7000, 9000, nicht 8010; Review 7b, B8)
    fillStep: plusMinus ? commonRound(a, b) : calcPlace(result),
    sameUnits: stage.sameUnits === true, prefer: stage.prefer ?? null,
    // Plus und Minus: keine der beiden Zahlen als Antwort (23 + 10 → nicht 23; Review 7b, B9)
    exclude: plusMinus ? [a, b] : [],
  }, rng);
  return {
    format: 'solve', operation: ladder, a, b, result,
    prompt: formatExpression(ladder, a, b),
    choices, correctIndex, choiceTypes,
    solutionText: formatEquation(ladder, a, b, result),
    practiceKey: `${ladder}:${a}:${b}`,
    ladder, stageId: stage.id, timeClass: stage.time,
    way: wayFor(ladder, { a, b }), // Rechenweg nach einem Fehler (Regelwerk 8.1)
  };
}

// Formate, die ihre Rechnungen aus den Stufen der vier Rechenarten holen (Regelwerk 5.7)
const COMPOSITE = new Set(['match', 'compareTerms', 'twoStep']);

export function generateTask(spec, area, rng) {
  const stages = spec.stages;
  if (!stages) throw new Error(`${spec.format}: Stufen des Aufgabenplans fehlen (spec.stages)`);
  if (spec.format === 'solve') {
    if (!stages[spec.operation]) throw new Error(`Rechnung lösen: keine Stufe für ${spec.operation}`);
    return generateFromStage(spec.operation, stages[spec.operation], area, rng, spec.avoid ?? null);
  }
  if (spec.format === 'pickTrue' || spec.format === 'pickFalse') return buildPick(spec.format, stages, area, rng);
  if (COMPOSITE.has(spec.format)) return FORMATS[spec.format].generate(stages, area, rng, spec);
  const ladder = FORMAT_LADDER[spec.format];
  if (!ladder) throw new Error(`unbekanntes Aufgabenformat: ${spec.format}`);
  if (!stages[ladder]) throw new Error(`${spec.format}: keine Stufe der Leiter ${ladder} im Gebiet`);
  return FORMATS[spec.format].generate(stages[ladder], area, rng, spec);
}
