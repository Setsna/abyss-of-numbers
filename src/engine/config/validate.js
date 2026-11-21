// Prüft die geladene Konfiguration. Liefert Fehlertexte „Datei: Feld: Problem“;
// eine leere Liste heißt: alles in Ordnung. Jede Etappe ergänzt ihre Regeln.
import { CONFIG_FILES } from './files.js?v=2f163403';
import { nextSlots } from '../dungeon/map.js?v=2f163403';
import { REJECT_REASONS } from '../combat/combat.js?v=2f163403';
import { LADDERS, FORMAT_LADDER, FORMAT_KINDS } from '../math/ladders/index.js?v=2f163403';

function at(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function checker(file, data, errors) {
  const fail = (path, problem) => errors.push(`${file}: ${path}: ${problem}`);
  return {
    fail,
    object(path) {
      const v = at(data, path);
      if (v === null || typeof v !== 'object' || Array.isArray(v)) { fail(path, 'fehlt oder ist kein Objekt'); return false; }
      return true;
    },
    number(path, { min = -Infinity, max = Infinity, integer = false } = {}) {
      const v = at(data, path);
      if (typeof v !== 'number' || !Number.isFinite(v)) return fail(path, 'fehlt oder ist keine Zahl');
      if (integer && !Number.isInteger(v)) return fail(path, 'muss eine ganze Zahl sein');
      if (v < min || v > max) fail(path, `muss zwischen ${min} und ${max} liegen, ist ${v}`);
    },
    string(path) {
      const v = at(data, path);
      if (typeof v !== 'string' || v.trim() === '') fail(path, 'fehlt oder ist leer');
    },
  };
}

function validateGame(file, g, errors) {
  const c = checker(file, g, errors);
  if (c.object('hero')) {
    c.number('hero.maxHp', { min: 1, integer: true });
    c.number('hero.energy', { min: 1, integer: true });
    c.number('hero.handSize', { min: 1, integer: true });
    c.number('hero.discardsPerTurn', { min: 0, integer: true });
  }
  if (c.object('stats')) {
    c.number('stats.strengthDamagePerPoint', { min: 0 });
    c.number('stats.calmMsPerPoint', { min: 0 });
    c.number('stats.hpPerPoint', { min: 0 });
  }
  if (c.object('tempo')) {
    // Strömung (D33)
    const cur = g.current;
    if (!cur || typeof cur !== 'object') c.fail('current', 'fehlt');
    else {
      c.number('current.recentAnswers', { min: 1, integer: true });
      c.number('current.minAnswers', { min: 1, integer: true });
      for (const k of ['step', 'upAccuracy', 'upFastShare', 'downAccuracy']) c.number(`current.${k}`, { min: 0, max: 1 });
      c.number('current.min', { min: 0.1, max: 1 });
      c.number('current.max', { min: 1, max: 3 });
      if (cur.minAnswers > cur.recentAnswers) c.fail('current.minAnswers', 'höchstens recentAnswers');
    }
    const tiers = g.tempo.tiers;
    if (!Array.isArray(tiers) || tiers.length === 0) c.fail('tempo.tiers', 'fehlt oder ist leer');
    else tiers.forEach((t, i) => {
      const p = `tempo.tiers[${i}]`;
      if (!t || typeof t.id !== 'string') c.fail(`${p}.id`, 'fehlt');
      if (!(Number.isInteger(t?.num) && Number.isInteger(t?.den) && t.den > 0 && t.num > 0 && t.num < t.den)) c.fail(p, 'num/den muss ein Bruch zwischen 0 und 1 sein');
      if (!(typeof t?.multiplier === 'number' && t.multiplier >= 1)) c.fail(`${p}.multiplier`, 'muss mindestens 1 sein');
    });
    if (!Array.isArray(g.tempo.appliesTo)) c.fail('tempo.appliesTo', 'fehlt oder ist keine Liste');
  }
  if (c.object('penalty')) {
    c.number('penalty.wrong', { min: 0, integer: true });
    c.number('penalty.timeout', { min: 0, integer: true });
    c.number('penalty.minHp', { min: 1, integer: true });
  }
  // Tagesauftrag (Phase 10, Etappe 5; Regelwerk 14.3 bis 14.5)
  if (c.object('mission')) {
    if (typeof g.mission.enabled !== 'boolean') c.fail('mission.enabled', 'true oder false');
    c.number('mission.reward', { min: 0, integer: true });
    c.number('mission.practiceEvery', { min: 0, integer: true });
    if (!g.mission.goals || typeof g.mission.goals !== 'object') c.fail('mission.goals', 'fehlt');
    else for (const k of ['uebung', 'rechenart', 'serie']) c.number(`mission.goals.${k}`, { min: 1, integer: true });
  }
  // Rettungsaufgabe (Phase 10, Etappe 4; Regelwerk 14)
  if (c.object('rescue')) {
    const r = g.rescue;
    if (typeof r.enabled !== 'boolean') c.fail('rescue.enabled', 'true oder false');
    c.number('rescue.tasks', { min: 1, integer: true });
    c.number('rescue.needed', { min: 1, integer: true });
    if (Number.isInteger(r.needed) && Number.isInteger(r.tasks) && r.needed > r.tasks) c.fail('rescue.needed', 'höchstens tasks');
    if (!(typeof r.hpShare === 'number' && r.hpShare > 0 && r.hpShare <= 1)) c.fail('rescue.hpShare', 'Zahl über 0 bis 1');
  }
  if (c.object('baseTimeMs')) {
    for (const k of ['solve', 'pickTrue', 'pickFalse']) c.number(`baseTimeMs.${k}`, { min: 1000, integer: true });
  }
  // Lernstufen (Phase 6b, Regelwerk 7)
  if (c.object('learning')) {
    const l = g.learning;
    if (typeof l.enabled !== 'boolean') c.fail('learning.enabled', 'true oder false');
    for (const k of ['listSize', 'upCorrect', 'downMin', 'downWrong', 'practiceDoneAfter']) c.number(`learning.${k}`, { min: 1, integer: true });
    for (const k of ['mixEvery', 'newStagePearls']) c.number(`learning.${k}`, { min: 0, integer: true });
    if (l.upCorrect > l.listSize) c.fail('learning.upCorrect', 'höchstens listSize');
    if (l.downMin > l.listSize || l.downWrong > l.downMin) c.fail('learning.downMin', 'downWrong ≤ downMin ≤ listSize');
  }
  // Zeitklassen der Leiterstufen (Phase 6b, Regelwerk A-7)
  if (c.object('timeClassMs')) for (const k of TIME_CLASSES) c.number(`timeClassMs.${k}`, { min: 1000, integer: true });
  if (c.object('moreTime')) {
    for (const k of ['off', 'plus50', 'plus100', 'noTimer']) c.number(`moreTime.${k}`, { min: 0 });
  }
  c.number('practiceListMax', { min: 1, integer: true });
  c.number('practiceShownAfterCombat', { min: 0, integer: true });
  // Serie und Kartenstufen (Phase 5, Etappe 8)
  if (c.object('streak')) {
    c.number('streak.from', { min: 1, integer: true });
    c.number('streak.bonusPerStep', { min: 0, integer: true });
    c.number('streak.maxBonus', { min: 0, integer: true });
  }
  const cl = g.cardLevels;
  if (!Array.isArray(cl) || cl.length === 0 || !cl.every((n, i) => Number.isInteger(n) && n > 0 && (i === 0 || n > cl[i - 1]))) c.fail('cardLevels', 'aufsteigende ganze Zahlen ab 1');
}

function validateTexts(file, t, errors, config) {
  const c = checker(file, t, errors);
  for (const id of Object.keys(config.cards ?? {})) c.string(`cards.${id}.name`);
  for (const id of Object.keys(config.enemies ?? {})) c.string(`enemies.${id}.name`);
  for (const id of Object.keys(config.bosses?.bosses ?? {})) c.string(`enemies.${id}.name`);
  for (const id of Object.keys(config.heroes?.figures ?? {})) c.string(`figures.${id}.name`);
  for (const id of Object.keys(config.cards ?? {})) c.string(`hint.card.${id}`);
  for (const k of ['step1', 'step2', 'step3', 'step4']) c.string(`tutorial.${k}`);
  for (const k of Object.keys(config.game?.moreTime ?? {})) c.string(`adult.moreTimeOpt.${k}`);
  for (const id of Object.keys(config.areas?.areas ?? {})) c.string(`areas.${id}.name`);
  for (const [id, a] of Object.entries(config.areas?.areas ?? {})) if (!a.comingSoon) c.string(`areas.${id}.bossDefeated`);
  for (const reason of REJECT_REASONS) c.string(`reject.${reason}`);
  c.string('title.name');
  c.string('boot.loading');
  c.string('boot.configError');
  c.string('task.pickTrue');
  c.string('task.pickFalse');
}

// Gebiet im Lehrplan (Phase 6b): nur noch der Zahlenraum; Stufen und Fenster stehen unter ladders und windows
function validateArea(c, base) {
  c.number(`${base}.maxNumber`, { min: 10, integer: true });
}

function validateCurriculum(file, cur, errors) {
  const c = checker(file, cur, errors);
  c.number('grade', { min: 1, max: 4, integer: true });
  if ('sameAs' in cur) { c.number('sameAs', { min: 1, max: 4, integer: true }); return; }
  if (c.object('areas')) {
    if (!cur.areas.reef) c.fail('areas.reef', 'fehlt (Gebiet 1)');
    for (const id of Object.keys(cur.areas)) validateArea(c, `areas.${id}`);
  }
  validateLadders(c, cur);
}

// Leitern und Gebietsfenster (Phase 6b, Regelwerk Abschnitt 3)
const TIME_CLASSES = ['short', 'medium', 'long'];
function validateLadders(c, cur) {
  if (!c.object('ladders')) return;
  const ids = new Set();
  for (const [name, ladder] of Object.entries(cur.ladders)) {
    const base = `ladders.${name}`;
    const kinds = LADDERS[name]?.kinds ?? FORMAT_KINDS[name];
    if (!kinds) { c.fail(base, 'unbekannte Leiter'); continue; }
    if (!Array.isArray(ladder?.stages) || ladder.stages.length === 0) { c.fail(`${base}.stages`, 'fehlt oder ist leer'); continue; }
    ladder.stages.forEach((st, i) => {
      const p = `${base}.stages[${i}]`;
      if (typeof st?.id !== 'string' || st.id === '') c.fail(`${p}.id`, 'Kennung aus dem Regelwerk fehlt');
      else if (ids.has(st.id)) c.fail(`${p}.id`, `Kennung ${st.id} doppelt`);
      else ids.add(st.id);
      if (!kinds.includes(st?.kind)) c.fail(`${p}.kind`, `unbekannte Zugart ${st?.kind}`);
      // Zeitklassen sind bei den vier Rechenarten Pflicht; Formate mit eigener Leiter haben ihre Grundzeit (A-7)
      // und dürfen eine Zeitklasse nennen (Ergänzen Stufe 3 und 6, Regelwerk 5.5)
      if (LADDERS[name] ? !TIME_CLASSES.includes(st?.time) : (st?.time !== undefined && !TIME_CLASSES.includes(st.time))) c.fail(`${p}.time`, `eine von ${TIME_CLASSES.join(', ')}`);
    });
  }
  if (!c.object('windows')) return;
  for (const [areaId, win] of Object.entries(cur.windows)) {
    if (!cur.areas?.[areaId]) { c.fail(`windows.${areaId}`, 'unbekanntes Gebiet'); continue; }
    for (const [name, range] of Object.entries(win ?? {})) {
      const p = `windows.${areaId}.${name}`;
      const n = cur.ladders[name]?.stages?.length;
      if (!n) { c.fail(p, 'unbekannte Leiter'); continue; }
      const ok = Array.isArray(range) && range.length === 2 && range.every((x) => Number.isInteger(x) && x >= 1 && x <= n) && range[0] <= range[1];
      if (!ok) c.fail(p, `[von, bis] mit 1 ≤ von ≤ bis ≤ ${n}`);
    }
  }
}

const OPERATIONS = ['add', 'sub', 'mul', 'div'];
const EFFECT_TYPES = ['damage', 'block', 'heal', 'cycle', 'buff', 'breakImmunity', 'damagePerStep', 'energy', 'weaken',
  'damageBlock', 'damageAll', 'damageTwo', 'poison', 'draw', 'slowTime', 'thorns']; // neue Wirkungen: Phase 9, Etappe 5
const BUFF_STATS = ['strength'];
const TASK_FORMATS = ['solve', 'pickTrue', 'pickFalse', 'numberLine', 'sequence', 'complement', 'chain', 'wall', 'match', 'compareTerms'];
const RULE_FORMATS = ['twoStep', 'pointBeforeLine', 'chain']; // nur über Gegnerregeln (chain: Kettenaal, Phase 9)
const MULTI_STEP = ['chain', 'wall', 'match'];
const TARGETS = ['enemy', 'hero', 'enemies']; // enemies: ohne Zielwahl, trifft Gegner selbst (Blasenkette)
const INTENT_TYPES = ['attack', 'block'];

function validateCards(file, cards, errors, config) {
  const c = checker(file, cards, errors);
  for (const [id, card] of Object.entries(cards)) {
    c.number(`${id}.cost`, { min: 0, integer: true });
    c.number(`${id}.price`, { min: 0, integer: true });
    // Sorten und Freischalten (Phase 9, Etappe 5)
    if (!['common', 'rare'].includes(card.rarity)) c.fail(`${id}.rarity`, 'common oder rare');
    c.number(`${id}.unlockStars`, { min: 0, integer: true });
    if (card.rarity === 'rare' && card.unlockStars === 0) c.fail(`${id}.unlockStars`, 'seltene Karten brauchen eine Sternzahl');
    if (!TARGETS.includes(card.target)) c.fail(`${id}.target`, `muss ${TARGETS.join(' oder ')} sein`);
    const type = card.effect?.type;
    if (!EFFECT_TYPES.includes(type)) { c.fail(`${id}.effect.type`, `unbekannt: ${type}`); continue; }
    if (type === 'slowTime') {
      // Ruhige Strömung (Phase 9): keine Aufgabe, Faktor auf die Zeit der nächsten Aufgabe
      c.number(`${id}.effect.factor`, { min: 1, max: 4 });
      if (card.task !== null) c.fail(`${id}.task`, 'slowTime hat keine Aufgabe (null)');
      continue;
    }
    if (type === 'cycle') {
      c.number(`${id}.effect.discard`, { min: 0, integer: true });
      c.number(`${id}.effect.draw`, { min: 0, integer: true });
      if (card.task !== null) c.fail(`${id}.task`, 'Strudel-Karten haben keine Aufgabe (null)');
      continue;
    }
    if (type === 'breakImmunity' || type === 'weaken' || type === 'poison' || type === 'thorns') c.number(`${id}.effect.turns`, { min: 1, integer: true });
    if (type === 'damageBlock') c.number(`${id}.effect.block`, { min: 1, integer: true });
    if (card.effect.keep !== undefined) c.number(`${id}.effect.keep`, { min: 1, integer: true });
    if (card.effect.perStreak !== undefined) c.number(`${id}.effect.perStreak`, { min: 1, integer: true });
    if (type !== 'breakImmunity') c.number(`${id}.effect.amount`, { min: 1, integer: true });
    if (type === 'buff' && !BUFF_STATS.includes(card.effect.stat)) c.fail(`${id}.effect.stat`, `muss ${BUFF_STATS.join(', ')} sein`);
    const format = card.task?.format;
    if (!TASK_FORMATS.includes(format)) { c.fail(`${id}.task.format`, `unbekannt: ${format}`); continue; }
    if (format === 'solve' && !OPERATIONS.includes(card.task.operation)) c.fail(`${id}.task.operation`, `muss ${OPERATIONS.join(', ')} sein`);
    if (card.task.ifLadder !== undefined && !FORMAT_KINDS[card.task.ifLadder]) c.fail(`${id}.task.ifLadder`, 'unbekannte Leiter');
    const wanted = ['damage', 'breakImmunity', 'weaken', 'damageBlock', 'damageTwo', 'poison'].includes(type) ? 'enemy' : ['damagePerStep', 'damageAll'].includes(type) ? 'enemies' : 'hero';
    if (card.target !== wanted) c.fail(`${id}.target`, `muss ${wanted} sein (Wirkung ${type})`);
    if (type === 'damagePerStep' && !MULTI_STEP.includes(format)) c.fail(`${id}.task.format`, 'Schaden je Schritt braucht ein mehrschrittiges Format');
    if (card.task.freeMistakes !== undefined) c.number(`${id}.task.freeMistakes`, { min: 0, integer: true });
    // Kartenstufen (Etappe 8): je Stufe ab 2 ein Teil der Wirkung, gleiche Schlüssel, Typ bleibt
    if (card.upgrades !== undefined) {
      if (!Array.isArray(card.upgrades)) { c.fail(`${id}.upgrades`, 'Liste'); continue; }
      // je Schwelle in game.json (cardLevels) eine Stufe (Phase 9: Stufe 4 und 5)
      if (Array.isArray(config.game?.cardLevels) && card.upgrades.length !== config.game.cardLevels.length) c.fail(`${id}.upgrades`, `genau ${config.game.cardLevels.length} Stufen (wie cardLevels)`);
      card.upgrades.forEach((u, i) => {
        const keys = Object.keys(u ?? {});
        if (keys.length === 0 || keys.some((k) => k === 'type' || !(k in card.effect))) c.fail(`${id}.upgrades[${i}]`, 'nur vorhandene Werte der Wirkung, ohne type');
        else for (const k of keys) if (!(Number.isInteger(u[k]) && u[k] >= card.effect[k])) c.fail(`${id}.upgrades[${i}].${k}`, 'ganze Zahl, nicht kleiner als Stufe 1');
      });
    }
  }
}

function validateDecks(file, decks, errors, config) {
  const c = checker(file, decks, errors);
  const unknownIn = (list) => [...new Set(list.filter((id) => !config.cards?.[id]))];
  if (!Array.isArray(decks.starter) || decks.starter.length === 0) c.fail('starter', 'fehlt oder ist leer');
  else if (unknownIn(decks.starter).length) c.fail('starter', `unbekannte Karten: ${unknownIn(decks.starter).join(', ')}`);
  if (c.object('rewardPools')) {
    for (const [area, list] of Object.entries(decks.rewardPools)) {
      if (!Array.isArray(list) || list.length < Math.max(config.rewards?.cardChoices ?? 3, config.rewards?.shopCards ?? 3)) c.fail(`rewardPools.${area}`, 'braucht mindestens so viele Karten wie zur Wahl oder beim Händler stehen');
      else if (unknownIn(list).length) c.fail(`rewardPools.${area}`, `unbekannte Karten: ${unknownIn(list).join(', ')}`);
    }
  }
  if (!config.cards?.[decks.firstRewardIncludes]) c.fail('firstRewardIncludes', 'muss eine vorhandene Karte sein');
}

function validateLevels(file, levels, errors) {
  const c = checker(file, levels, errors);
  const th = levels.xpThresholds;
  if (!Array.isArray(th) || th.length < 2 || th[0] !== 0 || th.some((v, i) => !Number.isInteger(v) || (i > 0 && v <= th[i - 1]))) {
    c.fail('xpThresholds', 'muss mit 0 beginnen und streng steigen');
  }
  c.number('pointsPerLevel', { min: 1, integer: true });
  c.number('maxPointsPerStat', { min: 1, integer: true }); // Phase 9
}

// Tiefenstufen (Phase 9, Jahresausbau Konzept 7)
function validateDepths(file, d, errors) {
  const c = checker(file, d, errors);
  c.number('enemyPerDepth', { min: 0, max: 1 });
  c.number('rewardPerDepth', { min: 0, max: 1 });
  c.number('bossDeepPhaseFrom', { min: 2, integer: true });
  c.number('repeatBossPearlsFactor', { min: 0, max: 1 });
}

// Elitegegner (Phase 9, Etappe 2)
function validateElites(file, e, errors) {
  const c = checker(file, e, errors);
  c.number('fromDepth', { min: 2, integer: true });
  c.number('hpFactor', { min: 1, max: 3 });
  c.number('rewardPearls', { min: 0, integer: true });
  if (!c.object('rules')) return;
  const known = { guard: ['block', 'every'], regen: ['heal'], rage: ['plus', 'max'] };
  for (const [rule, cfg] of Object.entries(e.rules)) {
    if (!known[rule]) { c.fail(`rules.${rule}`, `unbekannt, erlaubt: ${Object.keys(known).join(', ')}`); continue; }
    for (const k of known[rule]) c.number(`rules.${rule}.${k}`, { min: 1, integer: true });
  }
}

// Ereignisräume (Phase 9, Etappe 2): feste Liste von Wirkungen, je Option höchstens eine Karte oder ein Kampf
const EVENT_EFFECTS = ['hp', 'heal', 'pearls', 'card', 'item', 'fight'];
function validateEvents(file, ev, errors, config) {
  const c = checker(file, ev, errors);
  // Abschlussreview: für Räume ohne Gegner muss es ein Ereignis ohne Kampf geben
  if (!Object.values(ev).some((e) => Array.isArray(e?.options) && e.options.every((o) => !(o?.effects ?? []).some((f) => f?.type === 'fight')))) c.fail('(Ereignisse)', 'mindestens ein Ereignis ohne Kampf');
  for (const [id, e] of Object.entries(ev)) {
    if (!Array.isArray(e?.options) || e.options.length < 2 || e.options.length > 3) { c.fail(`${id}.options`, '2 bis 3 Optionen'); continue; }
    if (e.areas !== undefined && (!Array.isArray(e.areas) || !e.areas.every((a) => config.areas?.areas?.[a]))) c.fail(`${id}.areas`, 'Liste bekannter Gebiete');
    if (typeof config.texts?.events?.[id]?.text !== 'string') c.fail(id, `Text events.${id}.text fehlt`);
    e.options.forEach((o, oi) => {
      const p = `${id}.options[${oi}]`;
      if (typeof o?.id !== 'string' || !o.id) { c.fail(`${p}.id`, 'fehlt'); return; }
      if (typeof config.texts?.events?.[id]?.[o.id] !== 'string') c.fail(p, `Text events.${id}.${o.id} fehlt`);
      if (!Array.isArray(o.effects)) { c.fail(`${p}.effects`, 'Liste'); return; }
      let big = 0;
      o.effects.forEach((f, fi) => {
        const q = `${p}.effects[${fi}]`;
        if (!EVENT_EFFECTS.includes(f?.type)) { c.fail(q, `unbekannte Wirkung ${f?.type}, erlaubt: ${EVENT_EFFECTS.join(', ')}`); return; }
        if (f.type === 'hp' || f.type === 'pearls') { if (!(Number.isInteger(f.amount) && f.amount !== 0)) c.fail(`${q}.amount`, 'ganze Zahl ungleich 0'); }
        if (f.type === 'heal' && !(typeof f.share === 'number' && f.share > 0 && f.share <= 1)) c.fail(`${q}.share`, 'Zahl über 0 bis 1');
        if (f.type === 'fight' && !(Number.isInteger(f.bonusPearls) && f.bonusPearls >= 0)) c.fail(`${q}.bonusPearls`, 'ganze Zahl ≥ 0');
        if (f.type === 'card' || f.type === 'fight') big += 1;
      });
      if (big > 1) c.fail(p, 'höchstens eine Karte oder ein Kampf je Option');
    });
    // Abschlussreview: mindestens eine Option kostet keine Perlen, sonst steckt ein Kind ohne Perlen fest
    if (!e.options.some((o) => !(o?.effects ?? []).some((f) => f?.type === 'pearls' && f.amount < 0))) c.fail(`${id}.options`, 'mindestens eine Option ohne Perlenpreis');
  }
}

// Talente (Phase 9, Etappe 3): je Stufe 5, 10, 15, 20 genau zwei, Kennungen eindeutig, Texte vorhanden
function validateTalents(file, tal, errors, config) {
  const c = checker(file, tal, errors);
  const keys = Object.keys(tal);
  if (keys.join() !== '5,10,15,20') c.fail('(Stufen)', 'genau 5, 10, 15 und 20');
  const seen = new Set();
  for (const [lv, list] of Object.entries(tal)) {
    if (!Array.isArray(list) || list.length !== 2) { c.fail(lv, 'genau zwei Talente'); continue; }
    list.forEach((x, i) => {
      if (typeof x?.id !== 'string' || seen.has(x.id)) c.fail(`${lv}[${i}].id`, 'fehlt oder doppelt');
      seen.add(x?.id);
      checkEffect(c, `${lv}[${i}].effect`, x?.effect);
      if (!config.texts?.talents?.[x?.id]?.name || !config.texts?.talents?.[x?.id]?.text) c.fail(`${lv}[${i}]`, `Text talents.${x?.id} fehlt`);
    });
  }
}

function validateRewards(file, r, errors) {
  const c = checker(file, r, errors);
  for (const k of ['xpPerEnemy', 'xpBoss', 'pearlsBoss']) c.number(k, { min: 0, integer: true });
  c.number('cardChoices', { min: 1, integer: true });
  c.number('shopCards', { min: 1, integer: true });
  c.number('removePrice', { min: 0, integer: true });
  c.number('minDeckSize', { min: 1, integer: true });
  c.number('restHealShare', { min: 0, max: 1 });
  const tp = r.treasurePearls;
  if (!Array.isArray(tp) || tp.length !== 2 || !tp.every((n) => Number.isInteger(n) && n >= 0) || tp[0] > tp[1]) c.fail('treasurePearls', 'zwei ganze Zahlen [von, bis]');
  const p = r.pearlsPerEnemy;
  if (!Array.isArray(p) || p.length !== 2 || !p.every((n) => Number.isInteger(n) && n >= 0) || p[0] > p[1]) c.fail('pearlsPerEnemy', 'zwei ganze Zahlen [von, bis]');
}

// Wirkungen von Stärken und Gegenständen (Phase 5, Etappe 7)
const HERO_EFFECTS = ['maxHp', 'strength', 'calmMs', 'startBlock', 'healBonus', 'discards', 'extraPearls',
  'firstTurnEnergy', 'healAfterWin', 'streakMaxBonus', 'restHealShare', 'secondWind', 'handSize']; // Talente (Phase 9)
function checkEffect(c, path, effect) {
  if (!effect || typeof effect !== 'object' || Object.keys(effect).length === 0) { c.fail(path, 'Wirkung fehlt'); return; }
  for (const [k, v] of Object.entries(effect)) {
    if (!HERO_EFFECTS.includes(k)) c.fail(`${path}.${k}`, `unbekannt, erlaubt: ${HERO_EFFECTS.join(', ')}`);
    else if (!(Number.isInteger(v) && v > 0)) c.fail(`${path}.${k}`, 'ganze Zahl ab 1');
  }
}

function validateItems(file, items, errors) {
  const c = checker(file, items, errors);
  for (const [id, it] of Object.entries(items)) {
    if (!['kopf', 'koerper', 'hand'].includes(it.slot)) c.fail(`${id}.slot`, 'kopf, koerper oder hand');
    c.number(`${id}.price`, { min: 0, integer: true });
    checkEffect(c, `${id}.effect`, it.effect);
  }
}

function validateHeroes(file, h, errors) {
  const c = checker(file, h, errors);
  if (!h.figures || typeof h.figures !== 'object' || Object.keys(h.figures).length === 0) c.fail('figures', 'mindestens eine Figur');
  else for (const [id, f] of Object.entries(h.figures)) {
    if (typeof f?.asset !== 'string') c.fail(`figures.${id}.asset`, 'fehlt');
    if (f.perk !== undefined) checkEffect(c, `figures.${id}.perk`, f.perk);
    // Hüfte des Grundbilds (Anteil der Bildbreite), an der die Kampfposen ausgerichtet werden (D36, Weg 2)
    if (f.poseAnchor !== undefined && !(typeof f.poseAnchor === 'number' && f.poseAnchor >= 0 && f.poseAnchor <= 1)) c.fail(`figures.${id}.poseAnchor`, 'Zahl von 0 bis 1');
  }
  for (const list of ['nameA', 'nameB']) {
    const l = h[list];
    if (!Array.isArray(l) || l.length === 0 || l.some((w) => typeof w !== 'string' || w.trim() === '')) c.fail(list, 'Liste nicht leerer Wörter');
    else if (new Set(l).size !== l.length) c.fail(list, 'Wörter doppelt');
  }
}

function validateEnemies(file, enemies, errors) {
  checkEnemyList(checker(file, enemies, errors), enemies, '');
}

function checkEnemyList(c, enemies, prefix) {
  for (const [key, e] of Object.entries(enemies)) {
    const id = prefix + key;
    c.number(`${id}.hp`, { min: 1, integer: true });
    if (e.immune !== null && e.immune !== undefined && !OPERATIONS.includes(e.immune)) c.fail(`${id}.immune`, `muss ${OPERATIONS.join(', ')} oder null sein`);
    if (!Array.isArray(e.pattern) || e.pattern.length === 0) c.fail(`${id}.pattern`, 'fehlt oder ist leer');
    else e.pattern.forEach((step, i) => {
      if (!INTENT_TYPES.includes(step?.type) || !(Number.isInteger(step.amount) && step.amount >= 0)) c.fail(`${id}.pattern[${i}]`, 'braucht type attack/block und amount ≥ 0');
    });
    // Bossregeln und Kampfphasen (Phase 5, Etappe 6)
    if (e.rule !== undefined && e.rule !== null) checkRule(c, `${id}.rule`, e.rule);
    // deepPhases (Phase 9): zweites Muster ab der Tiefe depths.bossDeepPhaseFrom, gleiche Form wie phases
    for (const key of ['phases', 'deepPhases']) {
      if (e[key] === undefined) continue;
      if (!Array.isArray(e[key])) c.fail(`${id}.${key}`, 'Liste');
      else e[key].forEach((ph, i) => {
        if (!(Number.isInteger(ph?.belowHpPercent) && ph.belowHpPercent > 0 && ph.belowHpPercent < 100)) c.fail(`${id}.${key}[${i}].belowHpPercent`, '1 bis 99');
        if (!Array.isArray(ph?.pattern) || ph.pattern.length === 0 || ph.pattern.some((st) => !INTENT_TYPES.includes(st?.type) || !(Number.isInteger(st.amount) && st.amount >= 0))) c.fail(`${id}.${key}[${i}].pattern`, 'Muster aus attack/block');
        // Phase 9 (Tempelhüter): eine Phase darf die Regel wechseln, null hebt sie auf
        if (ph?.rule !== undefined && ph.rule !== null) checkRule(c, `${id}.${key}[${i}].rule`, ph.rule);
      });
    }
    if (e.shieldedBy !== undefined) {
      if (!Array.isArray(e.shieldedBy) || e.shieldedBy.some((o) => !enemies[o])) c.fail(`${id}.shieldedBy`, 'muss vorhandene Gegner nennen');
    }
  }
}

// Gegnerregel (Phase 5, Etappe 6; Phase 9: wechselnde Immunität des Tauschkrebses)
function checkRule(c, path, r) {
  if (r.type === 'hidden') {
    if (r.find !== 'numberLine') c.fail(`${path}.find`, 'nur numberLine');
    if (!(Number.isInteger(r.multiplier) && r.multiplier >= 1)) c.fail(`${path}.multiplier`, 'ganze Zahl ab 1');
  } else if (r.type === 'taskModifier') {
    if (!RULE_FORMATS.includes(r.format)) c.fail(`${path}.format`, `muss ${RULE_FORMATS.join(', ')} sein`);
  } else if (r.type === 'rotatingImmunity') {
    if (!Array.isArray(r.order) || r.order.length < 2 || r.order.some((op) => !OPERATIONS.includes(op)) || new Set(r.order).size !== r.order.length) {
      c.fail(`${path}.order`, `mindestens zwei verschiedene aus ${OPERATIONS.join(', ')}`);
    }
  } else c.fail(`${path}.type`, 'hidden, taskModifier oder rotatingImmunity');
}

// Rätselraum (Phase 9, Etappe 7; Regelwerk 13.4)
function validateRiddles(file, r, errors) {
  const c = checker(file, r, errors);
  const LADDERS = { wall: 'wall', sequence: 'seq' };
  if (!Array.isArray(r.formats) || r.formats.length === 0 || r.formats.some((f) => LADDERS[f?.format] !== f?.ladder)) c.fail('formats', 'Liste aus { format: wall, ladder: wall } und { format: sequence, ladder: seq }');
  c.number('freeMistakes', { min: 0, max: 5, integer: true });
  if (!Array.isArray(r.pearls) || r.pearls.length !== 2 || !r.pearls.every((n) => Number.isInteger(n) && n >= 0) || r.pearls[0] > r.pearls[1]) c.fail('pearls', '[von, bis] als ganze Zahlen');
}

// Station ausbauen (Phase 9, Etappe 8): Preis, Platz im Stationsbild (Anteile 0 bis 1), freiwilliger Vorteil
const STATION_EFFECTS = { diveStartBlock: [1, 10], extraRest: [1, 1] };
function validateStation(file, st, errors, config) {
  const c = checker(file, st, errors);
  let last = 0;
  for (const [id, it] of Object.entries(st)) {
    c.number(`${id}.price`, { min: 1, integer: true });
    if (Number.isInteger(it?.price) && it.price <= last) c.fail(`${id}.price`, 'Preise steigen in der Reihenfolge der Datei');
    if (Number.isInteger(it?.price)) last = it.price;
    for (const k of ['x', 'y', 'w']) c.number(`${id}.slot.${k}`, { min: 0, max: 1 });
    if (it?.slotPortrait !== undefined) for (const k of ['x', 'y', 'w']) c.number(`${id}.slotPortrait.${k}`, { min: 0, max: 1 });
    if (it?.effect !== undefined) {
      const entries = Object.entries(it.effect ?? {});
      if (entries.length !== 1 || !STATION_EFFECTS[entries[0][0]]) c.fail(`${id}.effect`, `genau ein Vorteil aus ${Object.keys(STATION_EFFECTS).join(', ')}`);
      else { const [k, v] = entries[0]; c.number(`${id}.effect.${k}`, { min: STATION_EFFECTS[k][0], max: STATION_EFFECTS[k][1], integer: true }); }
    }
    if (config?.texts && typeof config.texts.station?.items?.[id]?.name !== 'string') c.fail(id, 'Name fehlt in texts station.items');
  }
}

function validateBosses(file, b, errors) {
  const c = checker(file, b, errors);
  if (!c.object('bosses') || !c.object('encounters')) return;
  checkEnemyList(c, b.bosses, 'bosses.');
  for (const [id, list] of Object.entries(b.encounters)) {
    if (!Array.isArray(list) || list.length === 0) { c.fail(`encounters.${id}`, 'fehlt oder ist leer'); continue; }
    const unknown = list.filter((typeId) => !b.bosses[typeId]);
    if (unknown.length) c.fail(`encounters.${id}`, `unbekannte Bosse: ${unknown.join(', ')}`);
  }
}

// Kampf lösbar mit dem Startdeck (Konzept 7.3): gegen jeden Gegner gibt es eine
// Schadenskarte, gegen die er nicht immun ist; in einer Gruppe ohne Schild-Regel
// sind nie alle Gegner gegen dieselbe Rechenart immun.
function checkGroup(c, path, group, config) {
  const types = group.map((id) => config.enemies?.[id] ?? config.bosses?.bosses?.[id]);
  const unknown = group.filter((id, i) => !types[i]);
  if (unknown.length) { c.fail(path, `unbekannte Gegner: ${unknown.join(', ')}`); return; }
  const shielded = types.some((t) => (t.shieldedBy ?? []).length > 0);
  const immunities = types.map((t) => t.immune ?? null);
  if (!shielded && group.length > 1 && immunities[0] !== null && immunities.every((im) => im === immunities[0])) {
    c.fail(path, `alle Gegner haben dieselbe Immunität (${immunities[0]})`);
  }
}

function validateStarterCoverage(c, config) {
  const ops = new Set((config.decks?.starter ?? [])
    .map((id) => config.cards?.[id])
    .filter((card) => card?.effect?.type === 'damage' && card.task?.operation)
    .map((card) => card.task.operation));
  const all = { ...(config.enemies ?? {}), ...(config.bosses?.bosses ?? {}) };
  for (const [id, e] of Object.entries(all)) {
    if (![...ops].some((op) => op !== e.immune)) c.fail(id, 'keine passende Schadenskarte im Startdeck');
  }
}

const ROOM_TYPES = ['combat', 'rest', 'boss', 'treasure', 'shop', 'elite', 'event', 'riddle']; // riddle: Tempel (Phase 9)
const FIGHT_TYPES = ['combat', 'elite']; // zählen als Kampf auf dem Weg (Phase 9)
const CHOICE_TYPES = ['combat', 'rest', 'treasure', 'shop', 'event', 'riddle']; // „choices“ darf keinen Boss ziehen

// Eine Vorlage der Seekarte prüfen (seit Phase 9 mehrere je Gebiet: layers und moreLayouts[i].layers).
// lp: Pfad für Meldungen, dp: Punkt-Pfad für checker.number.
function validateLayers(c, lp, dp, layers, config) {
  if (!Array.isArray(layers) || layers.length === 0) { c.fail(lp, 'fehlt oder ist leer'); return; }
  if (layers.at(-1)?.rooms?.length !== 1 || layers.at(-1).rooms[0].type !== 'boss') c.fail(lp, 'letzte Schicht muss genau ein Boss-Raum sein');
  // Seekarte (Phase 5, Etappe 2): 1 bis 3 Räume je Schicht, Nachbarn unterscheiden sich um höchstens 1, 7 bis 9 Räume
  const sizes = layers.map((l) => (Array.isArray(l?.rooms) ? l.rooms.length : 0));
  if (sizes.some((n) => n < 1 || n > 3)) c.fail(lp, 'jede Schicht braucht 1 bis 3 Räume');
  if (sizes.some((n, i) => i > 0 && Math.abs(n - sizes[i - 1]) > 1)) c.fail(lp, 'benachbarte Schichten dürfen sich um höchstens einen Raum unterscheiden');
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total < 7 || total > 9) c.fail(lp, `7 bis 9 Räume, gefunden ${total}`);
  if (layers.slice(0, -1).some((l) => l?.rooms?.some((r) => r.type === 'boss'))) c.fail(lp, 'Boss nur in der letzten Schicht');
  layers.forEach((layer, li) => {
    if (!Array.isArray(layer?.rooms) || layer.rooms.length === 0) { c.fail(`${lp}[${li}].rooms`, 'fehlt oder ist leer'); return; }
    layer.rooms.forEach((room, ri) => {
      const p = `${lp}[${li}].rooms[${ri}]`;
      let types;
      if (room.choices !== undefined) {
        if (room.type !== undefined) { c.fail(p, 'entweder type oder choices'); return; }
        if (!Array.isArray(room.choices) || room.choices.length < 2 || !room.choices.every((x) => CHOICE_TYPES.includes(x))) {
          c.fail(`${p}.choices`, `mindestens zwei aus ${CHOICE_TYPES.join(', ')}`); return;
        }
        types = room.choices;
      } else {
        if (!ROOM_TYPES.includes(room.type)) { c.fail(`${p}.type`, `muss ${ROOM_TYPES.join(', ')} sein`); return; }
        types = [room.type];
      }
      // Räume ab einer Tiefe (Phase 9): fromDepth mit fallback (darunter gilt der Ersatzraum)
      if (room.fromDepth !== undefined) {
        if (!(Number.isInteger(room.fromDepth) && room.fromDepth >= 2)) c.fail(`${p}.fromDepth`, 'ganze Zahl ab 2');
        const fb = room.fallback;
        if (!fb || !['combat', 'rest', 'treasure', 'shop'].includes(fb.type)) c.fail(`${p}.fallback`, 'Ersatzraum mit type combat, rest, treasure oder shop');
        else if (fb.type === 'combat' && (!Array.isArray(fb.pool) || fb.pool.length === 0)) c.fail(`${p}.fallback.pool`, 'fehlt oder ist leer');
      }
      // Eliteräume erst ab elites.fromDepth (Abschlussreview)
      if (room.type === 'elite' && !(Number.isInteger(room.fromDepth) && room.fromDepth >= (config.elites?.fromDepth ?? 1))) c.fail(`${p}.fromDepth`, `Eliteraum braucht fromDepth ab ${config.elites?.fromDepth}`);
      if (types.includes('combat') || types.includes('elite') || (room.type === 'event' && room.pool)) {
        if (!Array.isArray(room.pool) || room.pool.length === 0) c.fail(`${p}.pool`, 'fehlt oder ist leer');
        else room.pool.forEach((group, gi) => {
          if (!Array.isArray(group) || group.length < 1 || group.length > 3) c.fail(`${p}.pool[${gi}]`, '1 bis 3 Gegner');
          else checkGroup(c, `${p}.pool[${gi}]`, group, config);
        });
      }
      // Gruppen ab einer Tiefe (Phase 9): deepPools [{ fromDepth ≥ 2, groups }]
      if (room.deepPools !== undefined) {
        if (!Array.isArray(room.deepPools)) c.fail(`${p}.deepPools`, 'Liste');
        else room.deepPools.forEach((dpool, di) => {
          if (!(Number.isInteger(dpool?.fromDepth) && dpool.fromDepth >= 2)) c.fail(`${p}.deepPools[${di}].fromDepth`, 'ganze Zahl ab 2');
          if (!Array.isArray(dpool?.groups) || dpool.groups.length === 0) { c.fail(`${p}.deepPools[${di}].groups`, 'fehlt oder ist leer'); return; }
          dpool.groups.forEach((group, gi) => {
            if (!Array.isArray(group) || group.length < 1 || group.length > 3) c.fail(`${p}.deepPools[${di}].groups[${gi}]`, '1 bis 3 Gegner');
            else checkGroup(c, `${p}.deepPools[${di}].groups[${gi}]`, group, config);
          });
        });
      }
      if (types.includes('boss')) {
        const enc = config.bosses?.encounters?.[room.encounter];
        if (!enc) c.fail(`${p}.encounter`, `unbekannte Begegnung: ${room.encounter}`);
        else checkGroup(c, `${p}.encounter`, enc, config);
      }
      if (types.includes('combat') || types.includes('boss') || types.includes('elite')) c.number(`${dp}.${li}.rooms.${ri}.level`, { min: 1, integer: true });
    });
  });
  // Elitegegner (Konzept 8) lassen sich umgehen: nie allein in einer Schicht
  layers.forEach((layer, li) => {
    if (Array.isArray(layer?.rooms) && layer.rooms.length === 1 && (layer.rooms[0].type === 'elite' || layer.rooms[0].choices?.includes('elite'))) c.fail(`${lp}[${li}]`, 'Eliteraum nie allein in einer Schicht');
  });
  // Jahresausbau (Konzept 8): auf jedem Weg mindestens zwei Kämpfe vor dem Boss
  if (layers.length >= 2 && layers.every((l) => Array.isArray(l?.rooms) && l.rooms.length)) {
    const fight = (spec) => Boolean(spec) && ((FIGHT_TYPES.includes(spec.type) && (spec.fallback === undefined || fight(spec.fallback)))
      || (Array.isArray(spec.choices) && spec.choices.every((x) => FIGHT_TYPES.includes(x))));
    const walk = (li, si, n) => {
      const here = n + (fight(layers[li].rooms[si]) ? 1 : 0);
      if (li >= layers.length - 2) return here >= 2;
      return nextSlots(si, layers[li + 1].rooms.length, layers[li].rooms.length).every((x) => walk(li + 1, x, here));
    };
    if (!layers[0].rooms.every((_, si) => walk(0, si, 0))) c.fail(lp, 'jeder Weg braucht mindestens zwei Kämpfe vor dem Boss');
  }
}

