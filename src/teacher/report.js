// Lernübersicht für die Lehrkraft (Phase 10, Etappe 1; Konzept 2026-11-20, Abschnitt 4).
// Reine Funktionen ohne Browser: Eingabe die Spielstände als Text (wie in an_stand/<code>.spielstand) mit den
// Vornamen aus dem Lehrerbereich, Ausgabe fertige Tabellen als Daten. Das Modul erzeugt kein HTML; der
// Lehrerbereich und die Vorschau zeichnen jede Tabelle mit einer allgemeinen Funktion.
//   Table = { id, title, columns: [{ key, label }], rows: [{ cells: { key: Text oder Zahl }, child? }], note? }
import { migrateSave, repairSave, validateSave, SAVE_VERSION } from '../engine/save/save.js?v=dc004222';
import { starCount } from '../engine/progression/depth.js?v=dc004222';
import { dayKey } from '../engine/progression/statistics.js?v=dc004222';
import { curriculumOf } from '../engine/math/ladders/index.js?v=dc004222';

const OPS = ['add', 'sub', 'mul', 'div'];
const HELP_MIN = 6; // ab so vielen Antworten in statistik.letzte
const HELP_MAX = 2;
const HARD_MAX = 15;

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// Ein Spielstand als Text → { state: 'ok' | 'empty' | 'unreadable' | 'newer', save? }
export function readEntry(text, config) {
  if (text === null || text === undefined || text === '') return { state: 'empty' };
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { state: 'unreadable' }; }
  if (!isObj(parsed) || !Number.isInteger(parsed.version)) return { state: 'unreadable' };
  if (parsed.version > SAVE_VERSION) return { state: 'newer' };
  try {
    const { save } = migrateSave(parsed, config);
    repairSave(save, config);
    if (validateSave(save, config).length > 0) return { state: 'unreadable' };
    return { state: 'ok', save };
  } catch {
    return { state: 'unreadable' };
  }
}

const STATE_TEXT = { empty: 'noch nicht gespielt', unreadable: 'nicht lesbar', newer: 'neuere Fassung, Seite neu laden' };

function dateText(ms, tz) {
  const [y, m, d] = dayKey(ms, tz).split('-');
  return `${d}.${m}.${y}`;
}

const runsText = (pair) => `${pair[0]} geschafft, ${pair[1]} verloren`;
function runTotals(st) {
  const t = [0, 0];
  for (const depths of Object.values(st?.lauf ?? {})) for (const [w, l] of Object.values(depths)) { t[0] += w; t[1] += l; }
  return t;
}

const learn = (save) => save.lernen?.[save.klasse] ?? { gebiete: {}, hoechste: {} };

// Höchste Stufe einer Leiter: Merker hoechste (nur nach Aufstieg) und aktuelle Stufen aller Gebiete (Konzept 4.1)
function highest(save, ladder) {
  const l = learn(save);
  const values = [l.hoechste?.[ladder], ...Object.values(l.gebiete ?? {}).map((g) => g?.[ladder]?.stufe)].filter((n) => Number.isInteger(n));
  return values.length ? Math.max(...values) : null;
}

function stageText(save, config, stages, ladder, n) {
  if (!n) return '–';
  const stage = curriculumOf(config, save.klasse).ladders[ladder]?.stages[n - 1];
  const t = stage && stages.stages[stage.id];
  return t ? `Stufe ${n}: ${t.name}, ${t.example}` : `Stufe ${n}`;
}

// Rechenarten, in denen von den letzten Antworten mindestens die Hälfte nicht richtig war (Konzept 4.1, Punkt 2)
function needsHelp(save, stages) {
  const letzte = save.statistik?.letzte ?? {};
  return OPS.map((op, i) => ({ op, i, s: letzte[op] ?? '' }))
    .filter((x) => x.s.length >= HELP_MIN)
    .map((x) => ({ ...x, share: [...x.s].filter((c) => c === '0').length / x.s.length }))
    .filter((x) => x.share >= 0.5)
    .sort((a, b) => b.share - a.share || a.i - b.i)
    .slice(0, HELP_MAX)
    .map((x) => stages.ladders[x.op])
    .join(', ');
}

const areaName = (config, id) => config.texts?.areas?.[id]?.name ?? id;

