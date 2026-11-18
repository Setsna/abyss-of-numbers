// Kampf-Engine (Konzept 7, Architektur 6.2). Die Oberfläche schickt Befehle,
// die Engine ändert den Zustand und liefert Ereignisse. Kein Browser, keine Uhr.
import { createRng, deriveSeed } from '../rng.js?v=2c640ccc';
import { generateTask, generateFromStage, taskFromNumbers, taskKey } from '../math/generate.js?v=2c640ccc';
import { LADDERS, FORMAT_LADDER, curriculumOf, planWithoutLearning, stageAt, stageById } from '../math/ladders/index.js?v=2c640ccc';
import { chooseSource } from '../learning/learning.js?v=2c640ccc';
import { crossPlace } from '../math/places.js?v=2c640ccc';
import { neighborWay } from '../math/ways.js?v=2c640ccc';
import { createPiles, drawTo, drawCount, moveToDiscard, moveToExhausted } from '../cards/piles.js?v=2c640ccc';
import { intentFor, advancePattern } from '../enemies/intents.js?v=2c640ccc';
import { judgeTempo, applyMultiplier, timeLimitFor } from './tempo.js?v=2c640ccc';
import { cardEffect } from '../cards/effect.js?v=2c640ccc';

// Alle Gründe, aus denen ein Befehl abgelehnt wird (jeder hat einen Text reject.<grund>).
export const REJECT_REASONS = ['phase', 'card', 'target', 'energy', 'immune', 'shielded', 'noImmunity', 'cycleCount', 'discards', 'command'];
const reject = (reason) => [{ type: 'rejected', reason }];
const clone = (o) => JSON.parse(JSON.stringify(o));

// Gebiet aus dem Lehrplan der Klassenstufe ("sameAs" verweist auf eine andere Stufe). Seit Phase 6b
// steht dort nur der Zahlenraum; was gerechnet wird, bestimmen Leiterstufen und Gebietsfenster.
export function resolveCurriculum(config, grade, areaId) {
  const area = curriculumOf(config, grade)?.areas?.[areaId];
  if (!area) throw new Error(`Gebiet ${areaId} fehlt im Lehrplan Klasse ${grade}`);
  return area;
}

function enemyType(config, typeId) {
  const t = config.enemies?.[typeId] ?? config.bosses?.bosses?.[typeId];
  if (!t) throw new Error(`unbekannter Gegner: ${typeId}`);
  return t;
}

export function createCombat({ config, enemyTypeIds, hero, deck, moreTime = 'off', areaId, level = 1, seed, untimedTasks = 0, grade = 3, forgiving = false, cardLevels = {}, enemyPower = 1, taskPlan = null }) {
  // taskPlan (Phase 6b): { grade, stageOf: { <leiter>: n }, windows: { <leiter>: [von, bis] } }; ohne Plan Regelwerk 7.6 nach level
  // enemyPower: Strömung (D33), Leben und Angriff der Gegner × enemyPower
  // cardLevels: Stufe je Kartenart (Etappe 8), gilt für den ganzen Kampf
  // forgiving: Erklärungskampf (D24), Fehler kosten keine Leben und kommen nicht auf die Übungsliste.
  const shuffleRng = createRng(deriveSeed(seed, 'shuffle'));
  const taskRng = createRng(deriveSeed(seed, 'tasks'));
  const combat = {
    config,
    rng: { shuffle: shuffleRng, tasks: taskRng },
    area: resolveCurriculum(config, grade, areaId),
    curriculum: curriculumOf(config, grade),
    taskPlan: taskPlan ?? planWithoutLearning(curriculumOf(config, grade), areaId, level === 1 ? 'intro' : 'normal', grade),
    asked: new Set(), // A-3: schon gestellte Rechnungen dieses Kampfs
    // Mischregel (Regelwerk 7.2): Aufgaben je Leiter. Der Zähler läuft über Kämpfe und Tauchgänge weiter
    // (Review 7b, B1: ein Kampf allein hat selten vier Aufgaben einer Leiter); das Spiel reicht den Stand
    // im Aufgabenplan herein und schreibt ihn nach jeder Aufgabe in den Spielstand.
    mixCount: { ...(taskPlan?.mixCount ?? {}) },
    usedPractice: new Set(), // Übungsaufgaben, die in diesem Kampf schon dran waren
    level,
    moreTime,
    untimedLeft: untimedTasks,
    forgiving: Boolean(forgiving),
    phase: 'player',
    turn: 0,
    hero: { hp: hero.hp, maxHp: hero.maxHp, strength: hero.strength ?? 0, calm: hero.calm ?? 0, block: 0, energy: 0, healBonus: hero.healBonus ?? 0 },
    discardsPerTurn: hero.discards ?? config.game.hero.discardsPerTurn,
    enemies: enemyTypeIds.map((typeId, i) => {
      const t = enemyType(config, typeId);
      const hp = Math.round(t.hp * enemyPower);
      return {
        uid: `e${i + 1}`, typeId, hp, maxHp: hp, block: 0, power: enemyPower,
        immune: t.immune ?? null, immuneBroken: 0, pattern: t.pattern, patternIndex: 0, shieldedBy: t.shieldedBy ?? [],
        // Phase 5, Etappe 6: Bossregel, Kampfphasen, Schwächung durch die Tintenwolke
        rule: t.rule ?? null, phases: t.phases ?? [], phase: 1, weak: null,
      };
    }),
    piles: createPiles(deck, shuffleRng),
    discardsLeft: 0,
    pending: null,
    cycle: null,
    practiceLog: [],
    startEvents: [],
    cardLevels: { ...cardLevels },
    enemyPower,
    streak: 0, // Serie richtiger Antworten in Folge (Etappe 8, M13); die Zeit wird nie kürzer
  };
  combat.startEvents = startTurn(combat);
  // Tüftlerin, Korallenpanzer (Phase 5, Etappe 7): Schutz zu Beginn des Kampfs
  if (hero.startBlock) combat.hero.block = hero.startBlock;
  return combat;
}

