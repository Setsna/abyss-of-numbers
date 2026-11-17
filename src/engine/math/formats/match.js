// Zuordnen (Konzept 8.2, Perlenfund): vier Aufgaben, vier Ergebnisse. Je Schritt eine Aufgabe
// („7 · 8 = ?“), als Antworten immer alle vier Ergebnisse (D12: vier Antwortfelder); schon
// zugeordnete Ergebnisse zählen als falsch. Drei Schritte, das vierte Paar ergibt sich.
// Aufgaben aus dem Generator für einfache Rechnungen (Stufe aus den Regeln). Vorläufig (D29).
import { generateSolve } from '../generate.js';
import { placeCorrect, MAX_TRIES } from './common.js';

export function generate(level, area, rng) {
  const r = area.match;
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const items = r.operations.slice(0, 4).map((op) => {
      const t = generateSolve(op, r.level, area, rng);
      return { expr: t.prompt, result: t.result, operation: op, a: t.a, b: t.b };
    });
    if (new Set(items.map((x) => x.result)).size < 4 || new Set(items.map((x) => x.expr)).size < 4) continue;
    const ordered = rng.shuffle(items);
    const { choices } = placeCorrect(String(ordered[0].result), ordered.slice(1).map((x) => String(x.result)), rng);
    const steps = ordered.slice(0, 3).map((item) => ({
      prompt: 'task.match',
      display: `${item.expr} = ?`,
      choices: choices.slice(),
      correctIndex: choices.indexOf(String(item.result)),
      solutionText: `${item.expr} = ${item.result}`,
      practiceKey: `${item.operation}:${item.a}:${item.b}`,
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
