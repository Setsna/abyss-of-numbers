// Kampf-Bildschirm (Plan Etappe 4). Aufbau und Gestaltung aus dem Prototyp (Phase 3, DESIGN.md);
// Regeln und Zustand kommen aus dem Spiel (game.js). Die Oberfläche schickt Befehle und spielt Ereignisse ab.
// onWon/onLost: Knopf im Abschlussbanner (Weiter zur Beute bzw. Zur Station / Noch einmal).
import { combatView } from '../../engine/combat/combat.js';
import { ICON } from '../icons.js';
import { renderAsset } from '../assets.js';
import { playEvents, wait, isCalm } from '../app.js';
import { bindKeys } from '../input.js';
import { renderEnemy } from '../components/enemy.js';
import { renderCard, emptySlot } from '../components/card.js';
import { createTaskPanel } from '../components/task-panel.js';
import { startTimerBar } from '../components/timer-bar.js';
import { createTutorial } from '../tutorial.js';

const STAGE_HTML = `
<main class="stage">
  <section class="scene panel" id="scene" aria-label="Kampf">
    <div class="scene-bg" id="sceneBg"></div>
    <p class="caption" id="caption" aria-live="polite"></p>
    <div class="hero" id="hero">
      <div class="hero-art" id="heroArt"></div>
      <span class="current" id="currentPlate" hidden></span>
      <div class="plate hero-plate">
        <span class="stat" id="heroHp"></span>
        <span class="stat block" id="heroBlock" hidden></span>
        <span class="stat streak" id="heroStreak" hidden></span>
      </div>
      <div class="hpbar"><i id="heroHpBar"></i></div>
    </div>
    <div class="foes" id="foes"></div>
    <div class="bubble" id="bubble" hidden></div>
    <div class="boom" id="boom" aria-hidden="true"></div>
    <div class="banner" id="banner" hidden>
      <p class="banner-word" id="bannerWord"></p>
      <p class="banner-text" id="bannerText"></p>
      <button class="btn btn-go" type="button" id="againBtn"></button>
    </div>
  </section>
  <section class="strip panel" aria-label="Karten">
    <div class="panel stats">
      <div class="energy" id="energy"></div>
      <div class="piles"><span class="pile" id="drawPile"></span><span class="pile" id="discardPile"></span></div>
    </div>
    <div class="hand" id="hand"></div>
    <div class="actions">
      <button class="btn btn-quiet" type="button" id="discardBtn"></button>
      <button class="btn btn-end" type="button" id="endBtn"></button>
    </div>
  </section>
</main>`;

const clone = (o) => JSON.parse(JSON.stringify(o));

