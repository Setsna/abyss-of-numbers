// Aufgabengenerator für Gebiet 1 (Plus und Minus bis 100, Einmaleins, Geteilt als Umkehraufgabe).
// Zahlenräume und Stufen stehen in config/curricula/. Formate: solve, pickTrue, pickFalse,
// dazu numberLine, sequence, complement aus formats/.
import { distractorsFor } from './distractors.js';
import { formatExpression, formatEquation } from './format.js';
import * as numberLine from './formats/number-line.js';
import * as sequence from './formats/sequence.js';
import * as complement from './formats/complement.js';
import * as chain from './formats/chain.js';
import * as wall from './formats/wall.js';
import * as match from './formats/match.js';
import * as twoStep from './formats/two-step.js';
import * as pointBeforeLine from './formats/point-before-line.js';
import * as compareTerms from './formats/compare-terms.js';

// Formate aus eigenen Dateien (Phase 5, Etappe 3)
// Mehrschrittig (Phase 5, Etappe 4): chain, wall, match liefern task.steps
// Bossregeln und Tintenwolke (Phase 5, Etappe 6): twoStep, pointBeforeLine, compareTerms
const FORMATS = { numberLine, sequence, complement, chain, wall, match, twoStep, pointBeforeLine, compareTerms };

const OPERATIONS = ['add', 'sub', 'mul', 'div'];
const MAX_TRIES = 10000;

function levelRules(rules, level) {
  const l = rules.levels[String(level)];
  if (!l) throw new Error(`Stufe ${level} fehlt`);
  return l;
}

function drawUntil(draw, accept) {
  for (let i = 0; i < MAX_TRIES; i++) {
    const v = draw();
    if (accept(v)) return v;
  }
  throw new Error('keine passende Aufgabe gefunden');
}

// Zieht a, b, result für eine Rechenart und Stufe.
function drawNumbers(operation, level, area, rng) {
  const r = area[operation];
  const l = levelRules(r, level);
  switch (operation) {
    case 'add':
      // Zahlenraum bis 1000 (Phase 5, Etappe 5): glatte Zehnerzahl plus glatte Zehner oder Hunderter
      if (r.aUnit) {
        return drawUntil(
          () => { const a = r.aUnit * rng.nextInt(r.aMin, r.aMax); const b = l.bUnit * rng.nextInt(l.bMin, l.bMax); return { a, b, result: a + b }; },
          ({ result }) => result <= r.sumMax,
        );
      }
      return drawUntil(
        () => { const a = rng.nextInt(r.aMin, r.aMax); const b = rng.nextInt(r.bMin, r.bMax); return { a, b, result: a + b }; },
        ({ a, b, result }) => result <= r.sumMax && ((a % 10) + (b % 10) >= 10) === l.carry,
      );
    case 'sub':
      if (r.aUnit) {
        return drawUntil(
          () => { const a = r.aUnit * rng.nextInt(r.aMin, r.aMax); const b = l.bUnit * rng.nextInt(l.bMin, l.bMax); return { a, b, result: a - b }; },
          ({ result }) => result >= r.resultMin,
        );
      }
      return drawUntil(
        () => {
          const a = rng.nextInt(r.aMin, r.aMax);
          const b = rng.nextInt(r.bMin, Math.max(r.bMin, a - r.resultMin));
          return { a, b, result: a - b };
        },
        ({ a, b, result }) => result >= r.resultMin && ((a % 10) < (b % 10)) === l.borrow,
      );
    case 'mul': {
      const x = rng.pick(l.a);
      const y = (r.bUnit ?? 1) * rng.nextInt(r.bMin, r.bMax); // bUnit 10: Zehnerzahl (3 · 60)
      // Reihenfolge der Faktoren zufällig
      const [a, b] = rng.nextUint32() % 2 === 0 ? [x, y] : [y, x];
      return { a, b, result: a * b };
    }
    case 'div': {
      const b = (r.divisorUnit ?? 1) * rng.pick(l.divisor); // divisorUnit 10: 210 : 30
      const result = rng.nextInt(r.quotientMin, r.quotientMax);
      return { a: b * result, b, result };
    }
    default:
      throw new Error(`unbekannte Rechenart: ${operation}`);
  }
}

function placeCorrect(correct, wrong, rng) {
  const choices = rng.shuffle([correct, ...wrong]);
  return { choices, correctIndex: choices.indexOf(correct) };
}

function solveTask(operation, level, area, rng) {
  const { a, b, result } = drawNumbers(operation, level, area, rng);
  const wrong = distractorsFor(operation, a, b, result, area.maxNumber, rng);
  const { choices, correctIndex } = placeCorrect(String(result), wrong.map(String), rng);
  return {
    format: 'solve', operation, a, b, result,
    prompt: formatExpression(operation, a, b),
    choices, correctIndex,
    solutionText: formatEquation(operation, a, b, result),
    practiceKey: `${operation}:${a}:${b}`,
  };
}

// pickTrue: eine Gleichung stimmt, drei sind falsch. pickFalse: umgekehrt.
// Die gesuchte Gleichung ist items[0]; alle vier Rechnungen sind verschieden.
function buildPick(format, level, area, rng) {
  const wantTrue = format === 'pickTrue';
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const items = Array.from({ length: 4 }, () => {
      const operation = rng.pick(OPERATIONS);
      return { operation, ...drawNumbers(operation, level, area, rng) };
    });
    const lhs = items.map((it) => formatExpression(it.operation, it.a, it.b));
    if (new Set(lhs).size < 4) continue;
    const texts = items.map((it, i) => {
      const shownTrue = (i === 0) === wantTrue;
      const shown = shownTrue
        ? it.result
        : distractorsFor(it.operation, it.a, it.b, it.result, area.maxNumber, rng)[0];
      return formatEquation(it.operation, it.a, it.b, shown);
    });
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

// Einfache Rechnung für andere Formate (Zuordnen)
export function generateSolve(operation, level, area, rng) {
  return solveTask(operation, level, area, rng);
}

// Formate mit eigenen Regeln: im Mischgebiet nicht ein Teilgebiet ziehen (Zahlenraum des Grabens)
const OWN_RULES = new Set(['pointBeforeLine']);

export function generateTask(spec, areaRules, rng) {
  const area = areaRules.mixOf && !OWN_RULES.has(spec.format) ? rng.pick(areaRules.mixOf) : areaRules;
  if (spec.format === 'solve') return solveTask(spec.operation, spec.level, area, rng);
  if (spec.format === 'pickTrue' || spec.format === 'pickFalse') return buildPick(spec.format, spec.level, area, rng);
  if (FORMATS[spec.format]) return FORMATS[spec.format].generate(spec.level, area, rng, spec);
  throw new Error(`unbekanntes Aufgabenformat: ${spec.format}`);
}