function startTurn(c) {
  c.turn += 1;
  // Panzerknacker (Phase 5, Etappe 3): aufgehobene Immunität zählt die eigenen Züge herunter
  const restored = [];
  for (const e of c.enemies) {
    if (e.immuneBroken > 0) {
      e.immuneBroken -= 1;
      if (e.immuneBroken === 0) restored.push({ type: 'immunityRestored', enemyUid: e.uid });
    }
  }
  c.hero.block = 0;
  c.hero.energy = c.config.game.hero.energy;
  c.discardsLeft = c.discardsPerTurn ?? c.config.game.hero.discardsPerTurn;
  c.phase = 'player';
  return [...restored, { type: 'turnStarted', turn: c.turn }, ...drawTo(c.piles, c.config.game.hero.handSize, c.rng.shuffle)];
}

const alive = (e) => e.hp > 0;
const levelOf = (c, cardId) => c.cardLevels[cardId] ?? 1;
const effectOf = (c, cardId) => cardEffect(c.config.cards[cardId], levelOf(c, cardId));

// Zusatzschaden der Serie, wenn die laufende Antwort richtig ist (Serie dann streak + 1).
function streakBonus(c) {
  const st = c.config.game.streak;
  const next = c.streak + 1;
  if (next < st.from) return 0;
  return Math.min(st.maxBonus, (next - st.from + 1) * st.bonusPerStep);
}

function setStreak(c, value, events) {
  if (c.streak === value) return;
  c.streak = value;
  events.push({ type: 'streakChanged', streak: value });
}
const findHand = (c, uid) => c.piles.hand.find((k) => k.uid === uid);

function isShielded(c, enemy) {
  return enemy.shieldedBy.length > 0 && c.enemies.some((o) => o !== enemy && alive(o) && enemy.shieldedBy.includes(o.typeId));
}

// Grund, warum eine Karte jetzt (gegen dieses Ziel) nicht gespielt werden kann, sonst null.
function blockedReason(c, cardDef, target) {
  if (cardDef.cost > c.hero.energy) return 'energy';
  if (cardDef.target === 'enemy' && target) {
    if (cardDef.effect.type === 'breakImmunity' && (!target.immune || target.immuneBroken > 0)) return 'noImmunity';
    if (target.immune && target.immuneBroken === 0 && cardDef.task?.operation === target.immune) return 'immune';
    if (isShielded(c, target)) return 'shielded';
  }
  return null;
}

// Schaden auf Schutz und Leben; floor = kleinste erlaubte Lebenszahl.
function hit(unit, amount, floor = 0) {
  const blocked = Math.min(unit.block, amount);
  unit.block -= blocked;
  const rest = amount - blocked;
  const before = unit.hp;
  unit.hp = Math.max(floor, unit.hp - rest);
  return { amount: before - unit.hp, blocked };
}

// Angekündigte Absicht nach Schwächung (Tintenwolke): Angriff um weak.amount kleiner, nie unter 0.
export function effectiveIntent(enemy) {
  let intent = intentFor(enemy);
  if (intent.type === 'attack' && enemy.power && enemy.power !== 1) intent = { ...intent, amount: Math.round(intent.amount * enemy.power) };
  if (intent.type === 'attack' && enemy.weak) return { ...intent, amount: Math.max(0, intent.amount - enemy.weak.amount) };
  return intent;
}

