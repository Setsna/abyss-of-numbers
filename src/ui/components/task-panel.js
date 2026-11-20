// Aufgabe in der Sprechblase der Heldin: Zeitleiste, Rechnung, vier Antwortfelder (2 × 2),
// nach Fehler die richtige Rechnung und „Weiter“.
// Seit Phase 5, Etappe 3 auch Zahlenstrahl (Zeichnung + Knöpfe A bis D), Zahlenfolge und Ergänzen
// (Frage oben, `task.display` als große Zeile).
// Seit Etappe 4 mehrschrittig (Kette, Mauer, Zuordnen): Punkte zeigen den Fortschritt, nach einem
// freien Fehlversuch bleibt der falsche Knopf gesperrt und ein Satz nennt die übrigen Versuche.
import { renderNumberLine } from './number-line.js?v=36a3ca2d';
import { renderNumberWall } from './number-wall.js?v=36a3ca2d';

const BUBBLE_HTML = `
  <div class="timer" data-ref="timer" aria-hidden="true"><i></i><i></i><i></i><b data-ref="fill"></b></div>
  <p class="bubble-ask" data-ref="ask"></p>
  <div class="steps-dots" data-ref="dots" hidden></div>
  <div class="nline" data-ref="line" hidden></div>
  <p class="free-note" data-ref="note" role="status" hidden></p>
  <p class="yours" data-ref="yours" hidden></p>
  <p class="eq" data-ref="eq"></p>
  <p class="way" data-ref="way" hidden></p>
  <div class="answers" data-ref="answers"></div>
  <button class="btn btn-go" type="button" data-ref="next" hidden></button>`;

