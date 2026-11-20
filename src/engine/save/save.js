// Spielstand (Architektur 6.3). Deutsche Feldnamen sind gewollt (Abgleich mit den anderen Plattformen).
// Kein Name, kein Freitext, kein Code im Stand.
import { generateMap } from '../dungeon/map.js?v=ac66dd10';
import { createRiddle } from '../dungeon/riddle.js?v=ac66dd10';
import { curriculumOf, stageById } from '../math/ladders/index.js?v=ac66dd10';

// Version 2 (Phase 5, Etappe 2): lauf.laden für den Händler; neue Seekarte.
// Version 3 (Phase 5, Etappe 7): ausruestung { besitz, angelegt }.
// Version 4 (Phase 5, Etappe 8): karten { <Karten-Id>: { richtig } } für die Kartenstufen.
// Version 5 (Phase 5, Etappe 9): einstellung.lautstaerke (0 bis 1).
// Version 6 (D34): stroemung und antworten (mitwachsende Gegner) im Stand des Kindes, über Tauchgänge hinweg.
// Version 7 (Phase 6b, Etappe 4): lernen (Lernstufen je Klasse, Gebiet und Leiter, Regelwerk 7.5);
// Übungseinträge können stufe (Kennung) und richtig (Zähler) tragen. Seit dem Review 7b kann jede Leiter in
// lernen zusätzlich misch tragen (Zähler der Mischregel, Regelwerk 7.2); das Feld ist freiwillig, die Version bleibt 7.
// Version 8 (Phase 9, Jahresausbau Etappe 1): gebiete[id].tiefe (höchste geschaffte Tiefe) und lauf.tiefe.
// Version 9 (Phase 9, Etappe 2): neue Seekarten-Vorlagen; ein laufender Tauchgang endet beim Umbau.
// Version 10 (Phase 9, Etappe 3): talente { "5", "10", "15", "20": Kennung oder null }; lauf.zweiteLuft (frei).
// Version 11 (Phase 9, Etappe 4): gefunden (Karten fürs Album), besiegt (Gegner fürs Meeresbuch).
// Version 12 (D54, 19.11.2026): Strömung höchstens 1,2; ältere Stände werden darauf begrenzt.
// Version 13 (Phase 9, Etappe 5): entdeckt (neue Karten, deren Meldung schon gezeigt wurde).
// Version 14 (Phase 9, Etappe 8): station (gekaufte Stücke); lauf.vorrat und lauf.werkstatt (nur true, frei).
export const SAVE_VERSION = 14;
const MIX_COUNT_MAX = 100; // Obergrenze für den Zähler der Mischregel (gespeichert wird der Rest beim Teilen durch mixEvery)
const SLOTS = ['kopf', 'koerper', 'hand'];
const STATS = ['kraft', 'ruhe', 'leben'];

