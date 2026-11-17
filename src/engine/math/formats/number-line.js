// Zahlenstrahl (Konzept 8.2, Harpune): „Wo ist die 35?“ Vier Markierungen A bis D am Strahl,
// eine davon die gesuchte Zahl. Falsche Markierungen: ±10 und vertauschte Ziffern (35 → 53),
// sonst ±5, ±10, ±15 … Markierungen liegen mindestens einen halben Strich auseinander.
// Bis 1000 (Phase 5, Etappe 5): Ziel auf `targetStep` (10), vertauschte Ziffern als 640 → 460.
// Vorläufige Regeln (D29); Phase 6a schreibt das Regelwerk.
import { swapDigits } from './common.js';

const LETTERS = ['A', 'B', 'C', 'D'];

export function generate(level, area, rng) {
  const { min, max, step, labelEvery } = area.numberLine;
  const ts = area.numberLine.targetStep ?? 1;
  const gap = step / 2;
  let target;
  do target = ts * rng.nextInt(Math.ceil((min + 1) / ts), Math.floor((max - 1) / ts)); while (target % step === 0);
  const swapped = swapDigits(target / ts);

  const marks = [target];
  const fits = (n) => Number.isInteger(n) && n >= min && n <= max && marks.every((m) => Math.abs(m - n) >= gap);
  for (const n of rng.shuffle([target - step, target + step, swapped === null ? null : swapped * ts])) {
    if (marks.length < 4 && n !== null && fits(n)) marks.push(n);
  }
  for (let k = 1; marks.length < 4; k++) {
    for (const n of rng.shuffle([target - k * gap, target + k * gap])) if (marks.length < 4 && fits(n)) marks.push(n);
    if (k > (max - min) / gap + 2) throw new Error('keine vier Markierungen möglich');
  }
  marks.sort((a, b) => a - b);
  const lower = Math.floor(target / step) * step;
  return {
    format: 'numberLine',
    target,
    line: { min, max, step, labelEvery },
    marks,
    prompt: 'task.numberLine',
    promptParams: { n: target },
    choices: LETTERS.slice(),
    correctIndex: marks.indexOf(target),
    solutionText: `${target} liegt zwischen ${lower} und ${lower + step}.`,
    practiceKey: `numberLine:${target}`,
  };
}