function validateAreas(file, a, errors, config) {
  const c = checker(file, a, errors);
  if (!c.object('areas')) return;
  if (!Array.isArray(a.order) || a.order.length === 0) c.fail('order', 'fehlt oder ist leer');
  else {
    const missing = a.order.filter((id) => !a.areas[id]);
    if (missing.length) c.fail('order', `unbekannte Gebiete: ${missing.join(', ')}`);
  }
  for (const [areaId, area] of Object.entries(a.areas)) {
    const base = `areas.${areaId}`;
    // Preis in Seesternen (Phase 9, Konzept 9); das erste Gebiet ist immer offen
    c.number(`${base}.price`, { min: 0, integer: true });
    if (a.order?.[0] === areaId && area.price !== 0) c.fail(`${base}.price`, 'das erste Gebiet kostet 0');
    if (area.comingSoon === true) continue;
    // Messung (Nachtrag Etappe 7): Fenster eines anderen Gebiets als Rand für stageRank
    if (area.rankFrom !== undefined && (area.rankFrom === areaId || !a.areas[area.rankFrom])) c.fail(`${base}.rankFrom`, 'anderes vorhandenes Gebiet');
    if (!config.decks?.rewardPools?.[areaId]) c.fail(base, 'kein Beutepool in decks.json');
    // Formate mit eigener Leiter (Phase 6b) brauchen ihre Leiter im Gebietsfenster
    for (const grade of ['class3', 'class4']) {
      if (!config[grade]?.windows) continue;
      const win = config[grade].windows[area.curriculum] ?? {};
      for (const cardId of new Set([...(config.decks?.rewardPools?.[areaId] ?? []), ...(config.decks?.starter ?? [])])) {
        const task = config.cards?.[cardId]?.task;
        const ladder = task?.format === 'solve' ? task.operation : FORMAT_LADDER[task?.format];
        if (ladder && !win[ladder]) c.fail(base, `Karte ${cardId} braucht die Leiter ${ladder} im Fenster (${grade}.windows.${area.curriculum})`);
      }
    }
    if (area.moreLayouts !== undefined && !Array.isArray(area.moreLayouts)) c.fail(`${base}.moreLayouts`, 'Liste von Vorlagen');
    validateLayers(c, `${base}.layers`, `${base}.layers`, area.layers, config);
    (Array.isArray(area.moreLayouts) ? area.moreLayouts : []).forEach((l, i) => validateLayers(c, `${base}.moreLayouts[${i}].layers`, `${base}.moreLayouts.${i}.layers`, l?.layers, config));
  }
  validateStarterCoverage(checker('decks/startdeck', {}, errors), config);
}

