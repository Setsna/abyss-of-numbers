// Spiel: hält den Spielstand und den aktuellen Bildschirm, steuert den Tauchgang
// (Seekarte, Räume, Ruheplatz, Boss), reicht Kampfbefehle an die Kampf-Engine weiter
// und verteilt nach einem Sieg Erfahrung, Perlen und Kartenbeute.
//
// Bildschirme: 'title' | 'grade' | 'heroCreate' | 'base' | 'logbook' | 'map' | 'combat' | 'reward' | 'shop' | 'areaCleared'
// (dazu 'defeat' und null nur beim Testkampf über startCombat ohne Tauchgang).
// Ohne Spielstand (save null) entsteht der Stand erst bei createHero.
import { createRng, deriveSeed } from './rng.js?v=73a74faa';
import { curriculumOf, planWithoutLearning } from './math/ladders/index.js?v=73a74faa';
import { wayForKey } from './math/ways.js?v=73a74faa';
import { stageFor, recordAnswer, isIntroduced, markIntroduced, noteHighest, atTopEverywhere, mixCounts, saveMixCounts } from './learning/learning.js?v=73a74faa';
import { nextCurrent, answerCode } from './combat/current.js?v=73a74faa';
import { createCombat, combatDispatch, combatView } from './combat/combat.js?v=73a74faa';
import { generateMap, addExtraRest } from './dungeon/map.js?v=73a74faa';
import { createSave } from './save/save.js?v=73a74faa';
import { maxHp, heroStats, heroName, freePoints, spendPoint as spendHeroPoint, resetPoints as resetHeroPoints, STATS, SLOTS, TALENT_LEVELS } from './hero/hero.js?v=73a74faa';
import { unlockedCards, grantXp, rollRewardCards, addCardToDeck, deckList, addPractice, countCorrect, cardLevels, cardLevel, toNextLevel } from './progression/progression.js?v=73a74faa';
import { createShopOffer, removalBlockedReason } from './shop/shop.js?v=73a74faa';
import { depthPower, rewardFactor, starCount, openDepths, areasToOpen } from './progression/depth.js?v=73a74faa';
import { rollEvent, optionCost } from './dungeon/events.js?v=73a74faa';
import { createRiddle } from './dungeon/riddle.js?v=73a74faa';
import { noteDive, noteDay, noteRun, noteAnswer, noteRescue, dayKey } from './progression/statistics.js?v=73a74faa';
import { ensureMission, noteMission, missionPracticeEvery } from './progression/mission.js?v=73a74faa';

const reject = (reason) => [{ type: 'rejected', reason }];
const clone = (o) => JSON.parse(JSON.stringify(o));