// Kampfphasen (Herr des Grabens): unter belowHpPercent der Leben wechselt das Muster.
function checkPhase(enemy, events) {
  const next = enemy.phases[enemy.phase - 1];
  if (!next || !alive(enemy) || enemy.hp >= (enemy.maxHp * next.belowHpPercent) / 100) return;
  enemy.phase += 1;
  enemy.pattern = next.pattern;
  enemy.patternIndex = 0;
  events.push({ type: 'bossPhase', enemyUid: enemy.uid, phase: enemy.phase });
}

// Aufgabe als Schritt einer zusammengesetzten Aufgabe (Muräne: erst finden, dann rechnen).
function asStep(task) {
  const solve = task.format === 'solve';
  return {
    format: task.format,
    prompt: solve ? 'task.solveStep' : task.prompt,
    promptParams: task.promptParams ?? null,
    display: solve ? `${task.prompt} = ?` : task.display ?? null,
    choices: task.choices, correctIndex: task.correctIndex,
    solutionText: task.solutionText, practiceKey: task.practiceKey,
    line: task.line, marks: task.marks,
    // eigene Zeit des Schritts (A-7): Zeitklasse und Zusatzzeit der Stufe, aus der er stammt
    timeClass: task.timeClass ?? null, extraMs: task.extraMs ?? 0,
    // Hilfe nach einem Fehler auch im Schritt (Review 7b, B6): Fehlertypen der Antworten und Rechenweg
    choiceTypes: task.choiceTypes ?? null, way: task.way ?? null,
  };
}

// Kopiert Schritt i in die Felder, die auch einschrittige Aufgaben haben (prompt, choices …).
function setStep(task, i) {
  const st = task.steps[i];
  task.stepIndex = i;
  task.stepFormat = st.format ?? task.format;
  // Zeit des Schritts: seine eigene Zeitklasse und Zusatzzeit, sonst die der ganzen Aufgabe
  task.stepTimeClass = 'timeClass' in st ? st.timeClass : (task.timeClass ?? null);
  task.stepExtraMs = st.extraMs ?? task.extraMs ?? 0;
  if (st.line) { task.line = st.line; task.marks = st.marks; }
  task.prompt = st.prompt;
  task.promptParams = st.promptParams ?? null;
  task.display = st.display ?? null;
  task.choices = st.choices;
  task.correctIndex = st.correctIndex;
  task.solutionText = st.solutionText;
  task.practiceKey = st.practiceKey ?? task.practiceKey;
  task.choiceTypes = st.choiceTypes ?? null; // Fehlertypen und Rechenweg des Schritts (Phase 6b)
  task.way = st.way ?? null;
  task.wrongChoices = [];
  // Zuordnen: schon zugeordnete Ergebnisse sind gesperrt (die vier Felder bleiben, D12)
  task.usedChoices = task.format === 'match' ? task.steps.slice(0, i).map((x) => x.correctIndex) : [];
}

// Blasenkette: trifft den lebenden, nicht geschützten Gegner mit den wenigsten Leben.
function hitWeakest(c, amount) {
  const targets = c.enemies.filter((e) => alive(e) && !isShielded(c, e));
  if (targets.length === 0) return [];
  const target = targets.reduce((low, e) => (e.hp < low.hp ? e : low));
  const r = hit(target, amount);
  const events = [{ type: 'damageDealt', targetUid: target.uid, amount: r.amount, blocked: r.blocked }];
  if (!alive(target)) events.push({ type: 'enemyDefeated', enemyUid: target.uid });
  checkPhase(target, events);
  return events;
}

function finishCard(c, def, pending) {
  if (def.exhaust) {
    moveToExhausted(c.piles, pending.cardUid);
    return [{ type: 'cardExhausted', cardUid: pending.cardUid }];
  }
  moveToDiscard(c.piles, pending.cardUid);
  return [];
}

function afterCorrect(c, events) {
  c.pending = null;
  if (c.enemies.every((e) => !alive(e))) {
    c.phase = 'won';
    events.push({ type: 'combatWon' });
  } else {
    c.phase = 'player';
  }
  return events;
}