// Ton (Phase 5, Etappe 9)
const WAVES = ['sine', 'triangle', 'square', 'sawtooth'];
function validateSounds(file, s, errors) {
  const c = checker(file, s, errors);
  const steps = s.volumeSteps;
  if (!Array.isArray(steps) || steps.length === 0 || !steps.every((v) => typeof v === 'number' && v >= 0 && v <= 1)) c.fail('volumeSteps', 'Liste von Zahlen 0 bis 1');
  else if (!steps.includes(s.defaultVolume)) c.fail('defaultVolume', 'muss in volumeSteps stehen');
  if (!c.object('sounds')) return;
  for (const [key, snd] of Object.entries(s.sounds)) {
    const p = `sounds.${key}`;
    if (!WAVES.includes(snd?.wave)) c.fail(`${p}.wave`, `muss ${WAVES.join(', ')} sein`);
    if (!Array.isArray(snd?.notes) || snd.notes.length === 0 || !snd.notes.every((hz) => typeof hz === 'number' && hz >= 20 && hz <= 5000)) c.fail(`${p}.notes`, 'Liste von Tonhöhen 20 bis 5000 Hz');
    c.number(`${p}.noteMs`, { min: 10, max: 2000 });
    c.number(`${p}.gain`, { min: 0, max: 1 });
  }
  for (const group of ['events', 'ui']) {
    if (!c.object(group)) continue;
    for (const [k, v] of Object.entries(s[group])) if (!s.sounds[v]) c.fail(`${group}.${k}`, `unbekannter Klang: ${v}`);
  }
  if (c.object('music')) {
    if (!WAVES.includes(s.music.wave)) c.fail('music.wave', `muss ${WAVES.join(', ')} sein`);
    if (!Array.isArray(s.music.notes) || s.music.notes.length === 0) c.fail('music.notes', 'fehlt');
    c.number('music.gain', { min: 0, max: 0.2 });
    c.number('music.lfoHz', { min: 0, max: 5 });
    c.number('music.lfoDepth', { min: 0, max: 0.2 });
  }
  // Musikstücke je Ort (D35): Datei, Länge der Schleife, Lautstärke
  if (s.tracks !== undefined && c.object('tracks')) {
    for (const [id, tr] of Object.entries(s.tracks)) {
      if (typeof tr?.file !== 'string' || !tr.file.startsWith('assets/audio/')) c.fail(`tracks.${id}.file`, 'Pfad unter assets/audio/');
      c.number(`tracks.${id}.loopSeconds`, { min: 5, max: 600 });
      c.number(`tracks.${id}.gain`, { min: 0, max: 1 });
    }
  }
  // Hintergrundklang je Station und Gebiet (Meeresrauschen, Brummen, Blasen)
  if (s.ambience !== undefined && c.object('ambience')) {
    if (!s.ambience.base) c.fail('ambience.base', 'fehlt (Station)');
    for (const [id, a] of Object.entries(s.ambience)) {
      const p = `ambience.${id}`;
      c.number(`${p}.noiseGain`, { min: 0, max: 0.2 });
      c.number(`${p}.cutoffHz`, { min: 50, max: 5000 });
      c.number(`${p}.swingHz`, { min: 0, max: 2000 });
      c.number(`${p}.swellHz`, { min: 0, max: 2 });
      if (!Array.isArray(a?.drone) || a.drone.length === 0 || !a.drone.every((hz) => typeof hz === 'number' && hz >= 20 && hz <= 500)) c.fail(`${p}.drone`, 'Liste von Tonhöhen 20 bis 500 Hz');
      const b = a?.bubbles;
      const range = (v, min, max) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && x >= min && x <= max) && v[0] <= v[1];
      if (!b || typeof b !== 'object') { c.fail(`${p}.bubbles`, 'fehlt'); continue; }
      if (!range(b.everyMs, 200, 60000)) c.fail(`${p}.bubbles.everyMs`, '[von, bis] in ms, 200 bis 60000');
      if (!range(b.count, 1, 6)) c.fail(`${p}.bubbles.count`, '[von, bis], 1 bis 6');
      c.number(`${p}.bubbles.gain`, { min: 0, max: 0.3 });
      c.number(`${p}.bubbles.fromHz`, { min: 20, max: 5000 });
      c.number(`${p}.bubbles.toHz`, { min: 20, max: 5000 });
      c.number(`${p}.bubbles.ms`, { min: 20, max: 2000 });
    }
  }
}

const VALIDATORS = {
  game: validateGame, texts: validateTexts, class3: validateCurriculum, class4: validateCurriculum,
  cards: validateCards, decks: validateDecks, enemies: validateEnemies,
  bosses: validateBosses, areas: validateAreas,
  levels: validateLevels, rewards: validateRewards, depths: validateDepths, elites: validateElites, events: validateEvents, riddles: validateRiddles, station: validateStation, talents: validateTalents, heroes: validateHeroes, items: validateItems,
  sounds: validateSounds,
};

export function validateConfig(config) {
  const errors = [];
  for (const [key, file] of Object.entries(CONFIG_FILES)) {
    const data = config?.[key];
    if (data === null || typeof data !== 'object') { errors.push(`${file}: (Datei): fehlt oder ist kein JSON-Objekt`); continue; }
    VALIDATORS[key]?.(file, data, errors, config);
  }
  return errors;
}
