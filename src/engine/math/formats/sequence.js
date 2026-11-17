// Zahlenfolge fortsetzen (Konzept 8.2, Muschelhorn; Lehrplan „Zahlenfolgen“, PDF S. 16).
// Vier Glieder mit gleichem Schritt, gesucht ist das fünfte. Falsche Antworten: Schritt einmal
// zu viel, Schritt um 1 falsch, letztes Glied wiederholt. Vorläufige Regeln (D29).
import { pickWrong, placeCorrect, MAX_TRIES } from './common.js';

function drawTerms(r, rng) {
  for (let i = 0; i < MAX_TRIES; i++) {
    const m = r.stepMultiple ?? 1; // bis 1000: Schritte und Start als glatte Zehner
    const size = m * rng.nextInt(Math.ceil(r.stepMin / m), Math.floor(r.stepMax / m));
    const down = rng.nextUint32() % 2 === 1;
    // fallend gespiegelt: Start zwischen max − startMax und max − startMin
    const start = m * (down
      ? rng.nextInt(Math.ceil((r.max - r.startMax) / m), Math.floor((r.max - r.startMin) / m))
      : rng.nextInt(Math.ceil(r.startMin / m), Math.floor(r.startMax / m)));
    const step = down ? -size : size;
    const terms = Array.from({ length: 5 }, (_, k) => start + k * step);
    if (terms.every((n) => n >= r.min && n <= r.max)) return terms;
  }
  throw new Error('keine passende Zahlenfolge gefunden');
}

export function generate(level, area, rng) {
  const r = area.sequence;
  const terms = drawTerms(r, rng);
  const shown = terms.slice(0, 4);
  const answer = terms[4];
  const step = terms[1] - terms[0];
  const m = r.stepMultiple ?? 1;
  const wrong = pickWrong(answer, [answer + step, answer + m, answer - m, shown[3]], { min: r.min, max: r.max, step: m }, rng);
  const { choices, correctIndex } = placeCorrect(String(answer), wrong.map(String), rng);
  return {
    format: 'sequence',
    shown,
    prompt: 'task.sequence',
    display: `${shown.join(', ')}, ?`,
    choices, correctIndex,
    solutionText: terms.join(', '),
    practiceKey: `sequence:${terms[0]}:${step}`,
  };
}