// Ein Schritt einer mehrschrittigen Aufgabe. Ohne Tempo-Bonus (noTempo).
function answerStep(c, outcome, choiceIndex) {
  const pending = c.pending;
  const task = pending.task;
  const def = c.config.cards[pending.cardId];
  const st = task.steps[task.stepIndex];
  const events = [{ type: 'stepJudged', stepIndex: task.stepIndex, outcome, ladder: st.ladder ?? null, stageId: st.stageId ?? null, counts: Boolean(st.counts && !st.tried) }];
  st.tried = true;
  if (outcome === 'correct') {
    if (def.effect.type === 'damagePerStep') {
      const fx = effectOf(c, pending.cardId);
      events.push(...hitWeakest(c, fx.amount + c.hero.strength * c.config.game.stats.strengthDamagePerPoint + streakBonus(c)));
      if (c.enemies.every((e) => !alive(e))) {
        events.push({ type: 'answerJudged', outcome: 'correct', tierId: 'normal', solutionText: task.solutionText, cardId: pending.cardId });
        setStreak(c, c.streak + 1, events);
        events.push(...finishCard(c, def, pending));
        return afterCorrect(c, events);
      }
    }
    if (task.stepIndex + 1 < task.steps.length) {
      setStep(task, task.stepIndex + 1);
      if (!task.untimed) task.timeLimitMs = timeLimitFor(task.stepFormat, c.hero.calm, c.moreTime, c.config.game, task.stepTimeClass, task.stepExtraMs);
      events.push({ type: 'stepOpened', stepIndex: task.stepIndex, task: clone(task) });
      return events;
    }
    events.push({ type: 'answerJudged', outcome: 'correct', tierId: 'normal', solutionText: task.solutionText, cardId: pending.cardId });
    events.push(...applyCorrect(c, def, pending, task.multiplier ?? 1));
    setStreak(c, c.streak + 1, events);
    return afterCorrect(c, events);
  }
  if (task.freeLeft > 0) {
    task.freeLeft -= 1;
    if (choiceIndex >= 0) task.wrongChoices.push(choiceIndex);
    events.push({ type: 'freeMistakeUsed', left: task.freeLeft });
    return events;
  }
  return [...events, ...resolveTask(c, outcome, null, 0, choiceIndex)];
}

// Stufen des Aufgabenplans je Leiter (für die zusammengesetzten Formate, Regelwerk 5.7)
function planStages(c) {
  return Object.fromEntries(Object.entries(c.taskPlan.stageOf).map(([ladder, n]) => [ladder, stageAt(c.curriculum, ladder, n)]));
}

// „Rechnung lösen“ aus der Leiterstufe des Aufgabenplans (Phase 6b); null, wenn das Format
// (noch) keine Leiter hat
function ladderTask(c, spec) {
  if (spec.format !== 'solve' || !LADDERS[spec.operation]) return null;
  const op = spec.operation;
  const n = c.taskPlan.stageOf[op];
  if (!n) return null;
  const win = c.taskPlan.windows[op];
  const src = mixSource(c, op, n, (c.taskPlan.practice ?? []).filter((p) => fitsPractice(c, op, win, p)));
  let task;
  if (src.source === 'practice') {
    c.usedPractice.add(src.entry.key);
    const [, a, b] = src.entry.key.split(':').map(Number);
    task = taskFromNumbers(op, stageById(c.curriculum, src.entry.stufe), { a, b }, c.area, c.rng.tasks);
    task.practice = true;
    task.review = true;
  } else {
    task = generateFromStage(op, stageAt(c.curriculum, op, src.stufe), c.area, c.rng.tasks, c.asked);
    if (src.source === 'lower') task.review = true;
  }
  task.stageRank = rankOf(c, op, task.stageId, win); // Stufe der gestellten Aufgabe (Wiederholung, Übung)
  c.asked.add(taskKey(task.operation, task.a, task.b));
  return task;
}

// Stufe einer Aufgabe über dem unteren Rand des Fensters (0 = Rand); Testspieler und Balance-Messung
function rankOf(c, ladder, stageId, win) {
  const n = c.curriculum.ladders[ladder].stages.findIndex((s) => s.id === stageId) + 1;
  return n > 0 ? n - win[0] : c.taskPlan.stageOf[ladder] - win[0];
}

// Mischregel (Regelwerk 7.2): zählt die Aufgaben je Leiter und wählt die Quelle der nächsten
function mixSource(c, ladder, n, practice = []) {
  c.mixCount[ladder] = (c.mixCount[ladder] ?? 0) + 1;
  return chooseSource({ stufe: n, win: c.taskPlan.windows[ladder], count: c.mixCount[ladder], mixEvery: c.taskPlan.mixEvery ?? 0, practice }, c.rng.tasks);
}