function childTables(save, config, stages, tz) {
  const st = save.statistik;
  const cur = curriculumOf(config, save.klasse);
  const totals = runTotals(st);
  const kopf = {
    id: 'kopf', title: 'Überblick',
    columns: [{ key: 'was', label: '' }, { key: 'wert', label: '' }],
    rows: [
      ['Klasse im Spiel', save.klasse], ['Zuletzt gespielt', dateText(save.geaendert, tz)],
      ['Spieltage', st ? st.tage : ''], ['Tauchgänge', st ? runsText(totals) : ''],
      ['Heldenstufe', save.stufe], ['Seesterne', starCount(save)],
    ].map(([was, wert]) => ({ cells: { was, wert } })),
    note: st ? undefined : 'Spieltage, Tauchgänge und letzte Antworten zählt das Spiel erst seit dem Update vom November 2026.',
  };
  const area = st?.gebiet;
  const arten = {
    id: 'arten', title: 'Aufgabenarten',
    columns: [{ key: 'art', label: 'Aufgabenart' }, { key: 'aktuell', label: area ? `Stufe im Gebiet ${areaName(config, area)}` : 'Stufe zuletzt' },
      { key: 'hoechste', label: 'Höchste Stufe' }, { key: 'letzte', label: 'Letzte Antworten' }, { key: 'summen', label: 'Antworten bisher' }],
    rows: Object.keys(cur.ladders).map((ladder) => {
      const now = area ? learn(save).gebiete?.[area]?.[ladder]?.stufe : null;
      const sums = st?.antwort?.[ladder];
      return { cells: {
        art: stages.ladders[ladder] ?? ladder,
        aktuell: stageText(save, config, stages, ladder, now),
        hoechste: stageText(save, config, stages, ladder, highest(save, ladder)),
        letzte: [...(st?.letzte?.[ladder] ?? '')].map((c) => (c === '1' ? '✓' : '✗')).join(' '),
        summen: sums ? `${sums[0]} richtig, ${sums[1]} falsch, ${sums[2]} Zeit abgelaufen` : '',
      } };
    }),
  };
  const uebung = {
    id: 'uebung', title: 'Übungsliste (zuletzt falsch gelöst)',
    columns: [{ key: 'aufgabe', label: 'Aufgabe mit Lösung' }],
    rows: Object.values(save.uebung ?? {}).sort((a, b) => b.t - a.t).map((e) => ({ cells: { aufgabe: e.text } })),
  };
  const gebiete = {
    id: 'gebiete', title: 'Gebiete',
    columns: [{ key: 'gebiet', label: 'Gebiet' }, { key: 'tiefe', label: 'Höchste geschaffte Tiefe' }, { key: 'tauchgaenge', label: 'Tauchgänge' }],
    rows: config.areas.order.filter((id) => save.gebiete?.[id]?.offen || st?.lauf?.[id]).map((id) => {
      const depths = Object.values(st?.lauf?.[id] ?? {});
      const sum = depths.reduce((t, [w, l]) => [t[0] + w, t[1] + l], [0, 0]);
      return { cells: { gebiet: areaName(config, id), tiefe: save.gebiete?.[id]?.tiefe ?? 0, tauchgaenge: depths.length ? runsText(sum) : '' } };
    }),
  };
  return [kopf, arten, uebung, gebiete];
}

// entries: [{ name, text }]; options.tzOffsetMinutes: Zeitzone für Datumsangaben (Lehrerbereich: getTimezoneOffset())
export function buildReport(entries, config, stages, { tzOffsetMinutes = 0 } = {}) {
  const tz = tzOffsetMinutes;
  const kinder = [];
  const ok = [];
  const klasse = {
    id: 'klasse', title: 'Klasse',
    columns: [{ key: 'name', label: 'Vorname' }, { key: 'zuletzt', label: 'Zuletzt gespielt' }, { key: 'tage', label: 'Spieltage' },
      { key: 'tauchgaenge', label: 'Tauchgänge' }, { key: 'sterne', label: 'Seesterne' },
      ...OPS.map((op) => ({ key: op, label: stages.ladders[op] })), { key: 'hilfe', label: 'Braucht Hilfe bei' }],
    rows: entries.map(({ name, text }) => {
      const r = readEntry(text, config);
      if (r.state !== 'ok') return { cells: { name, zuletzt: STATE_TEXT[r.state] } };
      const s = r.save;
      const st = s.statistik;
      const cur = curriculumOf(config, s.klasse);
      ok.push(s);
      kinder.push({ name, tables: childTables(s, config, stages, tz) });
      const cells = {
        name, zuletzt: dateText(s.geaendert, tz), tage: st ? st.tage : '', tauchgaenge: st ? runsText(runTotals(st)) : '',
        sterne: starCount(s), hilfe: needsHelp(s, stages),
      };
      for (const op of OPS) {
        const n = highest(s, op);
        cells[op] = n ? `${n} von ${cur.ladders[op].stages.length}` : '–';
      }
      return { cells, child: kinder.length - 1 };
    }),
  };
  return { klasse, kinder, schwer: classTables(ok, config, stages), summen: classSums(ok) };
}

