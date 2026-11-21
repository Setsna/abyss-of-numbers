// Tagesauftrag (Phase 10, Etappe 5; Konzept 2026-11-20, Abschnitt 6; Regelwerk 14.3 bis 14.5).
// Freiwilliges Feld auftrag im Spielstand, ohne Versionssprung:
//   { tag: 'JJJJ-MM-TT', art: 'uebung' | 'rechenart' | 'serie', leiter (nur rechenart), ziel, stand, geschafft, gemeldet }
// Ein Auftrag je Spieltag; er entsteht, wenn das Kind an dem Tag zum ersten Mal die Station sieht (game.js).
// Welche Art kommt, hängt nur vom Stand ab (kein Zufall). Der alte Auftrag verfällt still.
import { dayKey } from './statistics.js?v=f988db35';
import { curriculumOf } from '../math/ladders/index.js?v=f988db35';

const OPS = ['add', 'sub', 'mul', 'div'];
const ARTS = ['uebung', 'rechenart', 'serie'];

// Rechenarten mit einer „Rechnung lösen“-Karte im Deck
function solveOps(save, config) {
  return new Set(Object.keys(save.deck ?? {}).map((id) => config.cards[id]?.task)
    .filter((t) => t?.format === 'solve' && t.operation).map((t) => t.operation));
}

// Übungsaufgaben, die als Fehleraufgabe vorkommen können (Regelwerk 14.5 Nr. 1): Stufe der aktuellen Klasse,
// im Fenster eines offenen Gebiets für ihre Rechenart, Rechnung-lösen-Karte dieser Rechenart im Deck.
function usablePractice(save, config) {
  const cur = curriculumOf(config, save.klasse);
  const ops = solveOps(save, config);
  const open = Object.keys(save.gebiete ?? {}).filter((id) => save.gebiete[id]?.offen && cur.windows?.[id]);
  return Object.entries(save.uebung ?? {}).filter(([key, e]) => {
    const op = key.split(':')[0];
    if (!e?.stufe || !OPS.includes(op) || !ops.has(op)) return false;
    const n = (cur.ladders?.[op]?.stages ?? []).findIndex((s) => s.id === e.stufe) + 1;
    return n > 0 && open.some((id) => { const w = cur.windows[id][op]; return w && n >= w[0] && n <= w[1]; });
  }).length;
}

export function chooseMission(save, config, day) {
  const cfg = config.game.mission;
  const base = { tag: day, stand: 0, geschafft: false, gemeldet: false };
  if (config.game.learning.enabled && usablePractice(save, config) >= cfg.goals.uebung) {
    return { tag: day, art: 'uebung', ziel: cfg.goals.uebung, stand: 0, geschafft: false, gemeldet: false };
  }
  const ops = solveOps(save, config);
  let best = null;
  let most = 2; // mindestens drei nicht richtige
  for (const op of OPS) {
    if (!ops.has(op)) continue;
    const zeros = [...(save.statistik?.letzte?.[op] ?? '')].filter((x) => x === '0').length;
    if (zeros > most) { best = op; most = zeros; }
  }
  if (best) return { tag: day, art: 'rechenart', leiter: best, ziel: cfg.goals.rechenart, ...base };
  return { tag: day, art: 'serie', ziel: cfg.goals.serie, ...base };
}

// true, wenn ein neuer Auftrag angelegt wurde. Ohne gültige Zeit, ohne Spielstand oder ausgeschaltet: nichts.
// Ausgeschaltet: ein vorhandener Auftrag wird verworfen (Abschlussreview Phase 10, I1), sonst bliebe er für immer stehen.
export function ensureMission(save, config, now, tzOffsetMinutes = 0) {
  if (save && !config.game.mission?.enabled) { delete save.auftrag; return false; }
  if (!save || !Number.isFinite(now) || !Number.isFinite(tzOffsetMinutes)) return false;
  const day = dayKey(now, tzOffsetMinutes);
  if (save.auftrag?.tag === day) return false;
  save.auftrag = chooseMission(save, config, day);
  return true;
}

// kind: 'practice' { correct } (Fehleraufgabe beantwortet), 'ladder' { ladder, correct } (Zählung der
// Lernübersicht), 'answer' { correct } (jede Antwort im Kampf, für die Serie). Liefert missionDone beim Abschluss.
// day: heutiger Tag (JJJJ-MM-TT); ein Auftrag von einem anderen Tag zählt nicht mehr (Abschlussreview Phase 10, I2a).
export function noteMission(save, config, kind, { ladder = null, correct = false } = {}, day = null) {
  const m = save.auftrag;
  if (!m || m.geschafft || !config.game.mission?.enabled || (day !== null && day !== m.tag)) return [];
  if (m.art === 'uebung' && kind === 'practice' && correct) m.stand += 1;
  else if (m.art === 'rechenart' && kind === 'ladder' && correct && ladder === m.leiter) m.stand += 1;
  else if (m.art === 'serie' && kind === 'answer') m.stand = correct ? m.stand + 1 : 0;
  else return [];
  if (m.stand < m.ziel) return [];
  m.geschafft = true;
  const reward = config.game.mission.reward;
  save.perlen += reward;
  return [{ type: 'missionDone', reward }];
}

// Mischregel im Auftrag „Übungsliste“ (Regelwerk 14.3): zusätzliche Stelle für Fehleraufgaben, 0 = keine
export function missionPracticeEvery(save, config) {
  const m = save.auftrag;
  return m && config.game.mission?.enabled && m.art === 'uebung' && !m.geschafft ? config.game.mission.practiceEvery : 0;
}

const isCount = (n) => Number.isInteger(n) && n >= 0;
export function validateMission(m, config, fail) {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) { fail('auftrag', 'Objekt'); return; }
  if (!(typeof m.tag === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.tag))) fail('auftrag.tag', 'Datum JJJJ-MM-TT');
  if (!ARTS.includes(m.art)) fail('auftrag.art', ARTS.join(', '));
  if (m.art === 'rechenart' ? !OPS.includes(m.leiter) : m.leiter !== undefined) fail('auftrag.leiter', 'Rechenart nur beim Auftrag rechenart');
  if (!(Number.isInteger(m.ziel) && m.ziel >= 1)) fail('auftrag.ziel', 'ganze Zahl ≥ 1');
  if (!isCount(m.stand)) fail('auftrag.stand', 'ganze Zahl ≥ 0');
  for (const k of ['geschafft', 'gemeldet']) if (typeof m[k] !== 'boolean') fail(`auftrag.${k}`, 'true oder false');
}
