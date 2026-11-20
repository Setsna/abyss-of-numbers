// Zuordnen (Konzept 8.2, Perlenfund; Regelwerk 5.7): vier Rechnungen der vier Rechenarten, jede
// aus der Stufe ihrer Rechenart (stages), vier verschiedene Ergebnisse. Je Schritt eine Rechnung
// („7 · 8 = ?“), als Antworten immer alle vier Ergebnisse (D12); schon zugeordnete Ergebnisse
// zählen als falsch. Drei Schritte, das vierte Paar ergibt sich. Jeder Schritt trägt Leiter und
// Stufe (für die Lernstufen, Etappe 4).
import { generateFromStage } from '../generate.js?v=dc004222';
import { placeCorrect, MAX_TRIES } from './common.js?v=dc004222';
import { formatNumber } from '../format.js?v=dc004222';

const OPS = ['add', 'sub', 'mul', 'div'];

export function generate(stages, area, rng) {
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const items = OPS.map((op) => {
      const t = generateFromStage(op, stages[op], area, rng);
      return { expr: t.prompt, result: t.result, operation: op, a: t.a, b: t.b, stageId: t.stageId, way: t.way };
    });
    if (new Set(items.map((x) => x.result)).size < 4) continue;
    const ordered = rng.shuffle(items);
    const { choices } = placeCorrect(formatNumber(ordered[0].result), ordered.slice(1).map((x) => formatNumber(x.result)), rng);
    const steps = ordered.slice(0, 3).map((item) => ({
      prompt: 'task.match',
      display: `${item.expr} = ?`,
      choices: choices.slice(),
      correctIndex: choices.indexOf(formatNumber(item.result)),
      solutionText: `${item.expr} = ${formatNumber(item.result)}`,
      practiceKey: `${item.operation}:${item.a}:${item.b}`,
      ladder: item.operation,
      stageId: item.stageId,
      way: item.way,
    }));
    return {
      format: 'match',
      match: { items: ordered.map(({ expr, result }) => ({ expr, result })) },
      steps,
      noTempo: true,
      practiceKey: `match:${ordered.map((x) => `${x.operation}${x.a}_${x.b}`).join(':')}`,
    };
  }
  throw new Error('keine vier verschiedenen Ergebnisse gefunden');
}