// A-3 (Durchsicht 6b): Kennung einer Rechnung für „schon gestellt“, in allen Formaten. Rechnungen
// „op:a:b“ wie bei taskKey (Tauschaufgaben gleich), sonst die Übungskennung des Formats.
const CALC_KEY = /^(add|sub|mul|div):(\d+):(\d+)$/;
function repeatKey(key) {
  const m = CALC_KEY.exec(key ?? '');
  return m ? taskKey(m[1], Number(m[2]), Number(m[3])) : key;
}
function repeatKeys(task) {
  return [task.practiceKey, ...(task.steps ?? []).map((st) => st.practiceKey)].filter(Boolean).map(repeatKey);
}
const isRepeat = (c, task) => repeatKeys(task).some((k) => c.asked.has(k));
const REPEAT_TRIES = 20; // danach darf wiederholt werden (Vorrat erschöpft, A-3)
function freshTask(c, make) {
  let task = make();
  for (let i = 0; i < REPEAT_TRIES && isRepeat(c, task); i++) task = make();
  return task;
}

// Übungsaufgabe passt: gleiche Rechenart, Stufe im Fenster, in diesem Kampf noch nicht gestellt
function fitsPractice(c, op, win, p) {
  if (!p.key.startsWith(`${op}:`) || c.usedPractice.has(p.key) || c.asked.has(repeatKey(p.key))) return false;
  const i = c.curriculum.ladders[op].stages.findIndex((s) => s.id === p.stufe);
  return i + 1 >= win[0] && i + 1 <= win[1];
}

// Was zählt (Regelwerk 7.1 Nr. 7): nur Aufgaben aus der aktuellen Stufe des Kindes mit genau einer Rechnung
const COUNTED_FORMATS = new Set(['solve', ...Object.keys(FORMAT_LADDER), 'match']);
function markCounts(c, task) {
  const current = (ladder) => (c.taskPlan.stageOf[ladder] ? stageAt(c.curriculum, ladder, c.taskPlan.stageOf[ladder]).id : null);
  const ok = (x) => Boolean(c.taskPlan.countable && !task.review && !task.hiddenFind && COUNTED_FORMATS.has(task.format) && x.ladder && x.stageId === current(x.ladder));
  if (task.steps) for (const st of task.steps) st.counts = ok(st);
  else task.counts = ok(task);
}

function playCard(c, { cardUid, targetUid }) {
  if (c.phase !== 'player') return reject('phase');
  const card = findHand(c, cardUid);
  if (!card) return reject('card');
  const def = c.config.cards[card.cardId];
  let target = null;
  if (def.target === 'enemy') {
    target = c.enemies.find((e) => e.uid === targetUid && alive(e));
    if (!target) return reject('target');
  }
  const reason = blockedReason(c, def, target);
  if (reason) return reject(reason);

  c.hero.energy -= def.cost;
  const events = [{ type: 'cardPlayed', cardUid, cardId: card.cardId, targetUid: target?.uid ?? null }];

  if (def.effect.type === 'cycle') {
    moveToDiscard(c.piles, cardUid);
    c.cycle = { required: Math.min(def.effect.discard, c.piles.hand.length), draw: def.effect.draw };
    c.phase = 'cycle';
    return events;
  }

  const spec = { format: def.task.format, operation: def.task.operation, level: c.level, stages: planStages(c) };
  // ifLadder (Klasse 4, Panzerknacker): hat das Gebietsfenster diese Leiter, gilt ihr Format (Teilbarkeit)
  const alt = def.task.ifLadder;
  if (alt && c.taskPlan.stageOf[alt]) spec.format = Object.keys(FORMAT_LADDER).find((f) => FORMAT_LADDER[f] === alt);
  const rule = target?.rule;
  // Wächter, Herr des Grabens: Rechenkarten gegen sie bekommen ein anderes Format
  if (rule?.type === 'taskModifier' && spec.format === 'solve') spec.format = rule.format;
  const ownLadder = FORMAT_LADDER[spec.format];
  let review = false;
  if (ownLadder && c.taskPlan.stageOf[ownLadder] && !(rule?.type === 'taskModifier')) {
    const src = mixSource(c, ownLadder, c.taskPlan.stageOf[ownLadder]);
    if (src.source === 'lower') { spec.stages = { ...spec.stages, [ownLadder]: stageAt(c.curriculum, ownLadder, src.stufe) }; review = true; }
  }
  // „Rechnung lösen“ meidet Wiederholungen schon beim Ziehen (ladderTask); die anderen Formate hier (A-3)
  let task = ladderTask(c, spec) ?? freshTask(c, () => generateTask(spec, c.area, c.rng.tasks));
  if (review) task.review = true;
  if (task.ladder && task.stageRank === undefined && c.taskPlan.windows[task.ladder]) task.stageRank = rankOf(c, task.ladder, task.stageId, c.taskPlan.windows[task.ladder]);
  // Muräne: vor jedem Angriff erst am Zahlenstrahl finden; gefunden wirkt die Karte mehrfach
  if (rule?.type === 'hidden' && def.effect.type === 'damage') {
    const find = freshTask(c, () => generateTask({ format: rule.find, stages: spec.stages }, c.area, c.rng.tasks));
    const rest = task.steps ? task.steps.map((st) => ({ format: task.format, timeClass: task.timeClass ?? null, extraMs: task.extraMs ?? 0, ...st })) : [asStep(task)];
    task = { ...task, steps: [asStep(find), ...rest], noTempo: true, multiplier: rule.multiplier, hiddenFind: true, stepOffset: 1 };
  }
  for (const k of repeatKeys(task)) c.asked.add(k);
  markCounts(c, task);
  if (task.steps) {
    // Mehrschrittig (Phase 5, Etappe 4): freie Fehlversuche aus der Karte, Zeit je Schritt
    task.freeMistakes = def.task.freeMistakes ?? 0;
    task.freeLeft = task.freeMistakes;
    setStep(task, 0);
  }
  if (c.untimedLeft > 0) {
    task.timeLimitMs = 0;
    task.untimed = true;
    c.untimedLeft -= 1;
  } else {
    task.timeLimitMs = task.steps
      ? timeLimitFor(task.stepFormat, c.hero.calm, c.moreTime, c.config.game, task.stepTimeClass, task.stepExtraMs)
      : timeLimitFor(task.format, c.hero.calm, c.moreTime, c.config.game, task.timeClass ?? null, task.extraMs ?? 0);
  }
  if (c.forgiving) task.forgiving = true;
  c.pending = { cardUid, cardId: card.cardId, targetUid: target?.uid ?? null, task };
  c.phase = 'task';
  events.push({ type: 'taskOpened', task: clone(task) });
  return events;
}

