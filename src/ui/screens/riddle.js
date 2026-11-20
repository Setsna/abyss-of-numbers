// Rätselraum im Tempel (Phase 9, Etappe 7; Regelwerk 13.4): oben das Tempelbild mit der Truhe und ihrem
// Zahlenschloss, unten die Aufgabe auf Papier wie im Kampf, aber ohne Zeitleiste. Nach einem freien
// Fehlversuch ein Hinweis zum Fehler; gelöst springt die Truhe auf (Beute zeigt main.js), nicht gelöst
// zeigt das Spiel die ganze Lösung mit Rechenweg und einen Knopf zum Weitertauchen.
// Nach der Impeccable-Durchsicht (20.11.2026): Das Schloss zeigt je Schritt ein Rad, das nach einem
// richtigen Stein grün einrastet; der Satz oben steht als Sprechblase wie im Ereignisraum.
import { worldLayer } from '../components/world.js?v=805614a5';
import { createTaskPanel } from '../components/task-panel.js?v=805614a5';
import { renderAsset } from '../assets.js?v=805614a5';
import { wayText, hintAsk } from '../text.js?v=805614a5';
import { formatNumber } from '../../engine/math/format.js?v=805614a5';

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Zahl aus einem Antwortfeld (Klasse 4: schmale Leerzeichen als Tausendertrenner)
const toNumber = (s) => Number(String(s).replace(/[^\d-]/g, ''));

// Zahlenfolge: die Schritte zwischen den Zahlen als Rechenweg, z. B. „Immer +5.“
function sequenceWay(t, r) {
  const all = [...r.shown, toNumber(r.step.choices[r.step.correctIndex])];
  const steps = all.slice(1).map((n, i) => n - all[i]);
  const sign = (d) => `${d < 0 ? '−' : '+'}${formatNumber(Math.abs(d))}`;
  if (steps.every((d) => d === steps[0])) return t('riddle.seqSame', { d: sign(steps[0]) });
  return steps.map(sign).join(', ');
}

export function mountRiddle(root, { t, game, onAnswer, onLeave }) {
  root.innerHTML = `
  <main class="screen riddle-screen">
    <section class="comic-page">
      <div class="panel comic-big riddle-scene">
        <p class="banner-word riddle-word" data-ref="word"></p>
        <div class="riddle-chest" data-ref="chest"></div>
        <div class="riddle-lock" data-ref="lock" role="img"></div>
      </div>
      <div class="panel riddle-body">
        <p class="riddle-text" data-ref="text" aria-live="polite"></p>
        <div class="riddle-task" data-ref="task"></div>
      </div>
    </section>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll('[data-ref]')].map((el) => [el.dataset.ref, el]));
  const screen = root.querySelector('.riddle-screen');
  const v0 = game.view();
  root.querySelector('.riddle-scene').prepend(worldLayer(`area.${v0.run?.areaId ?? 'temple'}`, 'scene-bg'));
  ref.word.textContent = t('riddle.word');
  ref.chest.append(renderAsset('riddle.chest', t('riddle.chestAlt')));

  let busy = false;
  let lastStep = v0.riddle?.stepIndex ?? 0;
  const panel = createTaskPanel(ref.task, {
    t,
    onAnswer: (k) => {
      if (busy) return;
      busy = true;
      const events = onAnswer(k);
      busy = false;
      if (events.some((e) => e.type === 'riddleSolved')) return; // main.js zeigt die Beute
      draw(events.find((e) => e.type === 'riddleMistake') ?? null);
    },
    onNext: () => onLeave(),
  });
  panel.timerRoot.hidden = true; // ohne Zeitleiste

  // Aufgabe aus der Sicht des Spiels in die Form des Aufgabenfelds bringen
  function asTask(r) {
    const wall = r.format === 'wall';
    return {
      format: r.format, stepFormat: r.format,
      prompt: r.step.prompt, display: r.step.display ?? (wall ? null : r.shown?.join(', ') + ', ?'),
      choices: r.step.choices, correctIndex: r.step.correctIndex,
      wall: r.wall, stepIndex: r.stepIndex,
      steps: wall ? Array.from({ length: r.steps }) : null,
      freeMistakes: r.freeMistakes, freeLeft: r.freeLeft,
      wrongChoices: r.wrongChoices, noTempo: true,
      solveAll: true, // beim Scheitern die ganze Mauer zeigen
    };
  }

  // Schloss: ein Rad je Schritt; gelöste Räder grün mit Haken, das aktuelle gelb.
  // fresh: Index des eben eingerasteten Rads (kurze Bewegung)
  function drawLock(r, fresh) {
    const failed = r.result === 'failed';
    ref.lock.replaceChildren(...Array.from({ length: r.steps }, (_, i) => {
      const w = document.createElement('i');
      w.className = 'riddle-wheel';
      if (i < r.stepIndex) { w.classList.add('is-open'); w.innerHTML = CHECK; }
      else if (i === r.stepIndex && !failed) w.classList.add('is-now');
      if (i === fresh) w.classList.add('is-fresh');
      return w;
    }));
    ref.lock.setAttribute('aria-label', t('riddle.lockLabel', { n: r.stepIndex, of: r.steps }));
  }

  function draw(mistake) {
    const r = game.view().riddle;
    if (!r) return;
    const advanced = r.stepIndex > lastStep;
    drawLock(r, advanced ? r.stepIndex - 1 : -1);
    lastStep = r.stepIndex;
    if (r.result === 'failed') {
      screen.classList.toggle('is-failed', r.format === 'wall'); // nur die Mauer braucht mehr Platz für die Lösung
      const praise = r.stepIndex > 0 ? `${t(r.stepIndex === 1 ? 'riddle.partialOne' : 'riddle.partial', { n: r.stepIndex })} ` : '';
      ref.text.textContent = `${praise}${t('riddle.failed')}`;
      panel.open(asTask(r));
      const way = r.format === 'wall' ? wayText(t, r.way) : sequenceWay(t, r);
      panel.showSolution(t('ask.solution'), r.solutionText, way);
      return;
    }
    // Bei der Mauer nennt der Kasten die freien Fehlversuche selbst; sonst hier oben, nach einem Fehler
    const free = r.format === 'wall' ? '' : ` ${t(r.freeLeft === 0 ? 'ask.freeNone' : r.freeLeft === 1 ? 'ask.freeMistake' : 'ask.freeMistakes', { n: r.freeLeft })}`;
    if (mistake) ref.text.textContent = `${hintAsk(t, mistake.mistake, 'riddle.tryAgain')}${free}`;
    else ref.text.textContent = t(advanced ? 'riddle.stepRight' : 'riddle.text');
    panel.open(asTask(r));
  }
  draw(null);

  return { destroy: () => panel.destroy() };
}
