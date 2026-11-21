// Leiter Mal (Phase 6b; Regelwerk 5.3, 6.3). Grenzen stehen in config/curricula/.
// Zugarten:
//   facts      ein Faktor aus `rows`, der andere aus `partners` (kleines Einmaleins)
//   scaled     ein Faktor aus `small`, der andere eine Zahl aus `big` mal `unit` oder mal einer Zahl aus
//              `units` (3 · 60, 2 · 300, 9 · 4000, 700 · 100); Produkt höchstens `productMax`
//   roundPair  beide Faktoren eine Ziffer aus `digits` mal einer Zahl aus `units` (40 · 70, 400 · 70)
// Die Reihenfolge der Faktoren ist zufällig.
import { drawUntil } from '../formats/common.js?v=73a74faa';

export const kinds = ['facts', 'scaled', 'roundPair'];

function factors(stage, rng) {
  if (stage.kind === 'facts') return [rng.pick(stage.rows), rng.pick(stage.partners)];
  const unit = () => (stage.units ? rng.pick(stage.units) : stage.unit);
  const ok = ([x, y]) => stage.productMax === undefined || x * y <= stage.productMax;
  if (stage.kind === 'scaled') return drawUntil(() => [rng.pick(stage.small), unit() * rng.pick(stage.big)], ok);
  if (stage.kind === 'roundPair') return drawUntil(() => [rng.pick(stage.digits) * unit(), rng.pick(stage.digits) * unit()], ok);
  throw new Error(`unbekannte Zugart ${stage.kind}`);
}

export function drawStage(stage, rng) {
  const [x, y] = factors(stage, rng);
  const [a, b] = rng.nextUint32() % 2 === 0 ? [x, y] : [y, x];
  return { a, b, result: a * b };
}