function applyCorrect(c, def, pending, multiplier) {
  const events = [];
  const fx = effectOf(c, pending.cardId); // Wirkung der Kartenstufe
  const amountFor = (base) => (c.config.game.tempo.appliesTo.includes(fx.type) ? applyMultiplier(base, multiplier) : base);
  if (fx.type === 'damage') {
    const target = c.enemies.find((e) => e.uid === pending.targetUid);
    // Serie nur bei Schadenskarten, vor dem Tempo-Bonus wie die Kraft
    const dmg = amountFor(fx.amount + c.hero.strength * c.config.game.stats.strengthDamagePerPoint + streakBonus(c));
    const r = hit(target, dmg);
    events.push({ type: 'damageDealt', targetUid: target.uid, amount: r.amount, blocked: r.blocked });
    if (!alive(target)) events.push({ type: 'enemyDefeated', enemyUid: target.uid });
    checkPhase(target, events);
  } else if (fx.type === 'weaken') {
    const target = c.enemies.find((e) => e.uid === pending.targetUid);
    target.weak = { amount: fx.amount, turns: fx.turns };
    events.push({ type: 'weakened', enemyUid: target.uid, amount: fx.amount, turns: fx.turns });
  } else if (fx.type === 'block') {
    const amount = amountFor(fx.amount);
    c.hero.block += amount;
    events.push({ type: 'blockGained', amount });
  } else if (fx.type === 'energy') {
    c.hero.energy += fx.amount;
    events.push({ type: 'energyGained', amount: fx.amount });
  } else if (fx.type === 'buff') {
    // Kraft für den Rest des Kampfs; kein Tempo-Bonus (nicht in tempo.appliesTo)
    c.hero.strength += fx.amount;
    events.push({ type: 'buffGained', stat: fx.stat, amount: fx.amount });
  } else if (fx.type === 'breakImmunity') {
    const target = c.enemies.find((e) => e.uid === pending.targetUid);
    target.immuneBroken = fx.turns;
    events.push({ type: 'immunityBroken', enemyUid: target.uid, turns: fx.turns });
  } else if (fx.type === 'heal') {
    const before = c.hero.hp;
    c.hero.hp = Math.min(c.hero.maxHp, c.hero.hp + amountFor(fx.amount + c.hero.healBonus)); // Meereswesen: healBonus
    events.push({ type: 'healed', amount: c.hero.hp - before });
  }
  if (def.exhaust) {
    moveToExhausted(c.piles, pending.cardUid);
    events.push({ type: 'cardExhausted', cardUid: pending.cardUid });
  } else {
    moveToDiscard(c.piles, pending.cardUid);
  }
  return events;
}

