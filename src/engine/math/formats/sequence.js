// Zahlenfolge fortsetzen (Konzept 8.2, Muschelhorn; Lehrplan „Zahlenfolgen“, PDF S. 16; Regelwerk 5.5).
// Vier Glieder mit gleichem Schritt, gesucht ist das fünfte. Die Stufe nennt Varianten
// ({ dirs, steps, start, startMultipleOfStep }), den Zahlenraum (min, max) und ob die fünf Glieder
// einen Zehner überschreiten müssen (crossTen).
// Falsche Antworten: F-SEQ-a ein Schritt zu viel, F-SEQ-b an der Rechenstelle des Schritts um 1
// daneben (A-9), F-SEQ-c falsche Richtung, F-SEQ-d letztes Glied wiederholt.
import { drawUntil } from './common.js?v=805614a5';
import { pickChoices } from '../mistakes.js?v=805614a5';
import { calcPlace } from '../places.js?v=805614a5';
import { formatNumber } from '../format.js?v=805614a5';

function drawStart(v, st, rng) {
  const r = v.start;
  if (v.startMultipleOfStep) return st * rng.nextInt(Math.ceil(r.min / st), Math.floor(r.max / st));
  // Klasse 4: Start ein Vielfaches derselben Stelle wie der Schritt (Schritt 2000 → Start ein Vielfaches von 1000)
  if (v.startMultipleOfPlace) { const p = calcPlace(st); return p * rng.nextInt(Math.ceil(r.min / p), Math.floor(r.max / p)); }
  const step = r.step ?? 1;
  return r.min + step * rng.nextInt(0, Math.floor((r.max - r.min) / step));
}

export function generate(stage, area, rng) {
  const terms = drawUntil(() => {
    const v = rng.pick(stage.variants);
    const st = rng.pick(v.steps);
    const s = rng.pick(v.dirs) === 'down' ? -st : st;
    const start = drawStart(v, st, rng);
    return Array.from({ length: 5 }, (_, k) => start + k * s);
  }, (t) => t.every((n) => n >= stage.min && n <= stage.max)
    && (!stage.crossTen || Math.floor(t[0] / 10) !== Math.floor(t[4] / 10)));
  const shown = terms.slice(0, 4);
  const answer = terms[4];
  const s = terms[1] - terms[0];
  const p = calcPlace(Math.abs(s));
  const all = {
    'F-SEQ-a': [answer + s], 'F-SEQ-b': [answer - p, answer + p], 'F-SEQ-c': [shown[3] - s], 'F-SEQ-d': [shown[3]],
  };
  const cands = stage.mistakes.flatMap((type) => all[type].map((value) => ({ value, type })));
  const { choices, correctIndex, choiceTypes } = pickChoices(answer, cands, { min: Math.max(0, stage.min), max: Math.min(stage.max, area.maxNumber), fillStep: p }, rng);
  return {
    format: 'sequence',
    shown,
    prompt: 'task.sequence',
    display: `${shown.map(formatNumber).join(', ')}, ?`,
    choices, correctIndex, choiceTypes,
    solutionText: terms.map(formatNumber).join(', '),
    extraMs: stage.extraMs ?? 0,
    practiceKey: `sequence:${terms[0]}:${s}`,
    ladder: 'seq', stageId: stage.id,
  };
}
