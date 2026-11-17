// Kampf-Engine (Konzept 7, Architektur 6.2). Die Oberfläche schickt Befehle,
// die Engine ändert den Zustand und liefert Ereignisse. Kein Browser, keine Uhr.
import { createRng, deriveSeed } from '../rng.js';
import { generateTask } from '../math/generate.js';
import { createPiles, drawTo, drawCount, moveToDiscard, moveToExhausted } from '../cards/piles.js';
import { intentFor, advancePattern } from '../enemies/intents.js';
import { judgeTempo, applyMultiplier, timeLimitFor } from './tempo.js';
import { cardEffect } from '../cards/effect.js';

// Alle Gründe, aus denen ein Befehl abgelehnt wird (jeder hat einen Text reject.<grund>).
export const REJECT_REASONS = ['phase', 'card', 'target', 'energy', 'immune', 'shielded', 'noImmunity', 'cycleCount', 'discards', 'command'];
const reject = (reason) => [{ type: 'rejected', reason }];
const clone = (o) => JSON.parse(JSON.stringify(o));

// Gebiet aus dem Lehrplan der Klassenstufe; "sameAs" verweist auf eine andere Stufe.
// "mixOf" (Phase 5, Etappe 5, Tiefseegraben): Mischung aus anderen Gebieten; generateTask
// zieht je Aufgabe eines davon.
export function resolveCurriculum(config, grade, areaId) {
  let cur = config[`class${grade}`];
  if (cur && cur.sameAs) cur = config[`class${cur.sameAs}`];
  const area = cur?.areas?.[areaId];
  if (!area) throw new Error(`Gebiet ${areaId} fehlt im Lehrplan Klasse ${grade}`);
  if (!area.mixOf) return area;
  return { ...area, mixOf: area.mixOf.map((id) => resolveCurriculum(config, grade, id)) };
}

function enemyType(config, typeId) {
  const t = config.enemies?.[typeId] ?? config.bosses?.bosses?.[typeId];
  if (!t) throw new Error(`unbekannter Gegner: ${typeId}`);
  return t;
}

export function createCombat({ config, enemyTypeIds, hero, deck, moreTime = 'off', areaId, level = 1, seed, untimedTasks = 0, grade = 3, forgiving = false, cardLevels = {}, enemyPower = 1 }) {
  // enemyPower: Strömung (D33), Leben und Angriff der Gegner × enemyPower
  // cardLevels: Stufe je Kartenart (Etappe 8), gilt für den ganzen Kampf
  // forgiving: Erklärungskampf (D24), Fehler kosten keine Leben und kommen nicht auf die Übungsliste.
  const shuffleRng = createRng(deriveSeed(seed, 'shuffle'));
  const taskRng = createRng(deriveSeed(seed, 'tasks'));
  const combat = {
    config,
    rng: { shuffle: shuffleRng, tasks: taskRng },
    area: resolveCurriculum(config, grade, areaId),
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
  };
}

// Kopiert Schritt i in die Felder, die auch einschrittige Aufgaben haben (prompt, choices …).
function setStep(task, i) {
  const st = task.steps[i];
  task.stepIndex = i;
  task.stepFormat = st.format ?? task.format;
  if (st.line) { task.line = st.line; task.marks = st.marks; }
  task.prompt = st.prompt;
  task.promptParams = st.promptParams ?? null;
  task.display = st.display ?? null;
  task.choices = st.choices;
  task.correctIndex = st.correctIndex;
  task.solutionText = st.solutionText;
  task.practiceKey = st.practiceKey ?? task.practiceKey;
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
  const events = [{ type: 'stepJudged', stepIndex: task.stepIndex, outcome }];
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
      if (!task.untimed) task.timeLimitMs = timeLimitFor(task.stepFormat, c.hero.calm, c.moreTime, c.config.game);
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
  return [...events, ...resolveTask(c, outcome, null, 0)];
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

  const spec = { format: def.task.format, operation: def.task.operation, level: c.level };
  const rule = target?.rule;
  // Wächter, Herr des Grabens: Rechenkarten gegen sie bekommen ein anderes Format
  if (rule?.type === 'taskModifier' && spec.format === 'solve') spec.format = rule.format;
  let task = generateTask(spec, c.area, c.rng.tasks);
  // Muräne: vor jedem Angriff erst am Zahlenstrahl finden; gefunden wirkt die Karte mehrfach
  if (rule?.type === 'hidden' && def.effect.type === 'damage') {
    const find = generateTask({ format: rule.find, level: c.level }, c.area, c.rng.tasks);
    const rest = task.steps ? task.steps.map((st) => ({ format: task.format, ...st })) : [asStep(task)];
    task = { ...task, steps: [asStep(find), ...rest], noTempo: true, multiplier: rule.multiplier, hiddenFind: true, stepOffset: 1 };
  }
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
    task.timeLimitMs = timeLimitFor(task.stepFormat ?? task.format, c.hero.calm, c.moreTime, c.config.game);
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

function resolveTask(c, outcome, tierId, multiplier) {
  const pending = c.pending;
  const def = c.config.cards[pending.cardId];
  c.pending = null;
  const events = [{ type: 'answerJudged', outcome, tierId, solutionText: pending.task.solutionText, cardId: pending.cardId }];
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
  const tempo = judgeTempo(elapsedMs, task.timeLimitMs, c.config.game.tempo);
  if (task.steps) {
    if ((task.usedChoices ?? []).includes(choiceIndex) || task.wrongChoices.includes(choiceIndex)) return reject('card');
    const outcome = tempo.result === 'timeout' ? 'timeout' : choiceIndex === task.correctIndex ? 'correct' : 'wrong';
    return answerStep(c, outcome, outcome === 'timeout' ? -1 : choiceIndex);
  }
  if (tempo.result === 'timeout') return resolveTask(c, 'timeout', null, 0);
  if (choiceIndex !== task.correctIndex) return resolveTask(c, 'wrong', null, 0);
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
