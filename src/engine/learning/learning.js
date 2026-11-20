// Lernstufen je Leiter und Gebiet (Phase 6b, Etappe 4; Regelwerk 7.1, 7.3, 7.7). Rein, ohne Zufall.
// Stand im Spielstand (Feld lernen, Version 7):
//   { "<klasse>": { gebiete: { "<gebiet>": { "<leiter>": { stufe, liste, misch? } } }, hoechste: { "<leiter>": n }, eingefuehrt: ["<gebiet>"] } }
// misch: Zähler der Mischregel (7.2), wievielte Aufgabe dieser Leiter seit der letzten Wiederholung (0 bis mixEvery − 1).
// liste: die letzten gezählten Antworten, "1" richtig, "0" nicht richtig, älteste zuerst.

const ARITHMETIC = ['add', 'sub', 'mul', 'div'];
const clamp = (n, [lo, hi]) => Math.min(hi, Math.max(lo, n));

function gradeOf(lernen, grade) {
  const key = String(grade);
  if (!lernen[key]) lernen[key] = { gebiete: {}, hoechste: {}, eingefuehrt: [] };
  return lernen[key];
}

// Stufe einer Leiter im Gebiet; legt sie beim ersten Mal an (Regelwerk 7.1 Nr. 2): höchste Stufe
// dieser Leiter aus einem anderen Gebiet, begrenzt durch das Fenster; ohne Vorgeschichte der untere Rand.
export function stageFor(lernen, grade, areaId, ladder, win) {
  const g = gradeOf(lernen, grade);
  const area = g.gebiete[areaId] ?? (g.gebiete[areaId] = {});
  if (!area[ladder]) {
    const known = Object.values(g.gebiete).map((a) => a[ladder]?.stufe).filter((n) => Number.isInteger(n));
    area[ladder] = { stufe: clamp(known.length ? Math.max(...known) : win[0], win), liste: '' };
  }
  area[ladder].stufe = clamp(area[ladder].stufe, win);
  return area[ladder].stufe;
}

// Eine gezählte Antwort verbuchen (Regelwerk 7.1 Nr. 3 bis 5). Liefert { stufe, change: 'up' | 'down' | null }.
export function recordAnswer(lernen, grade, areaId, ladder, correct, win, cfg) {
  stageFor(lernen, grade, areaId, ladder, win);
  const entry = gradeOf(lernen, grade).gebiete[areaId][ladder];
  entry.liste = `${entry.liste}${correct ? '1' : '0'}`.slice(-cfg.listSize);
  const right = [...entry.liste].filter((c) => c === '1').length;
  const wrong = entry.liste.length - right;
  let change = null;
  if (entry.liste.length === cfg.listSize && right >= cfg.upCorrect && entry.stufe < win[1]) change = 'up';
  else if (entry.liste.length >= cfg.downMin && wrong >= cfg.downWrong && entry.stufe > win[0]) change = 'down';
  if (change) {
    entry.stufe += change === 'up' ? 1 : -1;
    entry.liste = '';
  }
  return { stufe: entry.stufe, change };
}

export function isIntroduced(lernen, grade, areaId) {
  return Boolean(lernen[String(grade)]?.eingefuehrt?.includes(areaId));
}

export function markIntroduced(lernen, grade, areaId) {
  const g = gradeOf(lernen, grade);
  if (!g.eingefuehrt.includes(areaId)) g.eingefuehrt.push(areaId);
}

// Höchste erreichte Stufe je Leiter (Regelwerk 7.7); true nur beim ersten Erreichen
export function noteHighest(lernen, grade, ladder, stufe) {
  const g = gradeOf(lernen, grade);
  if ((g.hoechste[ladder] ?? 0) >= stufe) return false;
  g.hoechste[ladder] = stufe;
  return true;
}

// Alle vier Rechenarten am oberen Rand des Gebietsfensters (Regelwerk 7.3)
export function atTopEverywhere(lernen, grade, areaId, windows) {
  const area = lernen[String(grade)]?.gebiete?.[areaId];
  return ARITHMETIC.filter((l) => windows[l]).every((l) => area?.[l]?.stufe === windows[l][1]);
}

// Zähler der Mischregel je Leiter im Gebiet (Review 7b, B1). Er steht im Spielstand, weil ein Kampf allein
// selten vier Aufgaben einer Leiter hat: Leiter → Anzahl seit der letzten Wiederholung.
export function mixCounts(lernen, grade, areaId) {
  const area = lernen[String(grade)]?.gebiete?.[areaId] ?? {};
  return Object.fromEntries(Object.entries(area).map(([ladder, e]) => [ladder, e.misch ?? 0]));
}

// counts: Zählerstand des Kampfs (Leiter → Anzahl); gespeichert wird der Rest beim Teilen durch mixEvery.
export function saveMixCounts(lernen, grade, areaId, counts, mixEvery) {
  const area = lernen[String(grade)]?.gebiete?.[areaId];
  if (!area || !mixEvery) return;
  for (const [ladder, n] of Object.entries(counts)) if (area[ladder]) area[ladder].misch = n % mixEvery;
}

// Mischregel (Regelwerk 7.2): Von mixEvery Aufgaben einer Leiter ist die letzte eine Wiederholung.
// Eine passende Übungsaufgabe hat Vorrang (practice: nur Einträge dieser Rechenart im Fenster),
// sonst eine zufällige niedrigere Stufe des Fensters; am unteren Rand die aktuelle Stufe.
// count: wievielte Aufgabe dieser Leiter im Kampf (ab 1).
// practiceEvery (Tagesauftrag „Übungsliste“, Regelwerk 14.3): zusätzliche Stelle nur für Fehleraufgaben, nie für Wiederholungen.
export function chooseSource({ stufe, win, count, mixEvery, practiceEvery = 0, practice = [] }, rng) {
  if (!mixEvery || count % mixEvery !== 0) {
    if (practiceEvery && count % practiceEvery === 0 && practice.length > 0) return { source: 'practice', entry: practice[0] };
    return { source: 'current', stufe };
  }
  if (practice.length > 0) return { source: 'practice', entry: practice[0] };
  if (stufe > win[0]) return { source: 'lower', stufe: rng.nextInt(win[0], stufe - 1) };
  return { source: 'current', stufe };
}