export function createTaskPanel(bubble, { t, onAnswer, onNext }) {
  bubble.innerHTML = BUBBLE_HTML;
  const ref = Object.fromEntries([...bubble.querySelectorAll('[data-ref]')].map((el) => [el.dataset.ref, el]));
  let buttons = [];
  let locked = true;
  let current = null; // offene Aufgabe

  // „Weiter“ erscheint dort, wo eben die Antworten waren: erst nach NEXT_GUARD_MS annehmen, sonst
  // überspringt ein Doppeltipp die Erklärung (Phase 7a, erneute Impeccable-Kritik)
  const NEXT_GUARD_MS = 700;
  let solutionAt = 0;
  const nextReady = () => !ref.next.hidden && performance.now() - solutionAt >= NEXT_GUARD_MS;
  ref.next.addEventListener('click', () => { if (nextReady()) onNext(); });

  // Rechnung so groß wie möglich, höchstens 64u, mindestens 44u (aus dem Prototyp).
  // Passt auch 44u nicht (lange Lösungssätze wie „14 liegt zwischen 10 und 20.“), darf die Zeile
  // umbrechen (Klasse is-long, 34u).
  function fitEq() {
    ref.eq.classList.remove('is-long');
    for (let size = 64; size >= 44; size -= 2) {
      ref.eq.style.fontSize = `calc(${size} * var(--u))`;
      if (ref.eq.scrollWidth <= ref.eq.clientWidth) return;
    }
    ref.eq.classList.add('is-long');
    ref.eq.style.fontSize = 'calc(34 * var(--u))';
  }

  // Antworten einpassen (Durchsicht 6b: Klasse 4, „957 686 − 900 000 = 57 686“ hochkant in zwei Spalten).
  // Erst die Schrift bis auf 60 % verkleinern; reicht das nicht, stehen die Antworten untereinander
  // (is-stacked) und werden dort noch einmal eingepasst.
  function fitAnswers() {
    if (ref.answers.hidden || buttons.length === 0) return;
    const over = () => buttons.some((b) => b.scrollWidth > b.clientWidth);
    const shrink = () => {
      buttons.forEach((b) => { b.style.fontSize = ''; });
      if (!over()) return true;
      const base = parseFloat(getComputedStyle(buttons[0]).fontSize);
      for (let f = base * 0.95; f >= base * 0.6; f -= base * 0.05) {
        buttons.forEach((b) => { b.style.fontSize = `${f}px`; });
        if (!over()) return true;
      }
      return false;
    };
    ref.answers.classList.remove('is-stacked');
    if (shrink()) return;
    ref.answers.classList.add('is-stacked');
    shrink();
  }

  // Beim Drehen des iPads Rechnung und Antworten neu einpassen (lange Zahlen in Klasse 4).
  // scrollWidth erzwingt das Layout mit der neuen Breite, deshalb reicht das resize-Ereignis.
  const refit = () => {
    if (bubble.hidden) return;
    if (!ref.eq.hidden) fitEq();
    fitAnswers();
  };
  window.addEventListener('resize', refit);

  const freeText = (left) => t(left === 0 ? 'ask.freeNone' : left === 1 ? 'ask.freeMistake' : 'ask.freeMistakes', { n: left });

  // progress (Rettungsaufgabe, Phase 10): Liste aus 'right' | 'wrong' | 'now' | 'open', eine Luftblase je Aufgabe
  // (Durchsicht Etappe 6): richtig = gefüllt mit Haken, falsch = zerplatzt (gestrichelt), jetzt = gelber Rand.
  const AIR = { right: 'is-done', wrong: 'is-popped', now: 'is-now', open: '' };
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12.5l3.6 3.6L17.5 8.5" fill="none" stroke="#14161f" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let progressLabel = '';
  function renderAir(progress) {
    ref.dots.hidden = false;
    ref.dots.classList.add('is-air');
    ref.dots.replaceChildren(...progress.map((state) => {
      const d = document.createElement('i');
      if (AIR[state]) d.className = AIR[state];
      if (state === 'right') d.innerHTML = CHECK;
      return d;
    }));
    // „Noch 2 richtig!“ in derselben Zeile wie die Blasen, damit das Aufgabenfeld nicht höher wird
    if (progressLabel) {
      const note = document.createElement('span');
      note.className = 'air-note';
      note.setAttribute('aria-hidden', 'true');
      note.textContent = progressLabel;
      ref.dots.append(note);
    }
    ref.dots.setAttribute('role', 'img');
    ref.dots.setAttribute('aria-label', progressLabel);
  }
  function renderSteps(task, progress = null) {
    ref.note.hidden = !(task.steps && task.freeLeft < task.freeMistakes);
    if (!ref.note.hidden) ref.note.textContent = freeText(task.freeLeft);
    ref.dots.classList.remove('is-air');
    ref.dots.removeAttribute('role');
    if (progress) { renderAir(progress); return; }
    if (!task.steps) { ref.dots.hidden = true; return; }
    ref.dots.hidden = false;
    ref.dots.replaceChildren(...task.steps.map((_, i) => {
      const d = document.createElement('i');
      if (i < task.stepIndex) d.className = 'is-done';
      else if (i === task.stepIndex) d.className = 'is-now';
      return d;
    }));
    ref.dots.setAttribute('aria-label', t('task.stepOf', { n: task.stepIndex + 1, of: task.steps.length }));
  }

  return {
    timerRoot: ref.timer,
    timerFill: ref.fill,

    open(task, { progress = null, label = '', note = null } = {}) {
      current = task;
      progressLabel = label;
      ref.way.hidden = true;
      ref.yours.hidden = true;
      const fmt = task.stepFormat ?? task.format; // zusammengesetzte Aufgaben: Format des aktuellen Schritts
      const equations = fmt === 'pickTrue' || fmt === 'pickFalse' || fmt === 'compareTerms';
      const isLine = fmt === 'numberLine';
      const isWall = fmt === 'wall';
      ref.timer.classList.toggle('no-tempo', Boolean(task.noTempo));
      bubble.classList.toggle('is-wide', equations || isLine);
      bubble.classList.toggle('is-line', isLine || isWall); // breite Blase, Antworten in einer Reihe
      bubble.classList.remove('solution');
      if (fmt === 'solve' && !task.steps) {
        ref.ask.textContent = '';
        ref.eq.textContent = `${task.prompt} = ?`;
      } else {
        ref.ask.textContent = t(task.prompt, task.promptParams ?? {});
        ref.eq.textContent = task.display ?? '';
      }
      ref.eq.hidden = equations || isLine || isWall || fmt === 'divisibility'; // Teilbarkeit: nur die Frage, keine Rechnung
      ref.line.hidden = !(isLine || isWall);
      if (isLine) ref.line.replaceChildren(renderNumberLine(task));
      else if (isWall) ref.line.replaceChildren(renderNumberWall(task, { t }));
      else ref.line.replaceChildren();
      renderSteps(task, progress);
      if (note) { ref.note.textContent = note; ref.note.hidden = false; } // Rettung: „Noch 2 richtig, …“
      ref.answers.hidden = false;
      ref.answers.classList.toggle('is-equations', equations);
      ref.answers.classList.toggle('is-terms', fmt === 'compareTerms'); // kurze Rechnungen: 2 × 2
      buttons = task.choices.map((label, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'answer';
        b.innerHTML = `<span></span><span class="key">${k + 1}</span>`;
        b.firstChild.textContent = label;
        b.addEventListener('click', () => {
          if (locked) return;
          locked = true; // Doppeltipp: nur der erste zählt
          buttons.forEach((x) => { x.disabled = true; });
          onAnswer(k);
        });
        return b;
      });
      ref.answers.replaceChildren(...buttons);
      // nach freiem Fehlversuch: falsche Antwort bleibt gesperrt
      for (const k of task.wrongChoices ?? []) { buttons[k].disabled = true; buttons[k].classList.add('is-wrong'); }
      for (const k of task.usedChoices ?? []) { buttons[k].disabled = true; buttons[k].classList.add('is-used'); }
      ref.next.hidden = true;
      bubble.hidden = false;
      locked = false;
      if (!ref.eq.hidden) fitEq();
      fitAnswers();
    },

    // Stand der Schritte: Punkte und Satz zu den freien Fehlversuchen

    lock() {
      locked = true;
      buttons.forEach((x) => { x.disabled = true; });
    },

    choose(k) {
      if (locked || !buttons[k]) return false;
      buttons[k].click();
      return true;
    },

    markRight(k) { buttons[k]?.classList.add('is-right'); },
    markWrong(k) { buttons[k]?.classList.add('is-wrong'); },

    // wayText: Rechenweg unter der Rechnung (Phase 6b, Regelwerk 8.1) oder null.
    // chosenText: die getippte Antwort, klein und durchgestrichen unter der Lösung (Phase 7a, D47), oder null
    showSolution(askText, solutionText, wayText = null, chosenText = null) {
      bubble.classList.add('solution');
      ref.ask.textContent = askText;
      ref.eq.hidden = false;
      ref.eq.textContent = solutionText;
      ref.way.textContent = wayText ?? '';
      ref.way.hidden = !wayText;
      if (chosenText) {
        const struck = document.createElement('s');
        struck.textContent = chosenText;
        ref.yours.replaceChildren(`${t('ask.yours')} `, struck);
      }
      ref.yours.hidden = !chosenText;
      ref.answers.hidden = true;
      ref.timer.hidden = true;
      // Zahlenstrahl und Mauer bleiben stehen, die richtige Stelle wird mit der Zahl gezeigt
      if ((current?.stepFormat ?? current?.format) === 'numberLine') ref.line.replaceChildren(renderNumberLine(current, { solution: true }));
      if (current?.format === 'wall') ref.line.replaceChildren(renderNumberWall(current, { solution: true, all: Boolean(current.solveAll), t }));
      ref.note.hidden = true;
      ref.next.textContent = t('btn.next');
      ref.next.hidden = false;
      solutionAt = performance.now();
      fitEq();
      ref.next.focus({ preventScroll: true });
    },

    // Rettung (Durchsicht Etappe 6): Luftblasen sofort nach der Antwort umstellen, Satz unter den Blasen setzen
    setProgress(progress, label = '') { progressLabel = label; renderAir(progress); },
    setNote(text) { ref.note.textContent = text ?? ''; ref.note.hidden = !text; },

    nextVisible: () => !ref.next.hidden,
    // Liefert false, wenn „Weiter“ nicht sichtbar ist: Dann bleibt die Eingabetaste beim fokussierten Knopf.
    pressNext() { if (ref.next.hidden || bubble.hidden) return false; if (nextReady()) ref.next.click(); return true; },

    close() {
      locked = true;
      bubble.hidden = true;
      ref.next.hidden = true;
    },

    destroy() { window.removeEventListener('resize', refit); },
  };
}
