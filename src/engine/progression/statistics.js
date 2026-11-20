// Zählung für die Lernübersicht der Lehrkraft (Phase 10, Etappe 1; Konzept 2026-11-20, Abschnitt 4.2).
// Freiwilliges Feld statistik im Spielstand, ohne Versionssprung: Fehlt es, gilt es als leer.
//   tage, tag   Zahl der Spieltage und letzter Spieltag (lokales Datum des Geräts), nur zum Zählen der Tage
//   gebiet      zuletzt getauchtes Gebiet
//   lauf        je Gebiet und Tiefe [geschafft, verloren]; ein abgebrochener Tauchgang zählt nicht
//   antwort     je Leiter [richtig, falsch, Zeit abgelaufen], erster Versuch je Aufgabe und Schritt im Tauchgang
//   letzte      je Leiter die letzten zehn ersten Versuche, '1' richtig, '0' falsch oder zu spät; nie geleert
//   rettung     [geschafft, nicht geschafft] der Rettungsaufgabe (Phase 10, Etappe 4), freiwillig; ihre Antworten zählen nirgends
// Keine Antwortzeiten, keine Zeitpunkte einzelner Antworten.

export const LAST_ANSWERS = 10;

// Kalendertag ohne Datumsobjekt (die Spiellogik kennt keine Uhr und keine Zeitzone, tests/engine-purity.test.js):
// now in Millisekunden seit 1970 (UTC), tzOffsetMinutes wie getTimezoneOffset() des Geräts (Taiwan −480).
// Umrechnung Tage → Datum nach dem gregorianischen Kalender (Algorithmus „civil from days“).
const pad = (n) => String(n).padStart(2, '0');
export function dayKey(now, tzOffsetMinutes = 0) {
  const z = Math.floor((now - tzOffsetMinutes * 60000) / 86400000) + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${y}-${pad(m)}-${pad(d)}`;
}

function stats(save) {
  if (!save.statistik) save.statistik = { tage: 0, lauf: {}, antwort: {}, letzte: {} };
  return save.statistik;
}

// Neuer Kalendertag → ein Spieltag mehr. Ohne gültige Uhrzeit (keine Zahl) zählt nichts.
export function noteDay(save, now, tzOffsetMinutes = 0) {
  if (!Number.isFinite(now) || !Number.isFinite(tzOffsetMinutes)) return;
  const st = stats(save);
  const day = dayKey(now, tzOffsetMinutes);
  if (st.tag !== day) { st.tage += 1; st.tag = day; }
}

export function noteDive(save, areaId, now, tzOffsetMinutes = 0) {
  noteDay(save, now, tzOffsetMinutes);
  stats(save).gebiet = areaId;
}

export function noteRun(save, areaId, depth, won) {
  const area = (stats(save).lauf[areaId] ??= {});
  const rec = (area[String(depth)] ??= [0, 0]);
  rec[won ? 0 : 1] += 1;
}

// Rettungsaufgabe (Regelwerk 14.2): nur ob sie geschafft wurde
export function noteRescue(save, saved) {
  const st = stats(save);
  const rec = (st.rettung ??= [0, 0]);
  rec[saved ? 0 : 1] += 1;
}

const OUTCOME_SLOT = { correct: 0, wrong: 1, timeout: 2 };
export function noteAnswer(save, ladder, outcome) {
  const slot = OUTCOME_SLOT[outcome];
  if (slot === undefined || !ladder) return;
  const st = stats(save);
  const sums = (st.antwort[ladder] ??= [0, 0, 0]);
  sums[slot] += 1;
  st.letzte[ladder] = `${st.letzte[ladder] ?? ''}${slot === 0 ? '1' : '0'}`.slice(-LAST_ANSWERS);
}

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isCount = (n) => Number.isInteger(n) && n >= 0;
const counts = (a, n) => Array.isArray(a) && a.length === n && a.every(isCount);

export function validateStatistics(st, config, fail) {
  if (!isObj(st)) { fail('statistik', 'Objekt'); return; }
  const areas = new Set(config.areas.order);
  const ladders = new Set([...Object.keys(config.class3?.ladders ?? {}), ...Object.keys(config.class4?.ladders ?? {})]);
  if (!isCount(st.tage)) fail('statistik.tage', 'ganze Zahl ≥ 0');
  if (st.tag !== undefined && !(typeof st.tag === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(st.tag))) fail('statistik.tag', 'Datum JJJJ-MM-TT');
  if (st.gebiet !== undefined && !areas.has(st.gebiet)) fail('statistik.gebiet', 'bekanntes Gebiet');
  if (!isObj(st.lauf)) fail('statistik.lauf', 'Objekt');
  else {
    for (const [areaId, depths] of Object.entries(st.lauf)) {
      if (!areas.has(areaId) || !isObj(depths)) { fail(`statistik.lauf.${areaId}`, 'bekanntes Gebiet mit Tiefen'); continue; }
      for (const [d, rec] of Object.entries(depths)) {
        if (!/^[1-9]\d*$/.test(d) || !counts(rec, 2)) fail(`statistik.lauf.${areaId}.${d}`, 'Tiefe ≥ 1 mit [geschafft, verloren]');
      }
    }
  }
  if (st.rettung !== undefined && !counts(st.rettung, 2)) fail('statistik.rettung', '[geschafft, nicht geschafft] als ganze Zahlen ≥ 0');
  for (const key of ['antwort', 'letzte']) {
    if (!isObj(st[key])) { fail(`statistik.${key}`, 'Objekt'); continue; }
    for (const [ladder, v] of Object.entries(st[key])) {
      if (!ladders.has(ladder)) fail(`statistik.${key}.${ladder}`, 'bekannte Leiter');
      else if (key === 'antwort' && !counts(v, 3)) fail(`statistik.antwort.${ladder}`, '[richtig, falsch, Zeit abgelaufen]');
      else if (key === 'letzte' && !(typeof v === 'string' && v.length <= LAST_ANSWERS && /^[01]*$/.test(v))) fail(`statistik.letzte.${ladder}`, `höchstens ${LAST_ANSWERS} Zeichen aus 0 und 1`);
    }
  }
}
