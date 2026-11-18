// Leitern des Regelwerks (Phase 6b). Jede Leiter: drawStage(stage, rng) → { a, b, result }.
// Stufen und Fenster stehen in config/curricula/class<N>.json unter ladders und windows.
import * as add from './add.js?v=1ea03785';
import * as sub from './sub.js?v=1ea03785';
import * as mul from './mul.js?v=1ea03785';
import * as div from './div.js?v=1ea03785';

export const LADDERS = { add, sub, mul, div };

// Formate mit eigener Leiter (Regelwerk 5.5, 5.6) und ihre Zugarten (für die Prüfung der Konfiguration)
export const FORMAT_LADDER = { numberLine: 'line', sequence: 'seq', complement: 'comp', wall: 'wall', chain: 'chain', pointBeforeLine: 'pvs', divisibility: 'teil' };
export const FORMAT_KINDS = { line: ['line'], seq: ['seq'], comp: ['comp'], wall: ['wall'], chain: ['chain'], pvs: ['pvs'], teil: ['teil'] };

// Stufe n (ab 1) einer Leiter
export function stageAt(curriculum, ladder, n) {
  const stage = curriculum.ladders?.[ladder]?.stages?.[n - 1];
  if (!stage) throw new Error(`Stufe ${n} der Leiter ${ladder} fehlt`);
  return linked(curriculum, stage);
}

// Geteilt-Stufen verweisen mit `from` auf ihre Mal-Stufe; sie wird hier eingehängt (ohne die
// Konfiguration zu verändern).
function linked(curriculum, stage) {
  if (!stage.from || stage.fromStage) return stage;
  const from = findStage(curriculum, stage.from);
  if (!from) throw new Error(`${stage.id}: Stufe ${stage.from} fehlt`);
  return { ...stage, fromStage: from };
}

function findStage(curriculum, id) {
  for (const l of Object.values(curriculum.ladders ?? {})) {
    const s = l.stages.find((x) => x.id === id);
    if (s) return s;
  }
  return null;
}

// Lehrplan einer Klassenstufe; "sameAs" verweist auf eine andere Stufe
export function curriculumOf(config, grade) {
  const cur = config[`class${grade}`];
  return cur?.sameAs ? config[`class${cur.sameAs}`] : cur;
}

// Stufe ohne Lernstand (Regelwerk 7.6): erster Kampf unterer Rand, Boss oberer Rand,
// sonst die mittlere Stufe (bei gerader Anzahl die untere der beiden mittleren).
export function stageWithoutLearning([lo, hi], kind) {
  if (kind === 'intro') return lo;
  if (kind === 'boss') return hi;
  return lo + Math.floor((hi - lo) / 2);
}

// Aufgabenplan für einen Kampf ohne Lernstand. kind: 'intro' | 'normal' | 'boss'
export function planWithoutLearning(curriculum, areaId, kind, grade) {
  const win = { ...(curriculum.windows?.[areaId] ?? {}) };
  const stageOf = Object.fromEntries(Object.entries(win).map(([ladder, w]) => [ladder, stageWithoutLearning(w, kind)]));
  return { grade, stageOf, windows: win };
}

export function stageById(curriculum, id) {
  const s = findStage(curriculum, id);
  return s ? linked(curriculum, s) : null;
}
