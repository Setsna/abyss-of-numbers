// Rätselraum im Tempel (Phase 9, Etappe 7; Regelwerk 13.4): eine Truhe mit Zahlenschloss.
// Die Aufgabe entsteht aus dem Seed des Raums, deshalb ist sie nach dem Neuladen dieselbe.
import { createRng, deriveSeed } from '../rng.js?v=e3e07a37';
import { generateTask } from '../math/generate.js?v=e3e07a37';
import { curriculumOf, stageAt, stageWithoutLearning } from '../math/ladders/index.js?v=e3e07a37';
import { resolveCurriculum } from '../combat/combat.js?v=e3e07a37';
import { stageFor } from '../learning/learning.js?v=e3e07a37';

// Zahlenmauer oder Zahlenfolge (je zur Hälfte) auf der Stufe des Kindes im Gebiet;
// ohne Lernstufen (Ausschalter) die mittlere Stufe des Fensters (Regelwerk 7.6).
// stufe: gespeicherte Stufe eines offenen Rätsels (Neuladen), sonst die aktuelle.
// areaId: Schlüssel der Lernstufen im Spielstand (Gebiet); curriculumId: Fenster im Lehrplan.
export function createRiddle({ config, save, curriculumId, areaId = curriculumId, runSeed, roomId, stufe: saved }) {
  const rng = createRng(deriveSeed(runSeed, `riddle:${roomId}`));
  const { format, ladder } = rng.pick(config.riddles.formats);
  const cur = curriculumOf(config, save.klasse);
  const win = cur.windows[curriculumId][ladder];
  const stufe = saved ?? (config.game.learning.enabled ? stageFor(save.lernen, save.klasse, areaId, ladder, win) : stageWithoutLearning(win, 'normal'));
  const task = generateTask({ format, stages: { [ladder]: stageAt(cur, ladder, stufe) } }, resolveCurriculum(config, save.klasse, curriculumId), rng);
  return { roomId, format, ladder, win, stufe, task, steps: task.steps ?? [task] };
}