export function createGame({ config, save, seed }) {
  const DEFAULT_SETTINGS = { mehrZeit: 'off', ton: true, musik: true, wenigBewegung: false, lautstaerke: config.sounds.defaultVolume };
  const state = {
    save: save ? clone(save) : null,
    screen: 'title',   // Neuladen landet immer hier; „Weiter“ führt zur Station (auch bei laufendem Tauchgang)
    grade: null,       // gewählte Klassenstufe vor createHero
    logbookPage: null,
    pendingSettings: {}, // Einstellungen vom Startbildschirm, solange es noch keinen Stand gibt
    combat: null,
    combatInfo: null,  // { areaId, roomId, boss, enemyTypeIds, openTask, mistakes[], lightningHits }
    reward: null,      // { cards, xp, pearls, levelUps, practice[], lightningHits }
    afterReward: null, // Bildschirm nach der Beute
    cleared: null,     // { areaId, unlocked } nach dem Boss
    shop: null,        // { roomId, offer } im Laden (Angebot aus dem Seed des Raums)
    event: null,       // { roomId, eventId } im Ereignisraum (Phase 9)
    hp: save ? maxHp(save, config) : config.game.hero.maxHp, // nur Testkampf ohne Tauchgang
    combatCount: 0,
    loot: createRng(deriveSeed(seed, 'loot')),
    runs: createRng(deriveSeed(seed, 'runs')),
    map: null,         // { seed, data } zwischengespeicherte Seekarte
    now: save?.geaendert ?? 0,
    tzOffset: 0, // Versatz der Zeitzone des Geräts in Minuten (wie getTimezoneOffset), für den Spieltag
    clockSet: false, // Uhr von der Plattform gestellt (setNow); erst dann gibt es einen Tagesauftrag (Phase 10, Etappe 5)
  };

  // Seesterne (Phase 9): Reichen die Sterne für ein Gebiet, das noch zu ist (z. B. Preis später gesenkt), öffnet es sich beim Laden
  if (state.save?.gebiete) for (const id of areasToOpen(state.save, config)) state.save.gebiete[id] = { geschafft: false, tiefe: 0, ...state.save.gebiete[id], offen: true };

  // Gegner, die nur einen anderen schützen (Krakenarme), und Zuordnung Gegner → Gebiet für das Meeresbuch (Phase 9)
  const SHIELD_PARTS = new Set(Object.values(config.bosses.bosses).flatMap((b) => b.shieldedBy ?? []));
  const BOOK = config.areas.order.flatMap((areaId) => {
    const area = config.areas.areas[areaId];
    // alle Vorlagen, Grundgruppen zuerst, dann die Gruppen je Tiefe (neue Gegner ab Tiefe 4); Gäste stehen bei ihrem eigenen Gebiet
    const rooms = [area.layers, ...(area.moreLayouts ?? []).map((l) => l.layers)].flatMap((ls) => ls.flatMap((l) => l.rooms.flatMap((r) => [r, ...(r.fallback ? [r.fallback] : [])])));
    const own = [...new Set([...rooms.flatMap((r) => (r.pool ?? []).flat()), ...rooms.flatMap((r) => (r.deepPools ?? []).flatMap((x) => x.groups.flat()))])];
    const boss = area.layers.at(-1).rooms[0].encounter;
    const bosses = (config.bosses.encounters[boss] ?? []).filter((id) => !SHIELD_PARTS.has(id));
    return [...own.map((typeId) => ({ typeId, areaId, boss: false })), ...bosses.map((typeId) => ({ typeId, areaId, boss: true }))];
  }).filter((x, i, all) => all.findIndex((y) => y.typeId === x.typeId) === i);

  const lauf = () => state.save?.lauf ?? null;

  function currentMap() {
    const l = lauf();
    if (!l) return null;
    if (state.map?.seed !== l.seed || state.map?.areaId !== l.gebiet) {
      const map = generateMap(config.areas.areas[l.gebiet], l.seed, config, l.tiefe ?? 1);
      state.map = { seed: l.seed, areaId: l.gebiet, data: l.vorrat ? addExtraRest(map) : map }; // Vorratskammer (Etappe 8)
    }
    return state.map.data;
  }

  function reachable() {
    const map = currentMap();
    const l = lauf();
    const byId = Object.fromEntries(map.rooms.map((r) => [r.id, r]));
    const ids = l.position === null ? map.start : byId[l.position].next;
    return ids.filter((id) => !l.erledigt.includes(id));
  }

  function beginCombat({ enemyTypeIds, level, areaId, hp, combatSeed, roomId = null, boss = false, untimedTasks = 0, enemyPower = 1, depth = 1, elite = null, rescue = null }) {
    const s = state.save;
    // Werkstatt (Etappe 8): Schutz nur im ersten Kampf des Tauchgangs. Der Merker fällt erst nach dem Kampf weg,
    // damit ein Neuladen mitten im Kampf den Schutz nicht kostet (Review Etappe 5–8).
    let workshopBlock = 0;
    if (roomId !== null && lauf()?.werkstatt) workshopBlock = stationEffect('diveStartBlock');
    state.workshopUsed = workshopBlock > 0;
    const taskPlan = planFor({ areaId, level, boss, inDive: roomId !== null });
    const tutorial = untimedTasks > 0 && roomId !== null;
    // Rettungsaufgabe (Phase 10, Regelwerk 14.1): im Tauchgang, nicht in der Erklärung, einmal je Tauchgang.
    // rescue: nur der Entwicklerzugang setzt sie im Testkampf ausdrücklich (?dev=combat&rettung=1).
    const canRescue = rescue ?? (roomId !== null && !tutorial && config.game.rescue.enabled && !lauf()?.rettung);
    state.combat = createCombat({
      config,
      enemyTypeIds,
      // Stärke der Figur, Ausrüstung (Etappe 7) und Talente (Phase 9); zweite Luft nur einmal je Tauchgang
      hero: { ...heroStats(s, config), startBlock: heroStats(s, config).startBlock + workshopBlock, hp: Math.min(hp, maxHp(s, config)), secondWind: roomId !== null && !lauf()?.zweiteLuft ? heroStats(s, config).secondWind : 0 },
      deck: deckList(s),
      moreTime: s.einstellung.mehrZeit,
      areaId,
      level,
      seed: combatSeed,
      untimedTasks,
      grade: s.klasse,
      forgiving: tutorial, // D24: Fehler in der Erklärung kosten nichts
      cardLevels: cardLevels(s, config), // Kartenstufen (Etappe 8); Aufstieg gilt ab dem nächsten Kampf
      enemyPower, // Strömung (D33)
      depthPower: depthPower(depth, config.depths), // Tiefe des Tauchgangs (Phase 9)
      deep: depth >= config.depths.bossDeepPhaseFrom,
      elite, // Elitegegner (Phase 9, Etappe 2)
      taskPlan,
      rescue: Boolean(canRescue),
    });
    // stageChanged: Leitern, deren Stufe in diesem Kampf gewechselt hat (zählen bis zum Kampfende nicht mehr)
    state.combatInfo = { areaId, roomId, boss, depth, elite: Boolean(elite), enemyTypeIds, openTask: null, mistakes: [], lightningHits: 0, tutorial, cardLevelUps: [], stageUps: [], stageChanged: [] };
    state.reward = null;
    state.screen = 'combat';
    return state.combat.startEvents;
  }

  // Aufgabenplan (Phase 6b, Regelwerk 7): im Tauchgang aus den Lernstufen des Kindes; der allererste
  // Kampf in einem Gebiet nutzt die untersten Stufen und zählt nicht (7.1 Nr. 6). Ohne Lernstufen
  // (Ausschalter, Testkampf) nach dem Raum: erster unten, sonst Mitte, Boss oben (7.6).
  // Tempel (noIntro, Regelwerk 13.2): kein Einführungskampf; ohne Lernstufen auch der erste Kampf auf der Mitte.
  function planFor({ areaId, level, boss, inDive }) {
    const s = state.save;
    const cfg = config.game.learning;
    const cur = curriculumOf(config, s.klasse);
    const noIntro = Boolean(config.areas.areas[areaId]?.noIntro);
    const kind = boss ? 'boss' : level === 1 && !noIntro ? 'intro' : 'normal';
    // Messung (Nachtrag Etappe 7): Rand für stageRank aus einem anderen Gebiet (Tempel: Graben)
    const rankFrom = config.areas.areas[areaId]?.rankFrom;
    const rankBase = rankFrom ? Object.fromEntries(Object.entries(cur.windows[rankFrom] ?? {}).map(([l, w]) => [l, w[0]])) : undefined;
    const extra = rankBase ? { rankBase } : {};
    if (!inDive || !cfg.enabled) return { ...planWithoutLearning(cur, areaId, kind, s.klasse), countable: false, ...extra };
    if (!noIntro && !isIntroduced(s.lernen, s.klasse, areaId)) {
      markIntroduced(s.lernen, s.klasse, areaId);
      return { ...planWithoutLearning(cur, areaId, 'intro', s.klasse), countable: false, ...extra };
    }
    const windows = { ...cur.windows[areaId] };
    const stageOf = Object.fromEntries(Object.entries(windows).map(([ladder, win]) => [ladder, stageFor(s.lernen, s.klasse, areaId, ladder, win)]));
    // Übungsaufgaben mit Stufe, älteste zuerst (Regelwerk 7.2)
    const practice = Object.entries(s.uebung).filter(([, e]) => e.stufe).sort((x, y) => x[1].t - y[1].t).map(([key, e]) => ({ key, stufe: e.stufe }));
    // Zähler der Mischregel aus dem Spielstand: er läuft über Kämpfe und Tauchgänge weiter (Review 7b, B1)
    // practiceEvery: zusätzliche Stelle für Fehleraufgaben, solange der Tagesauftrag „Übungsliste“ läuft (Regelwerk 14.3)
    return { grade: s.klasse, stageOf, windows, countable: true, mixEvery: cfg.mixEvery, practiceEvery: missionPracticeEvery(s, config), practice, mixCount: mixCounts(s.lernen, s.klasse, areaId), ...extra };
  }

  // Gezählte Antwort verbuchen (Regelwerk 7.1); neue höchste Stufe bringt Perlen (7.7).
  // Ohne ctx aus dem laufenden Kampf; der Rätselraum reicht Gebiet, Fenster und eigene Liste herein.
  function countAnswer(ladder, correct, ctx = null) {
    const s = state.save;
    const info = ctx?.info ?? state.combatInfo;
    const cfg = config.game.learning;
    const win = ctx?.win ?? state.combat.taskPlan.windows[ladder];
    const areaId = ctx?.areaId ?? info.areaId;
    const from = stageFor(s.lernen, s.klasse, areaId, ladder, win);
    const { stufe, change } = recordAnswer(s.lernen, s.klasse, areaId, ladder, correct, win, cfg);
    if (!change) return [];
    info.stageChanged.push(ladder);
    const events = [{ type: 'stageChanged', ladder, from, to: stufe }];
    if (change === 'up' && noteHighest(s.lernen, s.klasse, ladder, stufe)) {
      s.perlen += cfg.newStagePearls;
      info.stageUps.push({ ladder, pearls: cfg.newStagePearls });
      events.push({ type: 'stageReached', ladder, stufe, pearls: cfg.newStagePearls });
    }
    return events;
  }

  // Übungsaufgabe richtig gelöst: nach practiceDoneAfter Mal verlässt sie die Liste (Regelwerk 7.2)
  function practiceSolved(key) {
    const e = state.save.uebung[key];
    if (!e) return;
    e.richtig = (e.richtig ?? 0) + 1;
    if (e.richtig >= config.game.learning.practiceDoneAfter) delete state.save.uebung[key];
  }

  // Testkampf ohne Tauchgang (Entwicklerzugang ?dev=combat und ältere Tests).
  function startCombat(enemyTypeIds, level, options = {}) {
    state.combatCount += 1;
    state.afterReward = null;
    return beginCombat({
      enemyTypeIds, level, areaId: options.areaId ?? 'reef', hp: options.hp ?? state.hp, // hp: Entwicklerzugang (Phase 10)
      combatSeed: deriveSeed(seed, `combat${state.combatCount}`), untimedTasks: options.untimedTasks ?? 0,
      enemyPower: options.enemyPower ?? 1,
      elite: options.elite ?? null, // Testkampf mit Elitegegner (Phase 9)
      rescue: Boolean(options.rescue), // Entwicklerzugang: Rettung im Testkampf (Phase 10)
    });
  }

  // abandon: das Kind hat bestätigt, dass der laufende Tauchgang in einem anderen Gebiet endet (Ingos Probespiel
  // 18.11.2026). Nur der Weg über die Seekarte geht verloren; Karten, Perlen, Erfahrung und Ausrüstung bleiben.
  // depth (Phase 9): Tiefe 1 bis openDepths; ohne Angabe die höchste offene. Ein laufender Tauchgang
  // im selben Gebiet geht in seiner Tiefe weiter.
  function dive({ areaId, depth, abandon = false }) {
    if (state.screen !== 'base') return reject('screen');
    const area = config.areas.areas[areaId];
    if (!area) return reject('unknownArea');
    if (!state.save.gebiete[areaId]?.offen) return reject('locked');
    if (area.comingSoon) return reject('comingSoon');
    const maxDepth = openDepths(state.save, areaId);
    if (depth !== undefined && !(Number.isInteger(depth) && depth >= 1 && depth <= maxDepth)) return reject('depth');
    let l = lauf();
    if (l && l.gebiet === areaId && depth !== undefined && depth !== l.tiefe && !abandon) return reject('otherDepth');
    const events = [];
    // anderes Gebiet, oder dasselbe in anderer Tiefe (Abschlussreview Phase 9): der laufende Tauchgang endet
    if (l && (l.gebiet !== areaId || (depth !== undefined && depth !== l.tiefe))) {
      if (!abandon) return reject('otherRun');
      events.push({ type: 'runAbandoned', areaId: l.gebiet });
      state.save.lauf = null;
      l = null;
    }
    if (!l) {
      state.save.lauf = {
        gebiet: areaId,
        seed: state.runs.nextUint32(),
        erledigt: [],
        position: null,
        leben: maxHp(state.save, config),
        versuche: {},
        laden: {},
        tiefe: depth ?? maxDepth, // Tiefe des Tauchgangs (Phase 9)
      };
      // Station (Etappe 8): Vorteile gelten für Tauchgänge, die nach dem Kauf beginnen
      if (stationEffect('extraRest')) state.save.lauf.vorrat = true;
      if (stationEffect('diveStartBlock')) state.save.lauf.werkstatt = true;
    }
    noteDive(state.save, areaId, state.now, state.tzOffset); // Lernübersicht (Phase 10): Spieltag und Gebiet
    state.screen = 'map';
    // offene Kartenauswahl aus einem Ereignis (Perlen oder Leben schon bezahlt) kommt nach dem Neuladen wieder
    if (l && l.beute) offerEventCards(l.beute, currentMap().rooms.find((r) => r.id === l.beute)?.type === 'riddle' ? { riddle: true, event: false } : {});
    // offenes Rätsel (Phase 9, Etappe 7): gleicher Stein, verbrauchte Fehlversuche bleiben verbraucht
    if (l && l.raetsel) openRiddle(l.raetsel.raum, l.raetsel);
    return [...events, { type: 'diveStarted', areaId, seed: lauf().seed, depth: lauf().tiefe, resumed: Boolean(l) }];
  }

  function enterRoom({ roomId }) {
    const l = lauf();
    if (!reachable().includes(roomId)) return reject('notReachable');
    const room = currentMap().rooms.find((r) => r.id === roomId);
    noteDay(state.save, state.now, state.tzOffset); // Spieltag auch, wenn die Seite über Nacht offen blieb (Phase 10)
    const events = [{ type: 'roomEntered', roomId, roomType: room.type }];
    if (room.type === 'rest') {
      // Ruheplatz heilt einen Anteil der Höchstleben (Balance nach Probespiel 17.11.2026)
      const full = maxHp(state.save, config);
      const share = Math.max(config.rewards.restHealShare, heroStats(state.save, config).restHealShare); // Talent Tiefe Ruhe
      const healed = Math.max(0, Math.min(Math.round(full * share), full - l.leben));
      l.leben += healed;
      events.push({ type: 'restUsed', healed }, markCleared(roomId));
      return events;
    }
    if (room.type === 'treasure') return [...events, ...openTreasure(roomId)];
    if (room.type === 'event') return [...events, ...openEvent(room)];
    if (room.type === 'riddle') return [...events, ...openRiddle(roomId)];
    if (room.type === 'shop') return [...events, ...openShop(roomId)];
    l.versuche[roomId] = (l.versuche[roomId] ?? 0) + 1;
    const area = config.areas.areas[l.gebiet];
    events.push(...beginCombat({
      enemyTypeIds: room.enemies,
      level: room.level,
      areaId: area.curriculum,
      hp: l.leben,
      combatSeed: deriveSeed(l.seed, `room:${roomId}:${l.versuche[roomId]}`),
      roomId,
      boss: room.type === 'boss',
      // Erklärung im ersten Kampf (Konzept 11): erste Aufgabe ohne Zeitleiste
      untimedTasks: room.tutorial && !state.save.erklaert.firstCombat ? 1 : 0,
      enemyPower: state.save.stroemung, // Strömung (D33/D34), nur im Tauchgang
      depth: l.tiefe,
      // Eliteraum (Phase 9): Regel aus dem Seed des Raums, gleich auch nach dem Neuladen
      elite: room.type === 'elite' ? createRng(deriveSeed(l.seed, `elite:${roomId}`)).pick(Object.keys(config.elites.rules)) : null,
    }));
    return events;
  }

  // Ausrüstung (Phase 5, Etappe 7): ein Gegenstand, den das Kind noch nicht hat, oder null
  function rollItem(rng) {
    const own = new Set(state.save.ausruestung.besitz);
    const free = Object.keys(config.items).filter((id) => !own.has(id));
    return free.length ? rng.pick(free) : null;
  }
  function giveItem(itemId) {
    state.save.ausruestung.besitz.push(itemId);
    return { type: 'itemFound', itemId };
  }

  function markCleared(roomId) {
    const l = lauf();
    l.erledigt.push(roomId);
    l.position = roomId;
    return { type: 'roomCleared', roomId };
  }

  // Schatz (Konzept 11): Perlen und eine Kartenauswahl, ohne Kampf. Zufall aus dem Seed des
  // Raums, damit ein Neuladen vor dem Öffnen nichts ändert.
  function openTreasure(roomId) {
    const s = state.save;
    const l = lauf();
    const rng = createRng(deriveSeed(l.seed, `treasure:${roomId}`));
    const [lo, hi] = config.rewards.treasurePearls;
    const pearls = rng.nextInt(lo, hi);
    s.perlen += pearls;
    const cards = rollRewardCards(s, l.gebiet, rng, config, { depth: l.tiefe });
    const item = rng.nextUint32() / 4294967296 < config.rewards.itemChance ? rollItem(rng) : null;
    state.reward = { cards, xp: 0, pearls, levelUps: 0, practice: [], lightningHits: 0, treasure: true, item, cardLevelUps: [] };
    state.afterReward = 'map';
    state.screen = 'reward';
    const events = [{ type: 'treasureOpened', pearls }, markCleared(roomId)];
    if (item) events.push(giveItem(item));
    return [...events, { type: 'rewardOffered', cards }];
  }

  // Ereignisraum (Phase 9, Konzept 8): das Ereignis entsteht aus dem Seed, gespeichert wird nur, ob der Raum erledigt ist.
  function openEvent(room) {
    const l = lauf();
    const area = config.areas.areas[l.gebiet];
    const eventId = rollEvent(room.id, l.seed, config, l.gebiet, Boolean(room.enemies?.length));
    state.event = { roomId: room.id, eventId, enemies: room.enemies ?? null, level: room.level ?? 2, curriculum: area.curriculum };
    state.screen = 'event';
    return [{ type: 'eventOpened', roomId: room.id, eventId }];
  }

  function chooseEventOption({ optionId }) {
    const s = state.save;
    const l = lauf();
    const ev = state.event;
    const option = config.events[ev.eventId].options.find((o) => o.id === optionId);
    if (!option) return reject('option');
    if (optionCost(option) > s.perlen) return reject('pearls');
    const rng = createRng(deriveSeed(l.seed, `event:${ev.roomId}:effects`));
    const events = [{ type: 'eventResolved', eventId: ev.eventId, optionId }];
    const full = maxHp(s, config);
    let next = null;
    for (const f of option.effects) {
      if (f.type === 'hp') {
        const before = l.leben;
        l.leben = Math.min(full, Math.max(1, l.leben + f.amount)); // nie unter 1
        events.push({ type: 'eventHp', amount: l.leben - before });
      } else if (f.type === 'heal') {
        const healed = Math.max(0, Math.min(Math.round(full * f.share), full - l.leben));
        l.leben += healed;
        events.push({ type: 'restUsed', healed });
      } else if (f.type === 'pearls') {
        const before = s.perlen;
        s.perlen = Math.max(0, s.perlen + f.amount); // nie unter 0
        events.push({ type: f.amount > 0 ? 'pearlsGained' : 'pearlsSpent', amount: Math.abs(s.perlen - before), event: true });
      } else if (f.type === 'item') {
        const item = rollItem(rng);
        if (item) events.push(giveItem(item));
        else { s.perlen += config.elites.rewardPearls; events.push({ type: 'pearlsGained', amount: config.elites.rewardPearls, event: true }); } // alle Gegenstände schon da
      } else next = f;
    }
    state.event = null;
    if (next?.type === 'fight' && ev.enemies) {
      l.versuche[ev.roomId] = (l.versuche[ev.roomId] ?? 0) + 1;
      events.push(...beginCombat({
        enemyTypeIds: ev.enemies, level: ev.level, areaId: ev.curriculum, hp: l.leben,
        combatSeed: deriveSeed(l.seed, `room:${ev.roomId}:${l.versuche[ev.roomId]}`),
        roomId: ev.roomId, enemyPower: s.stroemung, depth: l.tiefe,
      }));
      state.combatInfo.bonusPearls = next.bonusPearls;
      return events;
    }
    events.push(markCleared(ev.roomId));
    if (next?.type === 'card') {
      l.beute = ev.roomId; // bis die Karte gewählt ist (Abschlussreview: Neuladen darf die bezahlte Karte nicht kosten)
      events.push({ type: 'rewardOffered', cards: offerEventCards(ev.roomId) });
      return events;
    }
    state.screen = 'map';
    return events;
  }

  // Kartenauswahl eines Ereignisses oder Rätsels: aus dem Seed des Raums, deshalb nach dem Neuladen dieselbe
  function offerEventCards(roomId, extra = {}) {
    const l = lauf();
    const cards = rollRewardCards(state.save, l.gebiet, createRng(deriveSeed(l.seed, `event:${roomId}:cards`)), config, { depth: l.tiefe });
    state.reward = { cards, xp: 0, pearls: 0, levelUps: 0, practice: [], lightningHits: 0, event: true, item: null, cardLevelUps: [], ...extra };
    state.afterReward = 'map';
    state.screen = 'reward';
    return cards;
  }

  // ---------- Rätselraum (Phase 9, Etappe 7; Regelwerk 13.4) ----------
  // Im Spielstand steht nur lauf.raetsel { raum, stufe, schritt, frei, versucht, falsch?, gewechselt? };
  // die Aufgabe entsteht aus dem Seed. falsch: schon getippte falsche Antworten des aktuellen Steins,
  // gewechselt: in diesem Rätsel hat sich die Stufe schon geändert (beides übersteht das Neuladen, Review Etappe 5–8).
  function openRiddle(roomId, saved = null) {
    const l = lauf();
    const curriculumId = config.areas.areas[l.gebiet].curriculum;
    const r = createRiddle({ config, save: state.save, curriculumId, areaId: l.gebiet, runSeed: l.seed, roomId, stufe: saved?.stufe });
    l.raetsel = saved ?? { raum: roomId, stufe: r.stufe, schritt: 0, frei: config.riddles.freeMistakes, versucht: [] };
    state.riddle = {
      ...r, curriculumId, areaId: l.gebiet, wrongChoices: (saved?.falsch ?? []).slice(), mistake: null, result: null,
      info: { stageChanged: saved?.gewechselt ? [r.ladder] : [], stageUps: [] },
    };
    state.screen = 'riddle';
    return [{ type: 'riddleOpened', roomId, format: r.format }];
  }

  function answerRiddle({ choiceIndex }) {
    const r = state.riddle;
    const rec = lauf().raetsel;
    if (r.result) return reject('phase');
    const st = r.steps[rec.schritt];
    if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= st.choices.length || r.wrongChoices.includes(choiceIndex)) return reject('command');
    const correct = choiceIndex === st.correctIndex;
    const events = [{ type: 'riddleAnswered', stepIndex: rec.schritt, correct }];
    // nur der erste Versuch je Stein oder Folge zählt (Regelwerk 7.1 Nr. 7)
    const first = !rec.versucht[rec.schritt];
    rec.versucht[rec.schritt] = 1;
    if (first) noteAnswer(state.save, r.ladder, correct ? 'correct' : 'wrong'); // Lernübersicht (Phase 10)
    // nur, solange die Rätselstufe noch die Stufe des Kindes ist (nach dem Neuladen kann sie sich geändert haben);
    // stageFor erst danach fragen, denn es legt den Eintrag der Leiter an
    if (first && config.game.learning.enabled && !r.info.stageChanged.includes(r.ladder)
      && stageFor(state.save.lernen, state.save.klasse, r.areaId, r.ladder, r.win) === rec.stufe) {
      events.push(...countAnswer(r.ladder, correct, { areaId: r.areaId, win: r.win, info: r.info }));
      if (r.info.stageChanged.includes(r.ladder)) rec.gewechselt = true;
    }
    if (correct) {
      r.wrongChoices = [];
      delete rec.falsch;
      r.mistake = null;
      if (rec.schritt + 1 < r.steps.length) { rec.schritt += 1; return events; }
      return [...events, ...riddleSolved()];
    }
    if (rec.frei > 0) {
      rec.frei -= 1;
      r.wrongChoices.push(choiceIndex);
      rec.falsch = r.wrongChoices.slice();
      r.mistake = st.choiceTypes?.[choiceIndex] ?? null; // Hinweis passend zum Fehler (Regelwerk 8)
      return [...events, { type: 'riddleMistake', left: rec.frei, mistake: r.mistake }];
    }
    return [...events, ...riddleFailed(st)];
  }

  function riddleSolved() {
    const l = lauf();
    const r = state.riddle;
    const [lo, hi] = config.riddles.pearls;
    const pearls = createRng(deriveSeed(l.seed, `riddle:${r.roomId}:pearls`)).nextInt(lo, hi);
    state.save.perlen += pearls;
    delete l.raetsel;
    state.riddle = null;
    const events = [{ type: 'riddleSolved', roomId: r.roomId, pearls }, markCleared(r.roomId)];
    l.beute = r.roomId; // bis die Karte gewählt ist: Neuladen kostet nichts
    const cards = offerEventCards(r.roomId, { riddle: true, event: false, pearls });
    return [...events, { type: 'rewardOffered', cards }];
  }

  // Nicht gelöst: Lösung mit Rechenweg zeigen, Aufgabe nur auf die Übungsliste (Regelwerk 13.4), kein Schaden
  function riddleFailed(st) {
    const l = lauf();
    const r = state.riddle;
    r.result = 'failed';
    r.failedStep = l.raetsel.schritt;
    r.mistake = null;
    addPractice(state.save, [{ key: r.task.practiceKey, text: st.solutionText }], state.now, config);
    delete l.raetsel;
    return [{ type: 'riddleFailed', roomId: r.roomId, solutionText: st.solutionText }, markCleared(r.roomId)];
  }

  function leaveRiddle() {
    if (!state.riddle?.result) return reject('phase');
    state.riddle = null;
    state.screen = 'map';
    return [{ type: 'riddleLeft' }];
  }

  function riddleView() {
    const r = state.riddle;
    if (!r) return null;
    const failed = r.result === 'failed';
    const i = failed ? r.failedStep : lauf().raetsel.schritt;
    const st = r.steps[i];
    return {
      roomId: r.roomId, format: r.format, ladder: r.ladder, stageId: r.task.stageId, practiceKey: r.task.practiceKey,
      timeLimitMs: 0, freeMistakes: config.riddles.freeMistakes, freeLeft: failed ? 0 : lauf().raetsel.frei, stepIndex: i, steps: r.steps.length,
      wall: r.task.wall ? clone(r.task.wall) : null, shown: r.task.shown?.slice() ?? null,
      step: { prompt: st.prompt, display: st.display ?? null, cell: st.cell ?? null, choices: st.choices.slice(), correctIndex: st.correctIndex },
      wrongChoices: r.wrongChoices.slice(), mistake: r.mistake, result: r.result,
      solutionText: failed ? st.solutionText : null, way: failed ? (st.way ?? null) : null,
    };
  }

  function eventView() {
    const ev = state.event;
    if (!ev) return null;
    return {
      eventId: ev.eventId, roomId: ev.roomId,
      options: config.events[ev.eventId].options.map((o) => ({ id: o.id, cost: optionCost(o), available: optionCost(o) <= state.save.perlen })),
    };
  }

  // Händler: bleibt offen, bis das Kind „Weiter tauchen“ tippt (leaveShop). Erst dann ist der
  // Raum erledigt; nach einem Neuladen kommt dasselbe Angebot wieder.
  function openShop(roomId) {
    const l = lauf();
    const rng = createRng(deriveSeed(l.seed, `shop:${roomId}`));
    const offer = createShopOffer(state.save, l.gebiet, rng, config, { depth: l.tiefe });
    // ein Gegenstand, den das Kind beim ersten Betreten noch nicht hatte (Etappe 7)
    l.laden[roomId] ??= { gekauft: [], abgegeben: false, gegenstand: rollItem(rng), gegenstandGekauft: false };
    state.shop = { roomId, offer };
    state.screen = 'shop';
    return [{ type: 'shopOpened', roomId }];
  }

  const shopRecord = () => lauf().laden[state.shop.roomId];

  function buyCard({ cardId }) {
    const item = state.shop.offer.cards.find((c) => c.cardId === cardId);
    if (!item) return reject('notOffered');
    if (shopRecord().gekauft.includes(cardId)) return reject('soldOut');
    if (state.save.perlen < item.price) return reject('pearls');
    state.save.perlen -= item.price;
    addCardToDeck(state.save, cardId);
    shopRecord().gekauft.push(cardId);
    return [{ type: 'cardBought', cardId, price: item.price }];
  }

  function buyItem() {
    const rec = shopRecord();
    if (!rec.gegenstand) return reject('notOffered');
    if (rec.gegenstandGekauft) return reject('soldOut');
    const price = config.items[rec.gegenstand].price;
    if (state.save.perlen < price) return reject('pearls');
    state.save.perlen -= price;
    rec.gegenstandGekauft = true;
    if (!state.save.ausruestung.besitz.includes(rec.gegenstand)) state.save.ausruestung.besitz.push(rec.gegenstand);
    return [{ type: 'itemBought', itemId: rec.gegenstand, price }];
  }

  // Station ausbauen (Phase 9, Etappe 8): Summe eines Vorteils über die gekauften Stücke
  function stationEffect(key) {
    return (state.save?.station ?? []).reduce((sum, id) => sum + (config.station[id]?.effect?.[key] ?? 0), 0);
  }

  function buyUpgrade({ upgradeId }) {
    const s = state.save;
    const item = config.station[upgradeId];
    if (!item) return reject('unknownUpgrade');
    if (s.station.includes(upgradeId)) return reject('owned');
    if (s.perlen < item.price) return reject('pearls');
    s.perlen -= item.price;
    s.station.push(upgradeId);
    // Letztes Stück (Ingo 20.11.2026): „Station fertig!“ mit eigenem Klang (sounds.json upgradeBought:complete)
    const complete = Object.keys(config.station).every((id) => s.station.includes(id));
    return [{ type: 'upgradeBought', upgradeId, price: item.price, ...(complete ? { outcome: 'complete' } : {}) }];
  }

  function stationView() {
    const s = state.save;
    return {
      items: Object.entries(config.station).map(([id, it]) => ({
        id, price: it.price, owned: s.station.includes(id), affordable: !s.station.includes(id) && s.perlen >= it.price, effect: it.effect ?? null,
      })),
    };
  }

  function removeCard({ cardId }) {
    const s = state.save;
    if (shopRecord().abgegeben) return reject('removedAlready');
    if (typeof cardId !== 'string' || !(s.deck[cardId] > 0)) return reject('card');
    const price = state.shop.offer.removePrice;
    if (s.perlen < price) return reject('pearls');
    const why = removalBlockedReason(s, cardId, config);
    if (why) return reject(why);
    s.perlen -= price;
    s.deck[cardId] -= 1;
    if (s.deck[cardId] === 0) delete s.deck[cardId];
    shopRecord().abgegeben = true;
    return [{ type: 'cardRemoved', cardId, price }];
  }

  function leaveShop() {
    const roomId = state.shop.roomId;
    state.shop = null;
    state.screen = 'map';
    return [{ type: 'shopLeft' }, markCleared(roomId)];
  }

  function shopView() {
    const rec = lauf().laden[state.shop.roomId];
    return {
      roomId: state.shop.roomId,
      cards: state.shop.offer.cards.map((c) => ({ ...c, soldOut: rec.gekauft.includes(c.cardId) })),
      removePrice: state.shop.offer.removePrice,
      removed: rec.abgegeben,
      item: rec.gegenstand ? { itemId: rec.gegenstand, price: config.items[rec.gegenstand].price, soldOut: rec.gegenstandGekauft } : null,
    };
  }

  // Strömung nach einem gewonnenen Kampf im Tauchgang anpassen (D33).
  function adjustCurrent() {
    const s = state.save;
    if (!lauf() || state.combatInfo.roomId === null) return []; // nur im Tauchgang, nicht im Testkampf
    const from = s.stroemung;
    const info = state.combatInfo;
    const allowUp = !config.game.learning.enabled
      || atTopEverywhere(s.lernen, s.klasse, info.areaId, curriculumOf(config, s.klasse).windows[info.areaId]);
    const to = nextCurrent(from, s.antworten, config.game.current, { allowUp });
    s.stroemung = to;
    if (to !== from) state.combatInfo.currentChange = { from, to };
    return to === from ? [] : [{ type: 'currentChanged', from, to }];
  }

  function onCombatWon() {
    const s = state.save;
    const info = state.combatInfo;
    const r = config.rewards;
    let xp = 0;
    let pearls = 0;
    // Tiefe (Phase 9): Erfahrung und Perlen wachsen je Tiefe; der Boss einer schon geschafften Tiefe gibt weniger Perlen
    const factor = rewardFactor(info.depth ?? 1, config.depths);
    if (info.boss) {
      xp = Math.round(r.xpBoss * factor);
      const again = Boolean(lauf() && (s.gebiete[lauf().gebiet]?.tiefe ?? 0) >= lauf().tiefe);
      pearls = Math.round(r.pearlsBoss * factor * (again ? config.depths.repeatBossPearlsFactor : 1));
    } else {
      for (let i = 0; i < info.enemyTypeIds.length; i++) {
        xp += r.xpPerEnemy;
        pearls += state.loot.nextInt(r.pearlsPerEnemy[0], r.pearlsPerEnemy[1]) + heroStats(s, config).extraPearls;
      }
      xp = Math.round(xp * factor);
      pearls = Math.round(pearls * factor);
    }
    // Meeresbuch (Phase 9): jeden besiegten Gegner zählen; Schildträger (Krakenarme) zählen nicht einzeln
    for (const e of state.combat.enemies) {
      if (SHIELD_PARTS.has(e.typeId)) continue;
      const key = e.elite ? `${e.typeId}.elite` : e.typeId;
      s.besiegt[key] = (s.besiegt[key] ?? 0) + 1;
    }
    const { levelUps } = grantXp(s, xp, config);
    s.perlen += pearls;
    addPractice(s, info.mistakes, state.now, config);
    const rewardArea = lauf()?.gebiet ?? info.areaId;
    const cards = rollRewardCards(s, rewardArea, state.loot, config, { depth: info.depth ?? 1, elite: Boolean(info.elite) });
    const shown = info.mistakes.slice(-config.game.practiceShownAfterCombat);
    const practice = shown.map((m) => m.text);
    const practiceWays = shown.map((m) => wayForKey(m.key)); // Rechenweg je Übungsaufgabe (Regelwerk 8.3)
    // Boss: sicher ein Gegenstand (Phase 5, Etappe 7); Elitegegner auch, sonst Perlen (Phase 9, Konzept 8)
    const item = info.boss || info.elite ? rollItem(state.loot) : null;
    const elitePearls = info.elite && !item ? config.elites.rewardPearls : 0;
    const eventPearls = info.bonusPearls ?? 0; // Kampf aus einem Ereignis (Phase 9)
    s.perlen += elitePearls + eventPearls;
    state.reward = { cards, xp, pearls: pearls + elitePearls + eventPearls, levelUps, practice, lightningHits: info.lightningHits, item, cardLevelUps: info.cardLevelUps.slice(), current: info.currentChange ?? null, stageUps: info.stageUps.slice(), practiceWays };
    state.screen = 'reward';
    const events = [{ type: 'xpGained', amount: xp }];
    if (levelUps > 0) events.push({ type: 'levelUp', levels: levelUps, stufe: s.stufe });
    events.push({ type: 'pearlsGained', amount: pearls });
    if (elitePearls) events.push({ type: 'pearlsGained', amount: elitePearls, elite: true });
    if (eventPearls) events.push({ type: 'pearlsGained', amount: eventPearls, event: true });
    if (item) events.push(giveItem(item));
    events.push({ type: 'rewardOffered', cards });

    const l = lauf();
    if (!l || info.roomId === null) {
      state.hp = state.combat.hero.hp;
      state.afterReward = null;
      return events;
    }
    // Talent Proviant; nie unter 1 (ein Stand mit 0 Leben wäre ungültig und ließe sich nicht mehr laden)
    l.leben = Math.max(1, Math.min(maxHp(s, config), state.combat.hero.hp + heroStats(s, config).healAfterWin));
    events.push(markCleared(info.roomId));
    state.afterReward = 'map';
    if (info.boss) {
      // Seesterne (Phase 9, Konzept 9): der erste Sieg einer Tiefe gibt einen Stern und öffnet die nächste Tiefe;
      // Gebiete öffnen sich über ihren Preis. Der Boss öffnet nicht mehr das nächste Gebiet.
      const areaId = l.gebiet;
      const depth = l.tiefe;
      const g = s.gebiete[areaId] ?? { offen: true, geschafft: false, tiefe: 0 };
      const star = depth > g.tiefe;
      s.gebiete[areaId] = { ...g, geschafft: true, tiefe: Math.max(g.tiefe, depth) };
      const stars = starCount(s);
      if (star) events.push({ type: 'starGained', areaId, depth, stars });
      const unlocked = areasToOpen(s, config);
      for (const id of unlocked) {
        s.gebiete[id] = { geschafft: false, tiefe: 0, ...(s.gebiete[id] ?? {}), offen: true };
        events.push({ type: 'areaUnlocked', areaId: id });
      }
      noteRun(s, areaId, depth, true); // Lernübersicht (Phase 10)
      s.lauf = null;
      state.cleared = { areaId, depth, star, stars, unlocked };
      state.afterReward = 'areaCleared';
      events.push({ type: 'areaCleared', areaId, depth, star, unlocked });
    }
    return events;
  }

  function combatCommand(command) {
    const events = combatDispatch(state.combat, command);
    const info = state.combatInfo;
    const extra = [];
    for (const e of events) {
      if (e.type === 'secondWind' && lauf()) lauf().zweiteLuft = true; // Talent Zweite Luft: einmal je Tauchgang
      // Rettungsaufgabe (Phase 10, Regelwerk 14.2): Merker sofort, damit ein Neuladen sie verbraucht; falsche Rechnungen
      // auf die Übungsliste (mit Stufe); gezählt wird nur, ob sie geschafft wurde. Sonst zählen ihre Antworten nirgends.
      if (e.type === 'rescueStarted' && lauf()) lauf().rettung = true;
      if (e.type === 'rescueJudged' && e.outcome !== 'correct') info.mistakes.push({ key: e.practiceKey, text: e.solutionText, stufe: e.stageId ?? undefined });
      if (e.type === 'rescueEnded' && lauf() && info.roomId !== null) noteRescue(state.save, e.saved);
      if (e.type === 'taskOpened' || e.type === 'stepOpened') info.openTask = e.task;
      // Mischregel (Regelwerk 7.2; Review 7b, B1): der Zähler je Leiter steht im Spielstand
      if (e.type === 'taskOpened' && lauf() && info.roomId !== null && state.combat.taskPlan.mixEvery) {
        saveMixCounts(state.save.lernen, state.save.klasse, info.areaId, state.combat.mixCount, state.combat.taskPlan.mixEvery);
      }
      // Lernstufen (Phase 6b): gezählte Antworten im Tauchgang, nicht in der Erklärung
      const counting = lauf() && info.roomId !== null && !info.tutorial;
      // Nach einem Stufenwechsel kommen bis zum Kampfende noch Aufgaben der alten Stufe; sie zählen nicht
      // für die neue (Regelwerk 7.1 Nr. 7; Review 7b, B4)
      if ((e.type === 'answerJudged' || e.type === 'stepJudged') && e.counts && counting && !info.stageChanged.includes(e.ladder)) extra.push(...countAnswer(e.ladder, e.outcome === 'correct'));
      if (e.type === 'answerJudged' && e.practice && e.outcome === 'correct' && counting) practiceSolved(e.practiceKey);
      // Lernübersicht (Phase 10): erster Versuch je Aufgabe und je Schritt, auch wenn er für die Lernstufe nicht zählt
      if (counting && e.type === 'answerJudged' && e.single && e.tally) noteAnswer(state.save, e.tally, e.outcome);
      if (counting && e.type === 'stepJudged' && e.first && e.ladder) noteAnswer(state.save, e.ladder, e.outcome);
      // Tagesauftrag (Phase 10, Etappe 5; Regelwerk 14.4): dieselben Stellen wie die Zählung, dazu Fehleraufgaben und Serie
      if (counting) {
        const right = e.outcome === 'correct';
        const today = state.clockSet ? dayKey(state.now, state.tzOffset) : null; // Auftrag nur am eigenen Tag (I2a)
        const done = [];
        if (e.type === 'answerJudged' && e.single && e.tally) done.push(...noteMission(state.save, config, 'ladder', { ladder: e.tally, correct: right }, today));
        if (e.type === 'stepJudged' && e.first && e.ladder) done.push(...noteMission(state.save, config, 'ladder', { ladder: e.ladder, correct: right }, today));
        if (e.type === 'answerJudged' && e.practice) done.push(...noteMission(state.save, config, 'practice', { correct: right }, today));
        if (e.type === 'answerJudged') done.push(...noteMission(state.save, config, 'answer', { correct: right }, today));
        if (done.length) {
          state.combat.taskPlan.practiceEvery = 0; // ab der nächsten Aufgabe wieder Regelwerk 7.2
          extra.push(...done);
        }
      }
      if (e.type === 'answerJudged') {
        if (e.outcome === 'correct' && e.tierId === 'lightning') info.lightningHits += 1;
        // Strömung (D33): Antworten im Tauchgang merken, außer in der Erklärung
        if (lauf() && info.roomId !== null && !info.tutorial) {
          const s = state.save; // D34: im Stand des Kindes, über Tauchgänge hinweg
          s.antworten = [...s.antworten, answerCode(e)].slice(-config.game.current.recentAnswers);
        }
        if (e.outcome === 'correct' && e.cardId) {
          const level = countCorrect(state.save, e.cardId, config);
          if (level) {
            info.cardLevelUps.push({ cardId: e.cardId, level });
            extra.push({ type: 'cardLevelUp', cardId: e.cardId, level });
          }
        }
        if (e.outcome !== 'correct' && info.openTask && !info.openTask.forgiving) {
          // Rechnung lösen: mit Stufe, damit sie später als Übungsaufgabe wiederkommt (Regelwerk 7.2)
          info.mistakes.push({ key: info.openTask.practiceKey, text: e.solutionText, stufe: info.openTask.format === 'solve' ? info.openTask.stageId : undefined });
        }
      }
      if (e.type === 'combatWon') {
        if (state.workshopUsed && lauf()) delete lauf().werkstatt;
        state.workshopUsed = false;
        extra.push(...adjustCurrent(), ...onCombatWon());
      }
      if (e.type === 'combatLost') {
        addPractice(state.save, info.mistakes, state.now, config);
        state.hp = maxHp(state.save, config); // nach dem Auftauchen wieder volle Leben (Konzept 6)
        if (lauf() && info.roomId !== null) {
          // Gebiet wieder voll besetzt, alles Gesammelte bleibt (Konzept 6)
          extra.push({ type: 'runLost', areaId: lauf().gebiet });
          noteRun(state.save, lauf().gebiet, lauf().tiefe, false); // Lernübersicht (Phase 10)
          state.save.lauf = null;
          state.screen = 'base';
        } else {
          state.screen = 'defeat';
        }
      }
    }
    return [...events, ...extra];
  }

  function pickReward({ cardId }) {
    if (cardId !== null && !state.reward.cards.includes(cardId)) return reject('notOffered');
    if (cardId !== null) addCardToDeck(state.save, cardId);
    if (lauf()?.beute) delete lauf().beute;
    state.screen = state.afterReward;
    return [{ type: 'rewardTaken', cardId }];
  }

  function surface() {
    state.screen = 'base';
    state.cleared = null;
    return [{ type: 'surfaced' }];
  }

  // ---------- Start, Klassenstufe, Held, Logbuch (Etappe 7) ----------
  const LOGBOOK_PAGES = ['hero', 'talents', 'deck', 'collection', 'gear', 'rules', 'practice']; // talents, collection: Phase 9

  function start() {
    state.screen = state.save ? 'base' : 'grade';
    return [{ type: 'started', hasSave: Boolean(state.save) }];
  }

  function chooseGrade({ grade }) {
    if (grade !== 3 && grade !== 4) return reject('grade');
    state.grade = grade;
    state.screen = 'heroCreate';
    const events = [{ type: 'gradeChosen', grade }];
    return events;
  }

  function createHero({ figureId, nameA, nameB }) {
    const h = config.heroes;
    if (!h.figures[figureId]) return reject('figure');
    const okIndex = (i, list) => Number.isInteger(i) && i >= 0 && i < list.length;
    if (!okIndex(nameA, h.nameA) || !okIndex(nameB, h.nameB)) return reject('name');
    state.save = createSave(state.now, state.grade ?? 3, config, { figur: figureId, nameA, nameB });
    Object.assign(state.save.einstellung, state.pendingSettings);
    state.pendingSettings = {};
    state.hp = maxHp(state.save, config);
    state.screen = 'base';
    return [{ type: 'heroCreated', figureId, name: heroName(state.save, config) }];
  }

  function openLogbook({ page }) {
    if (!LOGBOOK_PAGES.includes(page)) return reject('page');
    state.logbookPage = page;
    state.screen = 'logbook';
    return [{ type: 'logbookOpened', page }];
  }

  function closeLogbook() {
    state.screen = 'base';
    state.logbookPage = null;
    return [{ type: 'logbookClosed' }];
  }

  // Leben im Tauchgang nie über dem Höchstmaß, wenn es durch Figur, Ausrüstung oder Punkte sinkt (18.11.2026)
  function capRunLife() {
    const l = lauf();
    if (l) l.leben = Math.min(l.leben, maxHp(state.save, config));
  }

  // Held ändern (Ingos Wunsch 18.11.2026): aus dem Logbuch, auch während eines Tauchgangs. Figur und Name wechseln,
  // alles andere bleibt. Die Leben im Tauchgang werden höchstens auf das neue Höchstmaß gekürzt, nie erhöht.
  function editHero() {
    state.screen = 'heroEdit';
    return [{ type: 'heroEditOpened' }];
  }
  function cancelHeroEdit() {
    state.screen = 'logbook';
    state.logbookPage = 'hero';
    return [{ type: 'heroEditClosed' }];
  }
  function changeHero({ figureId, nameA, nameB }) {
    const h = config.heroes;
    if (!h.figures[figureId]) return reject('figure');
    const okIndex = (i, list) => Number.isInteger(i) && i >= 0 && i < list.length;
    if (!okIndex(nameA, h.nameA) || !okIndex(nameB, h.nameB)) return reject('name');
    state.save.held = { figur: figureId, nameA, nameB };
    capRunLife();
    state.screen = 'logbook';
    state.logbookPage = 'hero';
    return [{ type: 'heroChanged', figureId, name: heroName(state.save, config) }];
  }

  function spendPoint({ stat }) {
    if (!STATS.includes(stat)) return reject('stat');
    if (!spendHeroPoint(state.save, stat, config)) return reject('noPoints');
    return [{ type: 'pointSpent', stat, free: freePoints(state.save, config) }];
  }

  // Ausrüstung anlegen und ablegen (nur in Station und Logbuch)
  function equipItem({ itemId }) {
    if (!state.save.ausruestung.besitz.includes(itemId)) return reject('item');
    const slot = config.items[itemId].slot;
    state.save.ausruestung.angelegt[slot] = itemId;
    capRunLife(); // ein anderer Gegenstand im selben Platz kann Extra-Leben ersetzen
    return [{ type: 'itemEquipped', itemId, slot }];
  }
  function unequipItem({ slot }) {
    if (!SLOTS.includes(slot)) return reject('slot');
    state.save.ausruestung.angelegt[slot] = null;
    capRunLife();
    return [{ type: 'itemUnequipped', slot }];
  }

  // Neue Karten (Phase 9, Etappe 5): Meldung „Neue Karte entdeckt!“ einmal je Karte, in der Station bestätigt
  function newCards() {
    const s = state.save;
    return unlockedCards(s, config).filter((id) => config.cards[id].unlockStars > 0 && !s.entdeckt.includes(id));
  }
  // Tagesauftrag (Phase 10, Etappe 5): Meldung „Auftrag geschafft!“ in der Station einmal bestätigen
  function ackMission() {
    const m = state.save.auftrag;
    if (!m?.geschafft) return reject('mission');
    m.gemeldet = true;
    return [{ type: 'missionSeen' }];
  }

  function ackNewCards() {
    const cards = newCards();
    state.save.entdeckt.push(...cards);
    return [{ type: 'newCardsSeen', cards }];
  }

  // Talente (Phase 9, Konzept 10): bei Stufe 5, 10, 15 und 20 eins von zwei, jederzeit umwählbar
  function chooseTalent({ level, talentId }) {
    const key = String(level);
    if (!TALENT_LEVELS.includes(key)) return reject('level');
    if (state.save.stufe < Number(key)) return reject('level');
    if (!config.talents[key].some((x) => x.id === talentId)) return reject('talent');
    state.save.talente[key] = talentId;
    return [{ type: 'talentChosen', level: Number(key), talentId }];
  }

  function resetPoints() {
    resetHeroPoints(state.save);
    capRunLife();
    return [{ type: 'pointsReset', free: freePoints(state.save, config) }];
  }

  function profileView() {
    const s = state.save;
    if (!s) return null;
    const ordered = Object.entries(s.uebung).sort((a, b) => b[1].t - a[1].t);
    const practice = ordered.map(([, e]) => e.text);
    const practiceWays = ordered.map(([key]) => wayForKey(key)); // Rechenweg je Übungsaufgabe (Regelwerk 8.3)
    return {
      name: heroName(s, config),
      figure: s.held.figur,
      asset: config.heroes.figures[s.held.figur].asset,
      held: { ...s.held }, // Figur und Namensnummern, für „Held ändern“
      poseAnchor: config.heroes.figures[s.held.figur].poseAnchor ?? null, // Kampfposen (D36, Weg 2)
      klasse: s.klasse,
      stufe: s.stufe,
      ep: s.ep,
      perlen: s.perlen,
      punkte: { ...s.punkte },
      freePoints: freePoints(s, config),
      maxHp: maxHp(s, config),
      gear: { besitz: s.ausruestung.besitz.slice(), angelegt: { ...s.ausruestung.angelegt } },
      perk: config.heroes.figures[s.held.figur].perk ? s.held.figur : null,
      // Kartenalbum und Meeresbuch (Phase 9, Etappe 4)
      album: Object.keys(config.cards).map((cardId) => ({ cardId, found: (s.gefunden ?? []).includes(cardId), level: cardLevel(s, cardId, config), toNext: toNextLevel(s, cardId, config), unlockStars: config.cards[cardId].unlockStars ?? 0, locked: !unlockedCards(s, config).includes(cardId), rare: config.cards[cardId].rarity === 'rare' })),
      newCards: newCards(),
      book: BOOK.map((b) => ({ ...b, count: s.besiegt?.[b.typeId] ?? 0, eliteCount: s.besiegt?.[`${b.typeId}.elite`] ?? 0 })).map(({ typeId, areaId, count, eliteCount, boss }) => ({ typeId, areaId, count, eliteCount, boss })),
      talents: TALENT_LEVELS.map((level) => ({ level: Number(level), options: config.talents[level].map((x) => x.id), chosen: s.talente?.[level] ?? null, available: s.stufe >= Number(level) })),
      talentOpen: TALENT_LEVELS.some((level) => s.stufe >= Number(level) && !s.talente?.[level]),
      deck: Object.entries(s.deck).filter(([, n]) => n > 0).map(([cardId, n]) => ({ cardId, n, level: cardLevel(s, cardId, config), toNext: toNextLevel(s, cardId, config) })),
      practice,
      practiceWays,
      stars: starCount(s), // Seesterne (Phase 9)
      areas: config.areas.order.map((id) => {
        const open = Boolean(s.gebiete[id]?.offen);
        return {
          id, open, cleared: Boolean(s.gebiete[id]?.geschafft),
          comingSoon: Boolean(config.areas.areas[id].comingSoon),
          price: config.areas.areas[id].price,
          depth: s.gebiete[id]?.tiefe ?? 0, // geschaffte Tiefe
          maxDepth: openDepths(s, id), // höchste wählbare Tiefe
          missing: open ? 0 : Math.max(0, config.areas.areas[id].price - starCount(s)),
        };
      }),
    };
  }

  // ---------- Einstellungen, Erklärungen, Zurücksetzen (Etappe 8) ----------
  const SETTING_CHECK = {
    mehrZeit: (v) => typeof v === 'string' && v in config.game.moreTime,
    ton: (v) => typeof v === 'boolean',
    musik: (v) => typeof v === 'boolean',
    wenigBewegung: (v) => typeof v === 'boolean',
    lautstaerke: (v) => config.sounds.volumeSteps.includes(v), // Etappe 9
  };

  function setSetting({ key, value }) {
    if (!SETTING_CHECK[key]) return reject('setting');
    if (!SETTING_CHECK[key](value)) return reject('value');
    if (state.save) state.save.einstellung[key] = value;
    else state.pendingSettings[key] = value;
    return [{ type: 'settingChanged', key, value }];
  }

  // Schlüssel: firstCombat, card.<Karten-Id> oder area.<Gebiet> (Phase 5, Etappe 5)
  function markExplained({ key }) {
    const ok = key === 'firstCombat'
      || (typeof key === 'string' && key.startsWith('card.') && config.cards[key.slice(5)])
      || (typeof key === 'string' && key.startsWith('area.') && config.areas.areas[key.slice(5)]?.intro) // Hinweis zum neuen Stoff
      || (typeof key === 'string' && key.startsWith('boss.') && config.bosses.bosses[key.slice(5)]?.rule); // Bossregel (Etappe 6)
    if (!ok) return reject('explainKey');
    if (!state.save) return reject('screen');
    state.save.erklaert[key] = true;
    return [{ type: 'explained', key }];
  }

  // Spielstand löschen: Danach beginnt alles neu mit Klasse und Held (die Oberfläche löscht den Speicher).
  function resetSave() {
    state.save = null;
    state.grade = null;
    state.pendingSettings = {};
    state.combat = null;
    state.reward = null;
    state.cleared = null;
    state.hp = config.game.hero.maxHp;
    state.screen = 'title';
    return [{ type: 'saveReset' }];
  }

  // Befehle außerhalb des Kampfs; im Kampf werden sie mit „phase“ abgelehnt.
  const MENU_COMMANDS = new Set(['ackMission', 'ackNewCards', 'chooseTalent', 'chooseEventOption', 'start', 'chooseGrade', 'createHero', 'openLogbook', 'closeLogbook', 'spendPoint', 'resetPoints', 'dive', 'enterRoom', 'surface', 'setSetting', 'resetSave', 'buyCard', 'removeCard', 'leaveShop', 'buyItem', 'equipItem', 'unequipItem', 'editHero', 'cancelHeroEdit', 'changeHero', 'buyUpgrade']);

  // Erlaubte Befehle je Bildschirm.
  const COMMANDS = {
    title: { start, setSetting, resetSave },
    grade: { chooseGrade },
    heroCreate: { createHero },
    base: { dive, openLogbook, spendPoint, resetPoints, setSetting, equipItem, unequipItem, chooseTalent, ackNewCards, ackMission, buyUpgrade },
    logbook: { openLogbook, closeLogbook, spendPoint, resetPoints, equipItem, unequipItem, editHero, chooseTalent },
    heroEdit: { changeHero, cancelHeroEdit },
    map: { enterRoom, surface },
    reward: { pickReward },
    shop: { buyCard, buyItem, removeCard, leaveShop },
    event: { chooseEventOption }, // Phase 9
    riddle: { answerRiddle, leaveRiddle }, // Tempel (Phase 9, Etappe 7)
    areaCleared: { surface },
  };

  function mapView() {
    const l = lauf();
    if (!l) return null;
    const open = reachable();
    return {
      areaId: l.gebiet,
      depth: l.tiefe, // Phase 9
      current: state.save.stroemung,
      position: l.position,
      reachable: open,
      rooms: currentMap().rooms.map((r) => ({
        id: r.id, layer: r.layer, slot: r.slot, type: r.type, next: r.next.slice(),
        enemies: r.type === 'event' ? null : r.enemies?.slice() ?? null, // Ereignis bleibt eine Überraschung
        done: l.erledigt.includes(r.id),
        reachable: open.includes(r.id),
      })),
    };
  }

  function missionCheck() {
    if (state.screen !== 'base' || !state.save || !state.clockSet) return [];
    if (!ensureMission(state.save, config, state.now, state.tzOffset)) return [];
    return [{ type: 'missionCreated', mission: { ...state.save.auftrag } }];
  }

  function route(command) {
    if (state.screen === 'combat') {
      if (command?.type === 'pickReward') return reject('screen');
      if (MENU_COMMANDS.has(command?.type)) return reject('phase');
      if (command?.type === 'markExplained') return markExplained(command);
      return combatCommand(command);
    }
    if (command?.type === 'markExplained') return markExplained(command); // auf jedem Bildschirm erlaubt
    const handler = COMMANDS[state.screen]?.[command?.type];
    if (!handler) return reject('screen');
    return handler(command);
  }

  return {
    startCombat,
    get combat() { return state.combat; },
    // tzOffsetMinutes: Zeitzone des Geräts (Phase 10, Spieltage der Lernübersicht); ohne Angabe bleibt der letzte Wert
    setNow(now, tzOffsetMinutes) { state.now = now; state.clockSet = true; if (Number.isFinite(tzOffsetMinutes)) state.tzOffset = tzOffsetMinutes; },
    dispatch(command) {
      // Tagesauftrag (Phase 10, Etappe 5): entsteht, wenn das Kind an dem Tag zum ersten Mal die Station sieht.
      // Auch vor dem Befehl prüfen: Stand die Seite über Nacht auf der Station, gilt für „Tauchen“ schon der neue Tag
      // (Abschlussreview Etappe 5, I2).
      const events = [...missionCheck(), ...route(command)];
      events.push(...missionCheck());
      return events;
    },
    view({ targetUid } = {}) {
      const s = state.save;
      const l = lauf();
      const inCombat = state.screen === 'combat';
      return {
        screen: state.screen,
        combat: state.combat && inCombat ? combatView(state.combat, { targetUid }) : null,
        reward: state.reward ? clone(state.reward) : null,
        map: state.screen === 'map' ? mapView() : null,
        shop: state.screen === 'shop' ? shopView() : null,
        event: state.screen === 'event' ? eventView() : null,
        riddle: state.screen === 'riddle' ? riddleView() : null,
        station: state.screen === 'base' && s ? stationView() : null, // Ausbau (Etappe 8)
        mission: state.screen === 'base' && s?.auftrag && config.game.mission?.enabled ? { ...s.auftrag } : null, // Tagesauftrag (Phase 10, Etappe 5)
        cleared: state.cleared ? { ...state.cleared } : null,
        run: l ? { areaId: l.gebiet, depth: l.tiefe } : null,
        logbook: state.screen === 'logbook' ? { page: state.logbookPage } : null,
        grade: state.grade,
        profile: profileView(),
        explained: { ...(state.save?.erklaert ?? {}) },
        cardLevels: s ? cardLevels(s, config) : {}, // Kartenstufen für Beute und Händler (Etappe 8)
        tutorial: inCombat && Boolean(state.combatInfo?.tutorial) && !state.save?.erklaert.firstCombat,
        settings: { ...(state.save?.einstellung ?? { ...DEFAULT_SETTINGS, ...state.pendingSettings }) },
        hero: s
          ? { hp: inCombat ? state.combat.hero.hp : (l?.leben ?? state.hp), maxHp: maxHp(s, config), stufe: s.stufe, ep: s.ep, perlen: s.perlen }
          : null,
      };
    },
    toSave(now) {
      if (!state.save) return null; // noch kein Held angelegt
      const out = clone(state.save);
      out.geaendert = now;
      return out;
    },
  };
}
