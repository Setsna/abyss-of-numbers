// Spielstand (Architektur 6.3). Deutsche Feldnamen sind gewollt (Abgleich mit den anderen Plattformen).
// Kein Name, kein Freitext, kein Code im Stand.
import { generateMap } from '../dungeon/map.js';

// Version 2 (Phase 5, Etappe 2): lauf.laden für den Händler; neue Seekarte.
// Version 3 (Phase 5, Etappe 7): ausruestung { besitz, angelegt }.
// Version 4 (Phase 5, Etappe 8): karten { <Karten-Id>: { richtig } } für die Kartenstufen.
// Version 5 (Phase 5, Etappe 9): einstellung.lautstaerke (0 bis 1).
// Version 6 (D34): stroemung und antworten (mitwachsende Gegner) im Stand des Kindes, über Tauchgänge hinweg.
export const SAVE_VERSION = 6;
const SLOTS = ['kopf', 'koerper', 'hand'];
const STATS = ['kraft', 'ruhe', 'leben'];

// hero: { figur, nameA, nameB }; ohne Angabe die erste Figur und der erste Name (Testkämpfe).
export function createSave(now, grade, config, hero = null) {
  const deck = {};
  for (const id of config.decks.starter) deck[id] = (deck[id] ?? 0) + 1;
  const areaIds = config.areas.order;
  const gebiete = Object.fromEntries(areaIds.map((id, i) => [id, { offen: i === 0, geschafft: false }]));
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

  if (!isObj(s.deck)) fail('deck', 'fehlt');
  else for (const [id, n] of Object.entries(s.deck)) {
    if (!config.cards[id]) fail(`deck.${id}`, 'unbekannte Karte');
    if (!isCount(n)) fail(`deck.${id}`, 'Anzahl muss eine ganze Zahl ≥ 0 sein');
  }

  if (!isObj(s.gebiete)) fail('gebiete', 'fehlt');
  else for (const [id, g] of Object.entries(s.gebiete)) {
    if (!isObj(g) || typeof g.offen !== 'boolean' || typeof g.geschafft !== 'boolean') fail(`gebiete.${id}`, 'offen und geschafft als true/false');
  }

  // Strömung (D33/D34)
  const cur = config.game.current;
  if (!(typeof s.stroemung === 'number' && s.stroemung >= cur.min && s.stroemung <= cur.max)) fail('stroemung', `Zahl von ${cur.min} bis ${cur.max}`);
  if (!(Array.isArray(s.antworten) && s.antworten.length <= cur.recentAnswers && s.antworten.every((a) => ['s', 'r', 'f'].includes(a)))) {
    fail('antworten', `Liste aus s, r, f, höchstens ${cur.recentAnswers}`);
  }

  if (s.lauf !== null && !isObj(s.lauf)) fail('lauf', 'muss null oder ein Objekt sein');
  else if (s.lauf) validateRun(s.lauf, config, fail);

  if (!isObj(s.uebung)) fail('uebung', 'fehlt');
  else {
    const entries = Object.values(s.uebung);
    if (entries.length > config.game.practiceListMax) fail('uebung', `höchstens ${config.game.practiceListMax} Einträge`);
    if (!entries.every((e) => isObj(e) && typeof e.text === 'string' && isCount(e.t))) fail('uebung', 'Einträge brauchen text und t');
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

  const e = s.einstellung;
  if (!isObj(e)) fail('einstellung', 'fehlt');
  else {
    if (!(e.mehrZeit in config.game.moreTime)) fail('einstellung.mehrZeit', 'unbekannter Wert');
    for (const k of ['ton', 'musik', 'wenigBewegung']) if (typeof e[k] !== 'boolean') fail(`einstellung.${k}`, 'true oder false');
    if (typeof e.lautstaerke !== 'number' || e.lautstaerke < 0 || e.lautstaerke > 1) fail('einstellung.lautstaerke', 'Zahl von 0 bis 1');
  }
  return errors;
}

// Laufender Tauchgang: Raumkennungen müssen auf der Seekarte aus seed vorkommen.
function validateRun(l, config, fail) {
  const area = config.areas.areas[l.gebiet];
  if (!area || area.comingSoon) { fail('lauf.gebiet', 'unbekanntes oder noch nicht spielbares Gebiet'); return; }
  if (!Number.isInteger(l.seed) || l.seed < 0 || l.seed > 0xffffffff) { fail('lauf.seed', 'ganze Zahl 0 bis 2^32−1'); return; }
  if (!Number.isInteger(l.leben) || l.leben < 1) fail('lauf.leben', 'ganze Zahl ≥ 1');
  const ids = new Set(generateMap(area, l.seed, config).rooms.map((r) => r.id));
  if (!Array.isArray(l.erledigt) || !l.erledigt.every((id) => ids.has(id))) fail('lauf.erledigt', 'Liste vorhandener Räume');
  if (l.position !== null && !ids.has(l.position)) fail('lauf.position', 'null oder ein vorhandener Raum');
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
  return { save: s, notes };
}