// tutorial: Erklärung im ersten Kampf; explained: schon erklärte Kartenarten; onExplain(key): merken.
export function mountCombat(root, { config, t, game, audio, onWon, onLost, tutorial = false, explained = {}, onExplain = () => {} }) {
  root.innerHTML = STAGE_HTML;
  const $ = (id) => root.querySelector(`#${id}`);
  const cards = config.cards;
  const handSize = config.game.hero.handSize;

  let combat;
  let shown;            // angezeigter Stand (während Ereignisse abgespielt werden, sonst live)
  let targetUid = null;
  let mode = null;      // null | 'discard'
  let picked = new Set(); // Strudel-Auswahl
  let busy = false;
  let foesTurn = false;  // Gegnerzug läuft (für die Infobox)
  let pendingUid = null; // Karte, deren Aufgabe gerade offen ist
  let task = null;
  let timerBar = null;
  const tut = createTutorial({ active: tutorial });
  const seenCards = new Set(Object.keys(explained).filter((k) => k.startsWith('card.')).map((k) => k.slice(5)));
  // Bossregel beim ersten Treffen (Phase 5, Etappe 6): ein Satz in der Ansage, bis die erste Karte gespielt ist
  const ruleBoss = game.combat.enemies.find((e) => e.rule && !explained[`boss.${e.typeId}`]);
  let ruleText = ruleBoss ? t(`boss.rule.${ruleBoss.typeId}`) : null;
  if (ruleBoss) onExplain(`boss.${ruleBoss.typeId}`);

  const panel = createTaskPanel($('bubble'), { t, onAnswer: (k) => answer(k), onNext: () => next() });
  // Satz zur Kartenart: oben in der Sprechblase, damit er die Aufgabe nie verdeckt
  const cardHint = document.createElement('p');
  cardHint.className = 'card-hint';
  cardHint.id = 'cardHint';
  cardHint.hidden = true;
  $('bubble').prepend(cardHint);

  // Hintergrund des Gebiets (Phase 5, Etappe 5); bis eigene Bilder da sind, färbt CSS das Riff ein
  const areaId = game.view().run?.areaId ?? 'reef';
  $('scene').dataset.area = areaId;
  $('sceneBg').append(renderAsset(config.areas.areas[areaId]?.background ?? 'area.reef', ''));
  const profile = game.view().profile; // Testkampf ohne Stand: erste Figur
  $('heroArt').append(renderAsset(profile?.asset ?? 'hero.diver', profile?.name ?? t('hero.name')));

  // ---------- Darstellung ----------
  const live = () => combatView(combat, { targetUid });

  function autoTarget() {
    const v = combatView(combat);
    if (targetUid && !v.enemies.find((e) => e.uid === targetUid)?.alive) targetUid = null;
    const candidates = v.enemies.filter((e) => e.alive && !e.shielded);
    if (!targetUid && candidates.length === 1 && tut.step !== 1) targetUid = candidates[0].uid; // Schritt 1 der Erklärung: selbst antippen
  }

  function render(v = live()) {
    shown = v;
    const h = v.hero;
    $('heroHp').innerHTML = `${ICON.heart}<span>${h.hp}/${h.maxHp}</span>`;
    $('heroHp').setAttribute('aria-label', t('hud.hp', { n: h.hp, max: h.maxHp }));
    $('heroBlock').hidden = h.block <= 0;
    $('heroBlock').innerHTML = `${ICON.shield}<span>${h.block}</span>`;
    // Serie (Etappe 8): erst ab der Stufe, die Schaden bringt; endet sie, verschwindet die Zahl ohne Hinweis
    const streakOn = (h.streak ?? 0) >= config.game.streak.from;
    $('heroStreak').hidden = !streakOn;
    if (streakOn) $('heroStreak').textContent = t('hud.streak', { n: h.streak });
    // Strömung (D33): nur sichtbar, wenn die Gegner verändert sind
    const cur = v.current ?? 1;
    $('currentPlate').hidden = cur === 1;
    if (cur !== 1) {
      $('currentPlate').textContent = t(cur > 1 ? 'current.strongShort' : 'current.calmShort');
      $('currentPlate').setAttribute('aria-label', t(cur > 1 ? 'current.strong' : 'current.calm'));
      $('currentPlate').title = t(cur > 1 ? 'current.strong' : 'current.calm');
      $('currentPlate').classList.toggle('is-low', cur < 1);
    }
    $('heroHpBar').style.width = `${(Math.max(0, h.hp) / h.maxHp) * 100}%`;

    const foes = $('foes');
    foes.dataset.n = v.enemies.length;
    foes.replaceChildren(...v.enemies.map((e) => renderEnemy(e, { t, selected: e.uid === targetUid })));

    const maxEnergy = config.game.hero.energy;
    $('energy').innerHTML = Array.from({ length: Math.max(maxEnergy, h.energy) },
      (_, k) => `<span class="${k < h.energy ? '' : 'is-empty'}">${ICON.bolt}</span>`).join('');
    $('energy').setAttribute('aria-label', t('hud.energy', { n: h.energy, max: maxEnergy }));
    $('drawPile').innerHTML = `${ICON.deck}<span>${t('hud.drawPile', { n: v.piles.draw })}</span>`;
    $('discardPile').innerHTML = `${ICON.discard}<span>${t('hud.discardPile', { n: v.piles.discard })}</span>`;

    const hand = $('hand');
    hand.classList.toggle('is-discard', mode === 'discard');
    hand.classList.toggle('is-cycle', v.phase === 'cycle');
    const slots = [];
    for (let k = 0; k < Math.max(handSize, v.hand.length); k++) {
      const c = v.hand[k];
      if (!c) { slots.push(emptySlot()); continue; }
      const why = v.phase === 'player' && !mode && !busy ? c.blockedReason : null;
      slots.push(renderCard(c, cards[c.cardId], { t, why, picked: picked.has(c.uid), pending: c.uid === pendingUid }));
    }
    hand.replaceChildren(...slots);

    const playing = v.phase === 'player' && !busy;
    const discardBtn = $('discardBtn');
    discardBtn.textContent = mode ? t('btn.discardStop') : t('btn.discard', { n: v.discardsLeft });
    discardBtn.setAttribute('aria-pressed', String(mode != null));
    discardBtn.disabled = !playing || (!mode && (v.discardsLeft === 0 || v.hand.length === 0));
    $('endBtn').textContent = t('btn.end');
    $('endBtn').disabled = !playing || mode != null;

    renderCaption(v);
    tut.highlight(root, { quiet: v.phase !== 'player' }); // während der Aufgabe ruhig (Regel „Ruhige Aufgabe“)
  }

  function renderCaption(v) {
    let text = '';
    if (foesTurn) text = t('caption.foeTurn');
    else if (v.phase === 'feedback') text = t('caption.next');
    else if (v.phase === 'task' && task) {
      const f = task.stepFormat ?? task.format;
      text = t(f === 'solve' ? 'caption.solve' : `caption.${f}`);
    }
    else if (v.phase === 'cycle') text = v.cycleRequired === 1 ? t('caption.cycleOne') : t('caption.cycle', { n: v.cycleRequired });
    else if (v.phase === 'player') {
      const candidates = v.enemies.filter((e) => e.alive && !e.shielded);
      if (mode === 'discard') text = t('caption.discard');
      else if (!v.hand.some((c) => c.cost <= v.hero.energy)) text = t('caption.noEnergy');
      else if (!targetUid && candidates.length > 1) text = t('caption.pickFoe');
      else if (targetUid && v.enemies.find((e) => e.uid === targetUid)?.shielded) text = t('caption.shieldedTarget');
      else text = t('caption.pickCard');
    }
    const noPlayable = v.phase === 'player' && !v.hand.some((c) => c.cost <= v.hero.energy);
    const tutText = !foesTurn && v.phase !== 'feedback' ? tut.text(t, { noPlayable }) : null;
    // Steht der Kartenhinweis in der Sprechblase, sagt die Blase schon alles; die Ansage würde sonst angeschnitten.
    const hintShown = v.phase === 'task' && !$('cardHint').hidden;
    const lead = tutText ?? (ruleText && v.phase === 'player' ? ruleText : null);
    $('caption').textContent = hintShown ? '' : (lead ?? text);
    $('caption').classList.toggle('is-tutorial', Boolean(lead));
  }

  // ---------- Rückmeldung ----------
  function showBoom(text) {
    const el = $('boom');
    el.textContent = text;
    el.classList.remove('is-on'); void el.offsetWidth; el.classList.add('is-on');
  }

  function floatAt(target, text, cls = '') {
    if (!target) return;
    const scene = $('scene').getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${r.left - scene.left + r.width / 2}px`;
    el.style.top = `${r.top - scene.top + r.height * 0.3}px`;
    $('scene').append(el);
    setTimeout(() => el.remove(), 1050);
  }

  function shake(el) {
    if (!el || isCalm()) return;
    el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 260 });
  }
  const foeEl = (uid) => root.querySelector(`.foe[data-uid="${uid}"]`);
  const hitAnim = (el) => {
    if (!el || isCalm()) return;
    el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(0)' }], { duration: 360, easing: 'cubic-bezier(0.16,1,0.3,1)' });
  };

  // Klang je Ereignis aus sounds.json (Etappe 9); stumm, wenn kein Ton übergeben ist
  const sound = (e) => audio?.event(e);

  // Ereignisse auf den angezeigten Stand anwenden, damit Zahlen Schritt für Schritt sichtbar werden.
  const handlers = {
    streakChanged(e) {
      shown.hero.streak = e.streak;
      render(shown);
    },
    cardPlayed(e) {
      ruleText = null; // Bossregel ist gelesen, sobald die erste Karte gespielt wird
      showCardHint(e.cardId);
      if (cards[e.cardId].task) pendingUid = e.cardUid;
      shown.hero.energy -= cards[e.cardId].cost;
      render(shown);
    },
    taskOpened(e) {
      task = e.task;
      panel.open(task);
      timerBar = startTimerBar({ root: panel.timerRoot, fill: panel.timerFill, limitMs: task.timeLimitMs, onTimeout: () => answer(-1) });
      if (tut.step <= 2 && tut.active) tut.advance('task');
      render(shown);
    },
    // Mehrschrittige Aufgaben (Phase 5, Etappe 4)
    async stepJudged(e) {
      if (e.outcome === 'correct') {
        panel.markRight(task.correctIndex);
        await wait(260);
      } else {
        if (e.chosen >= 0) panel.markWrong(e.chosen);
      }
    },
    stepOpened(e) { task = e.task; },
    async bossPhase() {
      showBoom(t('boss.phase2'));
      await wait(700);
    },
    weakened(e) {
      const foe = shown.enemies.find((x) => x.uid === e.enemyUid);
      foe.weakTurns = e.turns;
      if (foe.intent?.type === 'attack') foe.intent = { ...foe.intent, amount: Math.max(0, foe.intent.amount - e.amount) };
      render(shown);
    },
    freeMistakeUsed(e) { task = { ...task, freeLeft: e.left }; },
    async energyGained(e) {
      shown.hero.energy += e.amount;
      render(shown);
      floatAt($('hero'), `+${e.amount}`, 'is-block');
      await wait(450);
    },
    async answerJudged(e) {
      if (e.outcome === 'correct') {
        panel.markRight(task.correctIndex);
        await wait(260);
        panel.close();
        showBoom(t(`boom.${e.tierId}`));
      } else {
        if (e.chosen >= 0) panel.markWrong(e.chosen);
        panel.markRight(task.correctIndex);
      }
    },
    async damageDealt(e) {
      const foe = shown.enemies.find((x) => x.uid === e.targetUid);
      foe.block -= e.blocked;
      foe.hp -= e.amount;
      render(shown);
      floatAt(foeEl(e.targetUid), `−${e.amount}`);
      hitAnim(foeEl(e.targetUid));
      await wait(450);
    },
    async blockGained(e) {
      shown.hero.block += e.amount;
      render(shown);
      floatAt($('hero'), `+${e.amount}`, 'is-block');
      await wait(450);
    },
    async healed(e) {
      shown.hero.hp += e.amount;
      render(shown);
      floatAt($('hero'), `+${e.amount}`, 'is-heal');
      await wait(450);
    },
    async selfDamage(e) {
      shown.hero.block -= e.blocked;
      shown.hero.hp -= e.amount;
      render(shown);
      if (e.amount > 0) floatAt($('hero'), `−${e.amount}`, 'is-self'); // eigener Fehler: Tusche, nie Koralle
      await wait(500);
    },
    async enemyActed(e) {
      const foe = shown.enemies.find((x) => x.uid === e.enemyUid);
      foe.block = 0;
      if (e.intent.type === 'block') {
        foe.block += e.intent.amount;
        render(shown);
        floatAt(foeEl(e.enemyUid), `+${e.intent.amount}`, 'is-block');
        await wait(650);
      }
    },
    async heroDamaged(e) {
      shown.hero.block -= e.blocked;
      shown.hero.hp -= e.amount;
      render(shown);
      floatAt($('hero'), `−${e.amount}`);
      hitAnim($('hero'));
      await wait(650);
    },
    cardDiscarded() {},
  };

  // ---------- Erklärung ----------
  // Jede Kartenart zeigt beim ersten Ausspielen einen Satz (unter der Ansage, nie über der Aufgabe).
  function showCardHint(cardId) {
    if (seenCards.has(cardId)) return;
    seenCards.add(cardId);
    $('cardHint').textContent = t(`hint.card.${cardId}`);
    $('cardHint').hidden = false;
    onExplain(`card.${cardId}`);
  }
  const hideCardHint = () => { $('cardHint').hidden = true; };
  function tutorialStep(what) {
    if (tut.advance(what)) onExplain('firstCombat');
    render();
  }

  // ---------- Befehle ----------
  async function run(command, extraHandlers = {}) {
    busy = true;
    const events = game.dispatch(command);
    shown = clone(shown ?? live());
    await playEvents(events, { ...handlers, ...extraHandlers }, sound);
    busy = false;
    autoTarget();
    render();
    if (combat.phase === 'won' || combat.phase === 'lost') endBanner(combat.phase === 'won');
    return events;
  }

  async function answer(k) {
    if (combat.phase !== 'task' || !timerBar) return;
    panel.lock();
    timerBar.stop();
    const elapsedMs = timerBar.elapsedMs();
    timerBar = null;
    const command = k < 0 ? { type: 'timeout' } : { type: 'answer', choiceIndex: k, elapsedMs };
    const events = game.dispatch(command);
    busy = true;
    shown = clone(shown);
    await playEvents(events.map((e) => (e.type === 'answerJudged' || e.type === 'stepJudged' ? { ...e, chosen: k } : e)), handlers, sound);
    if (combat.phase === 'task') {
      // nächster Schritt oder freier Fehlversuch: Aufgabe bleibt offen, Zeitleiste beginnt neu
      task = clone(game.view().combat.task);
      panel.open(task);
      timerBar = startTimerBar({ root: panel.timerRoot, fill: panel.timerFill, limitMs: task.timeLimitMs, onTimeout: () => answer(-1) });
      busy = false;
      render();
      return;
    }
    if (combat.phase === 'feedback') {
      await wait(400);
      const judged = events.find((e) => e.type === 'answerJudged');
      const ask = judged.outcome === 'timeout' ? t('ask.timeout')
        : task.format === 'pickTrue' ? t('ask.wrongTrue')
          : task.format === 'pickFalse' ? t('ask.wrongFalse') : t('ask.wrong');
      panel.showSolution(ask, judged.solutionText);
    } else {
      pendingUid = null;
      task = null;
      hideCardHint();
      if (tut.step === 3) tut.advance('answered');
    }
    busy = false;
    autoTarget();
    render();
    if (combat.phase === 'won' || combat.phase === 'lost') endBanner(combat.phase === 'won');
  }

  async function next() {
    if (combat.phase !== 'feedback' || busy) return;
    panel.close();
    pendingUid = null;
    task = null;
    hideCardHint();
    if (tut.step === 3) tut.advance('answered');
    await run({ type: 'acknowledgeFeedback' });
  }

  function endBanner(won) {
    if (tut.active) tutorialStep('combatOver');
    hideCardHint();
    panel.close();
    timerBar?.stop();
    $('bannerWord').textContent = t(won ? 'result.winWord' : 'result.loseWord');
    $('bannerText').textContent = t(won ? 'result.winText' : 'result.loseText');
    // im Tauchgang führt die Niederlage zur Station, im Testkampf gibt es „Noch einmal“
    $('againBtn').textContent = t(won ? 'btn.next' : (game.view().screen === 'base' ? 'btn.toBase' : 'btn.again'));
    $('againBtn').dataset.won = String(won);
    $('banner').hidden = false;
    $('againBtn').focus({ preventScroll: true });
  }

  // ---------- Eingaben ----------
  $('foes').addEventListener('click', (e) => {
    const b = e.target.closest('.foe');
    if (!b || busy || combat.phase !== 'player' || mode) return;
    targetUid = b.dataset.uid;
    render();
    if (tut.step === 1) tutorialStep('target');
  });

  $('hand').addEventListener('click', async (e) => {
    const b = e.target.closest('.card[data-uid]');
    if (!b || busy) return;
    const uid = b.dataset.uid;
    const v = live();
    if (v.phase === 'cycle') {
      if (picked.has(uid)) picked.delete(uid); else if (picked.size < v.cycleRequired) picked.add(uid);
      render();
      if (picked.size === v.cycleRequired) {
        const chosen = [...picked];
        picked = new Set();
        await run({ type: 'confirmCycle', cardUids: chosen });
      }
      return;
    }
    if (v.phase !== 'player') return;
    if (mode === 'discard') {
      await run({ type: 'discard', cardUid: uid });
      if (combat.discardsLeft === 0 || combat.piles.hand.length === 0) { mode = null; render(); }
      return;
    }
    const card = v.hand.find((c) => c.uid === uid);
    const def = cards[card.cardId];
    if (def.target === 'enemy' && !targetUid) { shake($('caption')); return; }
    if (!card.playable) { shake(b); return; }
    const events = await run({ type: 'playCard', cardUid: uid, targetUid: def.target === 'enemy' ? targetUid : undefined });
    if (combat.phase === 'cycle' && combat.cycle.required === 0) await run({ type: 'confirmCycle', cardUids: [] });
    if (events[0]?.type === 'rejected') shake(b);
  });

  $('discardBtn').addEventListener('click', () => {
    if (busy || combat.phase !== 'player') return;
    mode = mode ? null : 'discard';
    render();
  });

  $('endBtn').addEventListener('click', async () => {
    if (busy || combat.phase !== 'player' || mode) return;
    foesTurn = true;
    busy = true;
    render();
    await wait(300);
    busy = false;
    hideCardHint();
    await run({ type: 'endTurn' });
    foesTurn = false;
    render();
    if (tut.step === 4) tutorialStep('turnEnded');
  });

  $('againBtn').addEventListener('click', () => {
    if ($('againBtn').dataset.won === 'true') onWon?.(); else onLost?.();
  });

  const unbindKeys = bindKeys({
    1: () => panel.choose(0), 2: () => panel.choose(1), 3: () => panel.choose(2), 4: () => panel.choose(3),
    Enter: () => panel.pressNext(),
  });

  function start() {
    timerBar?.stop();
    timerBar = null;
    combat = game.combat;
    targetUid = null; mode = null; picked = new Set(); busy = false; pendingUid = null; task = null;
    $('banner').hidden = true;
    panel.close();
    autoTarget();
    render();
  }

  start();

  return {
    get combat() { return combat; },
    destroy() { timerBar?.stop(); timerBar = null; unbindKeys(); }, // Inhalt ersetzt der nächste Bildschirm
  };
}
