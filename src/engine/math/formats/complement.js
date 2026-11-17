// Ergänzen zur Zielzahl (Konzept 8.2, Seetang-Trank): „37 + ? = 40“ (Stufe 1, zum nächsten
// Zehner) oder „37 + ? = 100“ (Stufe 2). Falsche Antworten: jede Ziffer zu 10 ergänzt (37 → 73),
// um 10 daneben, um 1 daneben, Einerziffer statt Ergänzung. Vorläufige Regeln (D29).
import { drawUntil, pickWrong, placeCorrect } from './common.js';

export function generate(level, area, rng) {
  const r = area.complement;
  const rule = r.levels[String(level)];
  if (!rule) throw new Error(`Stufe ${level} fehlt bei complement`);
  // unit 10 (Phase 5, Etappe 5): alles in Zehnern gerechnet, 370 + ? = 400 oder 370 + ? = 1000
  const u = r.unit ?? 1;
  const a1 = drawUntil(() => rng.nextInt(r.aMin, r.aMax), (n) => n % 10 !== 0);
  const target1 = rule.to === 'ten' ? Math.ceil(a1 / 10) * 10 : rule.to / u;
  const answer1 = target1 - a1;
  const tens = Math.floor(a1 / 10), ones = a1 % 10;
  const candidates = rule.to === 'ten'
    ? [ones, answer1 + 10, answer1 + 1, answer1 - 1]
    : [(10 - tens) * 10 + (10 - ones), answer1 + 10, answer1 - 10, answer1 + 1, answer1 - 1];
  const wrong = pickWrong(answer1, candidates, { min: 1, max: area.maxNumber / u }, rng).map((n) => n * u);
  const a = a1 * u, target = target1 * u, answer = answer1 * u;
  const { choices, correctIndex } = placeCorrect(String(answer), wrong.map(String), rng);
  return {
    format: 'complement',
    a, target,
    prompt: 'task.complement',
    display: `${a} + ? = ${target}`,
    choices, correctIndex,
    solutionText: `${a} + ${answer} = ${target}`,
    practiceKey: `complement:${a}:${target}`,
  };
}