// hero: { figur, nameA, nameB }; ohne Angabe die erste Figur und der erste Name (Testkämpfe).
export function createSave(now, grade, config, hero = null) {
  const deck = {};
  for (const id of config.decks.starter) deck[id] = (deck[id] ?? 0) + 1;
  const areaIds = config.areas.order;
  const gebiete = Object.fromEntries(areaIds.map((id, i) => [id, { offen: i === 0, geschafft: false, tiefe: 0 }]));
  return {
    version: SAVE_VERSION,
    angelegt: now,
    geaendert: now,
    klasse: grade,
    held: hero ? { figur: hero.figur, nameA: hero.nameA, nameB: hero.nameB } : { figur: Object.keys(config.heroes.figures)[0], nameA: 0, nameB: 0 },
    stufe: 1,
    ep: 0,
    punkte: { kraft: 0, ruhe: 0, leben: 0 },
    deck,
    perlen: 0,
    gebiete,
    lauf: null,
    uebung: {},
    erklaert: {},
    einstellung: { mehrZeit: 'off', ton: true, musik: true, wenigBewegung: false, lautstaerke: config.sounds.defaultVolume },
    ausruestung: { besitz: [], angelegt: { kopf: null, koerper: null, hand: null } },
    karten: {},
    stroemung: 1, // Strömung (D33/D34)
    antworten: [], // letzte Antworten: s schnell richtig, r richtig, f falsch
    lernen: {}, // Lernstufen (Phase 6b, Regelwerk 7)
    talente: { 5: null, 10: null, 15: null, 20: null }, // Talente (Phase 9)
    gefunden: [...new Set(config.decks.starter)], // Kartenalbum (Phase 9)
    besiegt: {}, // Meeresbuch: Gegner-Id oder <Id>.elite → Anzahl (Phase 9)
    entdeckt: [], // neue Karten, deren Meldung gezeigt wurde (Phase 9, Etappe 5)
    station: [], // gekaufte Stücke der Station (Phase 9, Etappe 8)
  };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCount = (v) => Number.isInteger(v) && v >= 0;

// Liefert Fehlertexte „Feld: Problem“; leer = gültig.
export function validateSave(s, config) {
  const errors = [];
  const fail = (field, problem) => errors.push(`${field}: ${problem}`);
  if (!isObj(s)) return ['(Stand): kein Objekt'];

  if (s.version !== SAVE_VERSION) fail('version', `erwartet ${SAVE_VERSION}`);
  for (const f of ['angelegt', 'geaendert', 'ep', 'perlen']) if (!isCount(s[f])) fail(f, 'fehlt oder ist keine ganze Zahl ≥ 0');
  if (s.klasse !== 3 && s.klasse !== 4) fail('klasse', 'muss 3 oder 4 sein');
  if (!Number.isInteger(s.stufe) || s.stufe < 1 || s.stufe > config.levels.xpThresholds.length) fail('stufe', 'außerhalb der Stufen');

  if (!isObj(s.held)) fail('held', 'fehlt');
  else {
    if (!config.heroes.figures[s.held.figur]) fail('held.figur', 'unbekannte Figur');
    if (!isCount(s.held.nameA) || !isCount(s.held.nameB)) fail('held.name', 'muss aus zwei Nummern bestehen');
    else if (s.held.nameA >= config.heroes.nameA.length || s.held.nameB >= config.heroes.nameB.length) fail('held.name', 'Nummer außerhalb der Namenslisten');
  }

  if (!isObj(s.punkte) || !STATS.every((k) => isCount(s.punkte[k]))) fail('punkte', 'kraft, ruhe, leben als ganze Zahlen ≥ 0');
  else if (STATS.some((k) => s.punkte[k] > config.levels.maxPointsPerStat)) fail('punkte', `höchstens ${config.levels.maxPointsPerStat} je Wert`);

  if (!isObj(s.deck)) fail('deck', 'fehlt');
  else for (const [id, n] of Object.entries(s.deck)) {
    if (!config.cards[id]) fail(`deck.${id}`, 'unbekannte Karte');
    if (!isCount(n)) fail(`deck.${id}`, 'Anzahl muss eine ganze Zahl ≥ 0 sein');
  }

  if (!isObj(s.gebiete)) fail('gebiete', 'fehlt');
  else for (const [id, g] of Object.entries(s.gebiete)) {
    if (!isObj(g) || typeof g.offen !== 'boolean' || typeof g.geschafft !== 'boolean') fail(`gebiete.${id}`, 'offen und geschafft als true/false');
    else if (!isCount(g.tiefe)) fail(`gebiete.${id}.tiefe`, 'ganze Zahl ≥ 0 (höchste geschaffte Tiefe)');
  }

  // Strömung (D33/D34)
  const cur = config.game.current;
  if (!(typeof s.stroemung === 'number' && s.stroemung >= cur.min && s.stroemung <= cur.max)) fail('stroemung', `Zahl von ${cur.min} bis ${cur.max}`);
  if (!(Array.isArray(s.antworten) && s.antworten.length <= cur.recentAnswers && s.antworten.every((a) => ['s', 'r', 'f'].includes(a)))) {
    fail('antworten', `Liste aus s, r, f, höchstens ${cur.recentAnswers}`);
  }

  if (s.lauf !== null && !isObj(s.lauf)) fail('lauf', 'muss null oder ein Objekt sein');
  else if (s.lauf) validateRun(s.lauf, config, fail, s);

  if (!isObj(s.uebung)) fail('uebung', 'fehlt');
  else {
    const entries = Object.values(s.uebung);
    if (entries.length > config.game.practiceListMax) fail('uebung', `höchstens ${config.game.practiceListMax} Einträge`);
    if (!entries.every((e) => isObj(e) && typeof e.text === 'string' && isCount(e.t))) fail('uebung', 'Einträge brauchen text und t');
    // Version 7: optional stufe (Kennung aus dem Regelwerk) und richtig (Zähler)
    if (!entries.every((e) => e.stufe === undefined || (typeof e.stufe === 'string' && [3, 4].some((g) => stageById(curriculumOf(config, g), e.stufe))))) fail('uebung', 'stufe muss eine bekannte Kennung sein');
    if (!entries.every((e) => e.richtig === undefined || isCount(e.richtig))) fail('uebung', 'richtig als ganze Zahl ≥ 0');
  }

  if (!isObj(s.erklaert) || !Object.values(s.erklaert).every((v) => v === true)) fail('erklaert', 'nur true-Werte');

  const a = s.ausruestung;
  if (!isObj(a) || !Array.isArray(a.besitz) || !isObj(a.angelegt)) fail('ausruestung', 'besitz (Liste) und angelegt (Plätze)');
  else {
    if (!a.besitz.every((id) => config.items?.[id]) || new Set(a.besitz).size !== a.besitz.length) fail('ausruestung.besitz', 'bekannte Gegenstände, jeder einmal');
    for (const slot of SLOTS) {
      const id = a.angelegt[slot];
      if (id === null) continue;
      if (!a.besitz.includes(id)) fail(`ausruestung.angelegt.${slot}`, 'nicht im Besitz');
      else if (config.items[id].slot !== slot) fail(`ausruestung.angelegt.${slot}`, 'Gegenstand gehört in einen anderen Platz');
    }
    if (Object.keys(a.angelegt).some((k) => !SLOTS.includes(k))) fail('ausruestung.angelegt', `nur ${SLOTS.join(', ')}`);
  }

  if (!isObj(s.karten)) fail('karten', 'fehlt');
  else for (const [id, k] of Object.entries(s.karten)) {
    if (!config.cards[id]) fail(`karten.${id}`, 'unbekannte Karte');
    else if (!isObj(k) || !isCount(k.richtig)) fail(`karten.${id}`, 'richtig als ganze Zahl ≥ 0');
  }

  validateLearning(s.lernen, config, fail);
  // Kartenalbum und Meeresbuch (Phase 9, Etappe 4)
  if (!Array.isArray(s.gefunden) || !s.gefunden.every((id) => config.cards[id]) || new Set(s.gefunden).size !== s.gefunden.length) fail('gefunden', 'Liste bekannter Karten, jede einmal');
  if (!isObj(s.besiegt)) fail('besiegt', 'fehlt');
  else for (const [key, n] of Object.entries(s.besiegt)) {
    const id = key.endsWith('.elite') ? key.slice(0, -6) : key;
    if (!config.enemies[id] && !config.bosses.bosses[id]) fail(`besiegt.${key}`, 'unbekannter Gegner');
    else if (!(Number.isInteger(n) && n >= 1)) fail(`besiegt.${key}`, 'ganze Zahl ≥ 1');
  }
  if (!Array.isArray(s.station) || !s.station.every((id) => config.station?.[id]) || new Set(s.station).size !== s.station.length) fail('station', 'Liste gekaufter Stücke, jedes einmal');
  if (!Array.isArray(s.entdeckt) || !s.entdeckt.every((id) => config.cards[id]) || new Set(s.entdeckt).size !== s.entdeckt.length) fail('entdeckt', 'Liste bekannter Karten, jede einmal');
  // Talente (Phase 9): genau die vier Stufen, je null oder ein Talent dieser Stufe
  const levels = Object.keys(config.talents ?? {});
  if (!isObj(s.talente) || Object.keys(s.talente).sort().join() !== [...levels].sort().join()) fail('talente', `genau die Stufen ${levels.join(', ')}`);
  else for (const [lv, id] of Object.entries(s.talente)) {
    if (id !== null && !config.talents[lv].some((x) => x.id === id)) fail(`talente.${lv}`, 'unbekanntes Talent');
  }
  const e = s.einstellung;
  if (!isObj(e)) fail('einstellung', 'fehlt');
  else {
    if (!(e.mehrZeit in config.game.moreTime)) fail('einstellung.mehrZeit', 'unbekannter Wert');
    for (const k of ['ton', 'musik', 'wenigBewegung']) if (typeof e[k] !== 'boolean') fail(`einstellung.${k}`, 'true oder false');
    if (typeof e.lautstaerke !== 'number' || e.lautstaerke < 0 || e.lautstaerke > 1) fail('einstellung.lautstaerke', 'Zahl von 0 bis 1');
  }
  return errors;
}

// Lernstufen (Regelwerk 7.5): nur bekannte Klassen, Gebiete und Leitern, Stufen innerhalb der Leiter,
// Liste aus 0 und 1 mit höchstens listSize Zeichen.
function validateLearning(lernen, config, fail) {
  if (!isObj(lernen)) { fail('lernen', 'fehlt'); return; }
  const max = config.game.learning.listSize;
  for (const [grade, g] of Object.entries(lernen)) {
    const p = `lernen.${grade}`;
    const cur = (grade === '3' || grade === '4') ? curriculumOf(config, Number(grade)) : null;
    if (!cur) { fail(p, 'unbekannte Klasse'); continue; }
    if (!isObj(g) || !isObj(g.gebiete) || !isObj(g.hoechste) || !Array.isArray(g.eingefuehrt)) { fail(p, 'gebiete, hoechste, eingefuehrt'); continue; }
    const size = (ladder) => cur.ladders[ladder]?.stages?.length ?? 0;
    for (const [areaId, area] of Object.entries(g.gebiete)) {
      const win = cur.windows[areaId];
      if (!win || !isObj(area)) { fail(`${p}.gebiete.${areaId}`, 'unbekanntes Gebiet'); continue; }
      for (const [ladder, e] of Object.entries(area)) {
        const q = `${p}.gebiete.${areaId}.${ladder}`;
        if (!win[ladder]) { fail(q, 'Leiter nicht im Gebiet'); continue; }
        if (!isObj(e) || !Number.isInteger(e.stufe) || e.stufe < 1 || e.stufe > size(ladder)) fail(q, 'stufe außerhalb der Leiter');
        if (typeof e?.liste !== 'string' || !/^[01]*$/.test(e.liste) || e.liste.length > max) fail(q, `liste aus 0 und 1, höchstens ${max}`);
        // Zähler der Mischregel (Review 7b, B1); fehlt bei älteren Ständen und zählt dann ab 0
        if (isObj(e) && e.misch !== undefined && !(isCount(e.misch) && e.misch < MIX_COUNT_MAX)) fail(q, `misch als ganze Zahl von 0 bis ${MIX_COUNT_MAX - 1}`);
      }
    }
    for (const [ladder, n] of Object.entries(g.hoechste)) if (!(Number.isInteger(n) && n >= 1 && n <= size(ladder))) fail(`${p}.hoechste.${ladder}`, 'Stufe der Leiter');
    if (!g.eingefuehrt.every((id) => cur.windows[id])) fail(`${p}.eingefuehrt`, 'nur bekannte Gebiete');
  }
}

// Laufender Tauchgang: Raumkennungen müssen auf der Seekarte aus seed vorkommen.
function validateRun(l, config, fail, save) {
  const area = config.areas.areas[l.gebiet];
  if (!area || area.comingSoon) { fail('lauf.gebiet', 'unbekanntes oder noch nicht spielbares Gebiet'); return; }
  if (!Number.isInteger(l.seed) || l.seed < 0 || l.seed > 0xffffffff) { fail('lauf.seed', 'ganze Zahl 0 bis 2^32−1'); return; }
  if (!Number.isInteger(l.leben) || l.leben < 1) fail('lauf.leben', 'ganze Zahl ≥ 1');
  if (!Number.isInteger(l.tiefe) || l.tiefe < 1) fail('lauf.tiefe', 'ganze Zahl ≥ 1');
  if (l.zweiteLuft !== undefined && typeof l.zweiteLuft !== 'boolean') fail('lauf.zweiteLuft', 'true oder false');
  for (const k of ['vorrat', 'werkstatt']) if (l[k] !== undefined && l[k] !== true) fail(`lauf.${k}`, 'true oder nicht vorhanden');
  const map = generateMap(area, l.seed, config, Number.isInteger(l.tiefe) ? l.tiefe : 1);
  const ids = new Set(map.rooms.map((r) => r.id));
  if (!Array.isArray(l.erledigt) || !l.erledigt.every((id) => ids.has(id))) fail('lauf.erledigt', 'Liste vorhandener Räume');
  if (l.beute !== undefined && (!ids.has(l.beute) || !l.erledigt?.includes?.(l.beute))) fail('lauf.beute', 'erledigter Raum mit offener Kartenauswahl');
  if (l.position !== null && !ids.has(l.position)) fail('lauf.position', 'null oder ein vorhandener Raum');
  // Rätselraum (Phase 9, Etappe 7): offenes Rätsel mit Stein, freien Fehlversuchen und ersten Versuchen je Stein
  if (l.raetsel !== undefined) {
    const r = l.raetsel;
    if (!isObj(r) || !ids.has(r.raum) || l.erledigt?.includes?.(r.raum) || !Number.isInteger(r.stufe) || r.stufe < 1 || !isCount(r.schritt) || !isCount(r.frei)
      || !Array.isArray(r.versucht) || !r.versucht.every((x) => x === 0 || x === 1)) fail('lauf.raetsel', 'offener Raum, stufe, schritt, frei, versucht als Liste aus 0 und 1');
    else if (map.rooms.find((x) => x.id === r.raum)?.type !== 'riddle') fail('lauf.raetsel.raum', 'muss ein Rätselraum sein');
    else if (r.frei > config.riddles.freeMistakes) fail('lauf.raetsel.frei', `höchstens ${config.riddles.freeMistakes}`);
    else {
      // Das Rätsel einmal so bauen wie beim Fortsetzen (Review Etappe 5–8): Stufe im Fenster, Schritt und Versuche passen
      let riddle = null;
      try {
        riddle = createRiddle({ config, save, curriculumId: area.curriculum, runSeed: l.seed, roomId: r.raum, stufe: r.stufe });
      } catch { /* Stufe fehlt in der Leiter */ }
      if (!riddle || r.stufe < riddle.win[0] || r.stufe > riddle.win[1]) fail('lauf.raetsel.stufe', 'Stufe im Fenster des Gebiets');
      else if (r.schritt >= riddle.steps.length || r.versucht.length > riddle.steps.length) fail('lauf.raetsel.schritt', `schritt und versucht passend zu ${riddle.steps.length} Steinen`);
    }
  }
  if (!isObj(l.versuche) || !Object.entries(l.versuche).every(([id, n]) => ids.has(id) && isCount(n))) fail('lauf.versuche', 'Raum → Anzahl');
  if (!isObj(l.laden)) fail('lauf.laden', 'fehlt');
  else for (const [id, rec] of Object.entries(l.laden)) {
    if (!ids.has(id)) fail(`lauf.laden.${id}`, 'unbekannter Raum');
    else if (!isObj(rec) || typeof rec.abgegeben !== 'boolean' || !Array.isArray(rec.gekauft) || !rec.gekauft.every((c) => config.cards[c])
      || (rec.gegenstand !== undefined && rec.gegenstand !== null && !config.items?.[rec.gegenstand])) {
      fail(`lauf.laden.${id}`, 'gekauft als Liste bekannter Karten, abgegeben als true/false');
    }
  }
}

// Hebt ältere Stände auf die aktuelle Version (Prüfschwerpunkt 1). Unbekannte Versionen bleiben,
// wie sie sind; validateSave meldet sie dann. notes: kurze Hinweise, was geändert wurde.
export function migrateSave(raw, config) {
  const notes = [];
  if (!isObj(raw) || !Number.isInteger(raw.version)) return { save: raw, notes };
  const s = raw;
  if (s.version === 1) {
    // Die Seekarte hat seit Version 2 andere Räume: ein laufender Tauchgang wird ohne Strafe
    // abgebrochen; Held, Deck, Perlen, Stufe und alles andere bleiben.
    if (s.lauf) notes.push('lauf: laufender Tauchgang abgebrochen (neue Seekarte)');
    s.lauf = null;
    s.version = 2;
    notes.push('version: 1 → 2');
  }
  if (s.version === 2) {
    s.ausruestung = { besitz: [], angelegt: { kopf: null, koerper: null, hand: null } };
    s.version = 3;
    notes.push('version: 2 → 3 (Ausrüstung)');
  }
  if (s.version === 3) {
    s.karten = {};
    s.version = 4;
    notes.push('version: 3 → 4 (Kartenstufen)');
  }
  if (s.version === 4) {
    if (isObj(s.einstellung)) s.einstellung.lautstaerke = config.sounds.defaultVolume;
    s.version = 5;
    notes.push('version: 4 → 5 (Lautstärke)');
  }
  if (s.version === 5) {
    // Strömung lag kurz im Tauchgang (Commit 1e954d6); seit D34 im Stand des Kindes
    s.stroemung = typeof s.lauf?.stroemung === 'number' ? s.lauf.stroemung : 1;
    s.antworten = Array.isArray(s.lauf?.antworten) ? s.lauf.antworten.slice() : [];
    if (s.lauf) { delete s.lauf.stroemung; delete s.lauf.antworten; }
    s.version = 6;
    notes.push('version: 5 → 6 (Strömung)');
  }
  if (s.version === 6) {
    // Lernstufen (Phase 6b): ohne Vorgeschichte; schon freigeschaltete Gebiete gelten als betreten,
    // dort entfällt der Einführungskampf (Regelwerk 7.5)
    const open = Object.entries(isObj(s.gebiete) ? s.gebiete : {}).filter(([, g]) => g?.offen).map(([id]) => id);
    s.lernen = (s.klasse === 3 || s.klasse === 4) ? { [s.klasse]: { gebiete: {}, hoechste: {}, eingefuehrt: open } } : {};
    s.version = 7;
    notes.push('version: 6 → 7 (Lernstufen)');
  }
  if (s.version === 7) {
    // Tiefenstufen (Phase 9, Konzept 16): ein geschafftes Gebiet zählt als Tiefe 1 und gibt einen Seestern;
    // offene Gebiete bleiben offen, auch wenn die Sterne dafür nicht reichen. Ein laufender Tauchgang ist Tiefe 1.
    for (const g of Object.values(isObj(s.gebiete) ? s.gebiete : {})) if (isObj(g)) g.tiefe = g.geschafft ? 1 : 0;
    if (isObj(s.lauf)) s.lauf.tiefe = 1;
    s.version = 8;
    notes.push('version: 7 → 8 (Tiefen)');
  }
  if (s.version === 8) {
    // Neue Seekarten (Phase 9, Konzept 16): Die Räume eines laufenden Tauchgangs passen nicht mehr.
    // Er endet ohne Verlust; Karten, Perlen, Stufe, Ausrüstung, Lernstufen und Tiefen bleiben.
    if (s.lauf) notes.push('lauf: laufender Tauchgang beendet (neue Seekarten)');
    s.lauf = null;
    s.version = 9;
    notes.push('version: 8 → 9 (Seekarten)');
  }
  if (s.version === 9) {
    // Talente (Phase 9, Etappe 3): noch keins gewählt; wer schon Stufe 5 hat, wählt in der Station
    s.talente = { 5: null, 10: null, 15: null, 20: null };
    s.version = 10;
    notes.push('version: 9 → 10 (Talente)');
  }
  if (s.version === 10) {
    // Kartenalbum und Meeresbuch (Phase 9, Etappe 4): gefunden aus Deck und Kartenstufen; das Meeresbuch beginnt leer
    const known = (id) => Boolean(config.cards[id]);
    s.gefunden = [...new Set([...config.decks.starter, ...Object.keys(isObj(s.deck) ? s.deck : {}), ...Object.keys(isObj(s.karten) ? s.karten : {})])].filter(known);
    s.besiegt = {};
    s.version = 11;
    notes.push('version: 10 → 11 (Album und Meeresbuch)');
  }
  if (s.version === 11) {
    // D54: Strömung höchstens current.max (1,2); ein Kind mit 1,3 oder 1,4 bekommt 1,2
    if (typeof s.stroemung === 'number') s.stroemung = Math.min(s.stroemung, config.game.current.max);
    s.version = 12;
    notes.push('version: 11 → 12 (Strömung höchstens 1,2)');
  }
  if (s.version === 12) {
    // Neue Karten (Phase 9, Etappe 5): noch keine Meldung gezeigt; die Station meldet alle schon erreichten einmal
    s.entdeckt = [];
    s.version = 13;
    notes.push('version: 12 → 13 (neue Karten)');
  }
  if (s.version === 13) {
    // Station ausbauen (Phase 9, Etappe 8): noch nichts gekauft
    s.station = [];
    s.version = 14;
    notes.push('version: 13 → 14 (Station)');
  }
  return { save: s, notes };
}
