// Zahlenmauer (Konzept 8.2, Korallenmauer; Lehrplan „Zahlenmauer“, PDF S. 16; Regelwerk 5.6).
// Drei Stockwerke: Grundsteine a, b, c (Zellen 0–2), Mitte a+b und b+c (Zellen 3, 4), Spitze (5).
// Drei Steine sind leer und werden der Reihe nach gefüllt, jeder aus schon bekannten Steinen:
//   sum:     Grundsteine gegeben → Mitte links, Mitte rechts, Spitze (nur Plus)
//   oneBase: a, c, Mitte links gegeben → b (Minus), Mitte rechts, Spitze
//   fromTop: Spitze, Mitte links, a gegeben → Mitte rechts (Minus), b (Minus), c (Minus)
// Muster, Einheit der Grundsteine (1 oder 10), Grenzen der Grundsteine und Spitze stehen in der Stufe.
// Falsche Antworten je Stein: F-WALL-a an der Rechenstelle um 1 daneben (± Einheit),
// F-WALL-b addiert statt subtrahiert, F-WALL-c die Zahl eines der beiden bekannten Steine.
import { formatEquation } from '../format.js?v=ea296573';
import { drawUntil } from './common.js?v=ea296573';
import { pickChoices } from '../mistakes.js?v=ea296573';
import { wayFor } from '../ways.js?v=ea296573';

// Wie jeder Stein aus anderen folgt: [Zelle, Rechenart, Zelle x, Zelle y] mit Ergebnis = x op y.
const HOW = {
  sum: [[3, 'add', 0, 1], [4, 'add', 1, 2], [5, 'add', 3, 4]],
  oneBase: [[1, 'sub', 3, 0], [4, 'add', 1, 2], [5, 'add', 3, 4]],
  fromTop: [[4, 'sub', 5, 3], [1, 'sub', 3, 0], [2, 'sub', 4, 1]],
};

export function generate(stage, area, rng) {
  const u = stage.units ? rng.pick(stage.units) : stage.unit; // Klasse 4: Tausender oder Zehntausender, eine Einheit je Mauer
  const cells = drawUntil(() => {
    const [a, b, c] = [0, 1, 2].map(() => u * rng.nextInt(stage.baseMin, stage.baseMax));
    return [a, b, c, a + b, b + c, a + 2 * b + c];
  }, (w) => w[5] <= stage.topMax);
  const steps = HOW[stage.pattern].map(([cell, op, xi, yi]) => {
    const result = cells[cell];
    const [x, y] = [cells[xi], cells[yi]];
    const all = { 'F-WALL-a': [result - u, result + u], 'F-WALL-b': op === 'sub' ? [x + y] : [], 'F-WALL-c': [x, y] };
    const cands = stage.mistakes.flatMap((type) => all[type].map((value) => ({ value, type })));
    const { choices, correctIndex, choiceTypes } = pickChoices(result, cands, { min: 0, max: area.maxNumber, roundTo: u }, rng);
    return {
      prompt: 'task.wall',
      display: null,
      cell, op, x, y,
      choices, correctIndex, choiceTypes,
      solutionText: formatEquation(op, x, y, result),
      practiceKey: `${op}:${x}:${y}`,
      ladder: 'wall', stageId: stage.id,
      way: wayFor(op, { a: x, b: y }),
    };
  });
  return {
    format: 'wall',
    wall: { cells, hidden: HOW[stage.pattern].map(([cell]) => cell), pattern: stage.pattern },
    steps,
    noTempo: true,
    extraMs: stage.extraMs ?? 0,
    practiceKey: `wall:${cells.slice(0, 3).join(':')}:${stage.pattern}`,
    ladder: 'wall', stageId: stage.id,
  };
}