// Felder für die Lernstufen (Regelwerk 7.1): Leiter, Stufe, ob die Antwort zählt, Übungsaufgabe
function judgedFields(t) {
  return { ladder: t.ladder ?? null, stageId: t.stageId ?? null, counts: Boolean(t.counts && !t.steps), practiceKey: t.practiceKey ?? null, practice: Boolean(t.practice), review: Boolean(t.review) };
}

// chosen: gewählte Antwort (für den Fehlertyp); -1 oder null bei abgelaufener Zeit
function resolveTask(c, outcome, tierId, multiplier, chosen = null) {
  const pending = c.pending;
  const def = c.config.cards[pending.cardId];
  c.pending = null;
  const t = pending.task;
  const events = [{ type: 'answerJudged', outcome, tierId, solutionText: t.solutionText, cardId: pending.cardId, ...judgedFields(t) }];
  if (outcome !== 'correct') {
    // Hilfe nach einem Fehler (Regelwerk 8.1, 8.2): Fehlertyp der gewählten Antwort und Rechenweg
    events[0].mistakeType = (chosen !== null && chosen >= 0 ? t.choiceTypes?.[chosen] : null) ?? null;
    events[0].way = t.way ?? null;
    // Nachbaraufgabe getippt: Weg von dieser Aufgabe aus, passend zum Hinweis (Phase 7a, Kritik P2)
    if ((events[0].mistakeType === 'F-MUL-a' || events[0].mistakeType === 'F-MUL-d') && Number.isInteger(t.a) && Number.isInteger(t.b)) {
      const nw = neighborWay(t.a, t.b, Number(String(t.choices[chosen]).replace(/\D/g, '')));
      if (nw) events[0].way = nw;
    }
    // Stelle des Übergangs für den Hinweis (Phase 7a, D47); nur bei Plus und Minus mit Fehlertyp
    // (bei der Muräne trägt die Aufgabe a und b der Rechnung auch im Suchschritt, deshalb die Prüfung des Typs)
    const plusMinusMistake = /^F-(ADD|SUB)-/.test(events[0].mistakeType ?? '');
    events[0].hintPlace = plusMinusMistake && Number.isInteger(t.a) && Number.isInteger(t.b) ? crossPlace(t.operation, t.a, t.b) : null;
  }
  if (outcome === 'correct') {
    events.push(...applyCorrect(c, def, pending, multiplier));
    setStreak(c, c.streak + 1, events);
    if (c.enemies.every((e) => !alive(e))) {
      c.phase = 'won';
      events.push({ type: 'combatWon' });
    } else {
      c.phase = 'player';
    }
    return events;
  }
  moveToDiscard(c.piles, pending.cardUid);
  c.phase = 'feedback';
  if (pending.task.forgiving) {
    events.push({ type: 'forgivenMistake' }); // Erklärung: Serie bleibt
    return events;
  }
  setStreak(c, 0, events); // ohne Hinweis in der Oberfläche (kein Druck)
  const p = c.config.game.penalty;
  const r = hit(c.hero, outcome === 'timeout' ? p.timeout : p.wrong, p.minHp);
  events.push({ type: 'selfDamage', amount: r.amount, blocked: r.blocked });
  c.practiceLog.push(pending.task.practiceKey);
  return events;
}

function answer(c, { choiceIndex, elapsedMs }) {
  if (c.phase !== 'task') return reject('phase');
  const task = c.pending.task;
  // Phase 7a: nur ein vorhandener Knopf und eine Zeit als Zahl (die Oberfläche schickt nichts anderes);
  // eine negative Zeit (Aufgabe ohne Zeitlimit: Grenze 0 − 1) zählt als 0
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= task.choices.length) return reject('command');
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs)) return reject('command');
  elapsedMs = Math.max(0, elapsedMs);
  const tempo = judgeTempo(elapsedMs, task.timeLimitMs, c.config.game.tempo);
  if (task.steps) {
    if ((task.usedChoices ?? []).includes(choiceIndex) || task.wrongChoices.includes(choiceIndex)) return reject('card');
    const outcome = tempo.result === 'timeout' ? 'timeout' : choiceIndex === task.correctIndex ? 'correct' : 'wrong';
    return answerStep(c, outcome, outcome === 'timeout' ? -1 : choiceIndex);
  }
  if (tempo.result === 'timeout') return resolveTask(c, 'timeout', null, 0);
  if (choiceIndex !== task.correctIndex) return resolveTask(c, 'wrong', null, 0, choiceIndex);
  return resolveTask(c, 'correct', tempo.tierId, tempo.multiplier);
}

