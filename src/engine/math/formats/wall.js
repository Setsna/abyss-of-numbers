// Zahlenmauer (Konzept 8.2, Korallenmauer; Lehrplan „Zahlenmauer“, PDF S. 16).
// Drei Stockwerke: Grundsteine a, b, c (Zellen 0–2), Mitte a+b und b+c (Zellen 3, 4), Spitze (5).
// Drei Steine sind leer und werden der Reihe nach gefüllt, jeder aus schon bekannten Steinen:
//   sum:     Grundsteine gegeben → Mitte links, Mitte rechts, Spitze (nur Plus)
//   oneBase: a, c, Mitte links gegeben → b (Minus), Mitte rechts, Spitze
//   fromTop: Spitze, Mitte links, a gegeben → Mitte rechts (Minus), b (Minus), c (Minus)
// Vorläufige Regeln (D29).
import { distractorsFor } from '../distractors.js';
import { formatEquation } from '../format.js';
import { drawUntil, placeCorrect } from './common.js';

// Wie jeder Stein aus anderen folgt: [Rechenart, Zelle x, Zelle y] mit Ergebnis = x op y.
const HOW = {
  sum: [[3, 'add', 0, 1], [4, 'add', 1, 2], [5, 'add', 3, 4]],
  oneBase: [[1, 'sub', 3, 0], [4, 'add', 1, 2], [5, 'add', 3, 4]],
  fromTop: [[4, 'sub', 5, 3], [1, 'sub', 3, 0], [2, 'sub', 4, 1]],
};

export function generate(level, area, rng) {
  const r = area.wall;
  const rule = r.levels[String(level)];
  if (!rule) throw new Error(`Stufe ${level} fehlt bei wall`);
  const pattern = rng.pick(rule.patterns);
  const u = r.unit ?? 1; // unit 10: Grundsteine als glatte Zehner (Zahlenraum bis 1000)
  const cells = drawUntil(() => {
    const a = u * rng.nextInt(r.baseMin, r.baseMax);
    const b = u * rng.nextInt(r.baseMin, r.baseMax);
    const c = u * rng.nextInt(r.baseMin, r.baseMax);
    return [a, b, c, a + b, b + c, a + 2 * b + c];
  }, (w) => w[5] <= r.topMax);
  const steps = HOW[pattern].map(([cell, op, x, y]) => {
    const result = cells[cell];
    const wrong = distractorsFor(op, cells[x], cells[y], result, r.topMax, rng);
    const { choices, correctIndex } = placeCorrect(String(result), wrong.map(String), rng);
    return {
      prompt: 'task.wall',
      display: null,
      cell,
      choices, correctIndex,
      solutionText: formatEquation(op, cells[x], cells[y], result),
      practiceKey: `${op}:${cells[x]}:${cells[y]}`,
    };
  });
  return {
    format: 'wall',
    wall: { cells, hidden: HOW[pattern].map(([cell]) => cell), pattern },
    steps,
    noTempo: true,
    practiceKey: `wall:${cells.slice(0, 3).join(':')}:${pattern}`,
  };
}
