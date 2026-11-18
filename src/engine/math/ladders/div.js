// Leiter Geteilt (Phase 6b; Regelwerk 5.4, 6.4): Geteilt-Stufe n besteht aus den Umkehraufgaben der
// Mal-Stufe n (`from`). Der Divisor ist einer der beiden Faktoren: zufällig (divisor: any, Standard),
// immer die einstellige Zahl (small) oder immer 10 beziehungsweise 100 (pow10).
// Die Mal-Stufe wird beim Laden des Lehrplans eingehängt (stage.fromStage, siehe index.js).
import * as mul from './mul.js?v=650280d9';

export const kinds = ['inverse'];

export function drawStage(stage, rng) {
  if (stage.kind !== 'inverse' || !stage.fromStage) throw new Error(`Geteilt-Stufe ${stage.id} ohne Mal-Stufe`);
  const { a: x, b: y, result } = mul.drawStage(stage.fromStage, rng);
  const rule = stage.divisor ?? 'any';
  const isDivisor = (f) => (rule === 'small' ? f < 10 : rule === 'pow10' ? f === 10 || f === 100 : true);
  // zufällige Reihenfolge kommt aus mul.drawStage; der erste passende Faktor wird Divisor
  const d = isDivisor(x) ? x : y;
  if (!isDivisor(d)) throw new Error(`${stage.id}: kein Divisor nach Regel ${rule} in ${x} · ${y}`);
  return { a: result, b: d, result: result / d };
}