function timeout(c) {
  if (c.phase !== 'task') return reject('phase');
  if (c.pending.task.steps) return answerStep(c, 'timeout', -1);
  return resolveTask(c, 'timeout', null, 0);
}

function acknowledgeFeedback(c) {
  if (c.phase !== 'feedback') return reject('phase');
  c.phase = 'player';
  return [{ type: 'feedbackClosed' }];
}

function confirmCycle(c, { cardUids }) {
  if (c.phase !== 'cycle') return reject('phase');
  const uids = Array.isArray(cardUids) ? cardUids : [];
  if (uids.length !== c.cycle.required || new Set(uids).size !== uids.length) return reject('cycleCount');
  if (!uids.every((u) => findHand(c, u))) return reject('card');
  const events = [];
  for (const uid of uids) {
    moveToDiscard(c.piles, uid);
    events.push({ type: 'cardDiscarded', cardUid: uid });
  }
  events.push(...drawCount(c.piles, c.cycle.draw, c.rng.shuffle));
  c.cycle = null;
  c.phase = 'player';
  return events;
}

function discard(c, { cardUid }) {
  if (c.phase !== 'player') return reject('phase');
  if (c.discardsLeft <= 0) return reject('discards');
  if (!findHand(c, cardUid)) return reject('card');
  moveToDiscard(c.piles, cardUid);
  c.discardsLeft -= 1;
  return [{ type: 'cardDiscarded', cardUid }];
}

function endTurn(c) {
  if (c.phase !== 'player') return reject('phase');
  const events = [];
  for (const enemy of c.enemies) {
    if (!alive(enemy)) continue;
    enemy.block = 0; // Schutz des Gegners verfällt, wenn er das nächste Mal handelt
    const intent = effectiveIntent(enemy);
    events.push({ type: 'enemyActed', enemyUid: enemy.uid, intent });
    if (intent.type === 'attack') {
      const r = hit(c.hero, intent.amount);
      events.push({ type: 'heroDamaged', amount: r.amount, blocked: r.blocked });
    } else if (intent.type === 'block') {
      enemy.block += intent.amount;
    }
    advancePattern(enemy);
    if (enemy.weak && --enemy.weak.turns <= 0) { enemy.weak = null; events.push({ type: 'weakEnded', enemyUid: enemy.uid }); }
    if (c.hero.hp <= 0) {
      c.phase = 'lost';
      events.push({ type: 'combatLost' });
      return events;
    }
  }
  events.push(...startTurn(c));
  return events;
}

const HANDLERS = { playCard, answer, timeout, acknowledgeFeedback, confirmCycle, discard, endTurn };

export function combatDispatch(combat, command) {
  if (combat.phase === 'won' || combat.phase === 'lost') return reject('phase');
  const handler = HANDLERS[command?.type];
  if (!handler) return reject('command');
  return handler(combat, command);
}

// Darstellung für die Oberfläche. Mit { targetUid } enthält jede Handkarte
// playable und blockedReason für dieses Ziel.
export function combatView(combat, { targetUid } = {}) {
  const c = combat;
  const target = c.enemies.find((e) => e.uid === targetUid && alive(e)) ?? null;
  return {
    phase: c.phase,
    turn: c.turn,
    hero: { ...c.hero, streak: c.streak },
    current: c.enemyPower, // Strömung (D33)
    discardsLeft: c.discardsLeft,
    enemies: c.enemies.map((e) => ({
      uid: e.uid, typeId: e.typeId, hp: e.hp, maxHp: e.maxHp, block: e.block, immune: e.immune, immuneBroken: e.immuneBroken,
      alive: alive(e), shielded: isShielded(c, e), intent: alive(e) ? effectiveIntent(e) : null,
      rule: e.rule?.type ?? null, phase: e.phase, weakTurns: e.weak?.turns ?? 0,
    })),
    hand: c.piles.hand.map((k) => {
      const def = c.config.cards[k.cardId];
      const reason = c.phase === 'player' ? blockedReason(c, def, def.target === 'enemy' ? target : null) : 'phase';
      return { uid: k.uid, cardId: k.cardId, cost: def.cost, level: levelOf(c, k.cardId), playable: reason === null, blockedReason: reason };
    }),
    piles: { draw: c.piles.draw.length, discard: c.piles.discard.length, exhausted: c.piles.exhausted.length },
    task: c.phase === 'task' ? c.pending.task : null,
    cycleRequired: c.phase === 'cycle' ? c.cycle.required : null,
  };
}