function classTables(saves, config, stages) {
  const byKey = new Map();
  for (const s of saves) for (const [key, e] of Object.entries(s.uebung ?? {})) {
    const rec = byKey.get(key) ?? { text: e.text, kinder: 0 };
    rec.kinder += 1;
    byKey.set(key, rec);
  }
  const aufgaben = {
    id: 'aufgaben', title: `Schwierige Aufgaben (bei den meisten Kindern auf der Übungsliste, höchstens ${HARD_MAX})`,
    columns: [{ key: 'aufgabe', label: 'Aufgabe mit Lösung' }, { key: 'kinder', label: 'bei Kindern' }],
    rows: [...byKey.values()].sort((a, b) => b.kinder - a.kinder || a.text.localeCompare(b.text, 'de')).slice(0, HARD_MAX)
      .map((r) => ({ cells: { aufgabe: r.text, kinder: r.kinder } })),
  };
  const dist = new Map();
  for (const s of saves) for (const op of OPS) {
    const n = highest(s, op);
    if (!n) continue;
    const key = `${s.klasse}|${op}|${n}`;
    dist.set(key, (dist.get(key) ?? 0) + 1);
  }
  const stufen = {
    id: 'stufen', title: 'Höchste Stufe je Rechenart',
    columns: [{ key: 'klasse', label: 'Klasse' }, { key: 'art', label: 'Rechenart' }, { key: 'stufe', label: 'Stufe' }, { key: 'kinder', label: 'Kinder' }],
    rows: [...dist.entries()].map(([key, kinder]) => {
      const [k, op, n] = key.split('|');
      return { k: Number(k), i: OPS.indexOf(op), n: Number(n), cells: { klasse: Number(k), art: stages.ladders[op], stufe: Number(n), kinder } };
    }).sort((a, b) => a.k - b.k || a.i - b.i || a.n - b.n).map(({ cells }) => ({ cells })),
  };
  const runs = new Map();
  for (const s of saves) for (const [area, depths] of Object.entries(s.statistik?.lauf ?? {})) {
    for (const [d, [w, l]] of Object.entries(depths)) {
      const key = `${area}|${d}`;
      const t = runs.get(key) ?? [0, 0];
      runs.set(key, [t[0] + w, t[1] + l]);
    }
  }
  const order = config.areas.order;
  const tiefen = {
    id: 'tiefen', title: 'Tauchgänge der Klasse je Gebiet und Tiefe',
    columns: [{ key: 'gebiet', label: 'Gebiet' }, { key: 'tiefe', label: 'Tiefe' }, { key: 'tauchgaenge', label: 'Tauchgänge' }],
    rows: [...runs.entries()].map(([key, t]) => { const [a, d] = key.split('|'); return { a: order.indexOf(a), d: Number(d), cells: { gebiet: areaName(config, a), tiefe: Number(d), tauchgaenge: runsText(t) } }; })
      .sort((x, y) => x.a - y.a || x.d - y.d).map(({ cells }) => ({ cells })),
  };
  return [aufgaben, stufen, tiefen];
}

// Summen der Klasse ohne Namen und Codes (Konzept 4.1, Knopf „Zahlen ohne Namen herunterladen“)
export function classSums(saves) {
  const jeKlasse = {};
  for (const s of saves) {
    const k = (jeKlasse[s.klasse] ??= { kinder: 0, antwort: {}, lauf: {} });
    k.kinder += 1;
    for (const [ladder, a] of Object.entries(s.statistik?.antwort ?? {})) {
      const t = (k.antwort[ladder] ??= [0, 0, 0]);
      a.forEach((n, i) => { t[i] += n; });
    }
    for (const [area, depths] of Object.entries(s.statistik?.lauf ?? {})) for (const [d, [w, l]] of Object.entries(depths)) {
      const t = ((k.lauf[area] ??= {})[d] ??= [0, 0]);
      t[0] += w; t[1] += l;
    }
  }
  return { kinder: saves.length, jeKlasse };
}
