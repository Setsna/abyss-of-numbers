// Aufgabe in der Sprechblase der Heldin: Zeitleiste, Rechnung, vier Antwortfelder (2 × 2),
// nach Fehler die richtige Rechnung und „Weiter“.
// Seit Phase 5, Etappe 3 auch Zahlenstrahl (Zeichnung + Knöpfe A bis D), Zahlenfolge und Ergänzen
// (Frage oben, `task.display` als große Zeile).
// Seit Etappe 4 mehrschrittig (Kette, Mauer, Zuordnen): Punkte zeigen den Fortschritt, nach einem
// freien Fehlversuch bleibt der falsche Knopf gesperrt und ein Satz nennt die übrigen Versuche.
import { renderNumberLine } from './number-line.js';
import { renderNumberWall } from './number-wall.js';

const BUBBLE_HTML = `
  <div class="timer" data-ref="timer" aria-hidden="true"><i></i><i></i><i></i><b data-ref="fill"></b></div>
  <p class="bubble-ask" data-ref="ask"></p>
  <div class="steps-dots" data-ref="dots" hidden></div>
  <div class="nline" data-ref="line" hidden></div>
  <p class="free-note" data-ref="note" role="status" hidden></p>
  <p class="eq" data-ref="eq"></p>
  <div class="answers" data-ref="answers"></div>
  <button class="btn btn-go" type="button" data-ref="next" hidden></button>`;

export function createTaskPanel(bubble, { t, onAnswer, onNext }) {
  bubble.innerHTML = BUBBLE_HTML;
  const ref = Object.fromEntries([...bubble.querySelectorAll('[data-ref]')].map((el) => [el.dataset.ref, el]));
  let buttons = [];
  let locked = true;
  let current = null; // offene Aufgabe

  ref.next.addEventListener('click', () => { if (!ref.next.hidden) onNext(); });

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

  const freeText = (left) => t(left === 0 ? 'ask.freeNone' : left === 1 ? 'ask.freeMistake' : 'ask.freeMistakes', { n: left });

  function renderSteps(task) {
    ref.note.hidden = !(task.steps && task.freeLeft < task.freeMistakes);
    if (!ref.note.hidden) ref.note.textContent = freeText(task.freeLeft);
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

    open(task) {
      current = task;
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
      ref.eq.hidden = equations || isLine || isWall;
      ref.line.hidden = !(isLine || isWall);
      if (isLine) ref.line.replaceChildren(renderNumberLine(task));
      else if (isWall) ref.line.replaceChildren(renderNumberWall(task, { t }));
      else ref.line.replaceChildren();
      renderSteps(task);
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

    showSolution(askText, solutionText) {
      bubble.classList.add('solution');
      ref.ask.textContent = askText;
      ref.eq.hidden = false;
      ref.eq.textContent = solutionText;
      ref.answers.hidden = true;
      ref.timer.hidden = true;
      // Zahlenstrahl und Mauer bleiben stehen, die richtige Stelle wird mit der Zahl gezeigt
      if ((current?.stepFormat ?? current?.format) === 'numberLine') ref.line.replaceChildren(renderNumberLine(current, { solution: true }));
      if (current?.format === 'wall') ref.line.replaceChildren(renderNumberWall(current, { solution: true, t }));
      ref.note.hidden = true;
      ref.next.textContent = t('btn.next');
      ref.next.hidden = false;
      fitEq();
      ref.next.focus({ preventScroll: true });
    },

    nextVisible: () => !ref.next.hidden,
    // Liefert false, wenn „Weiter“ nicht sichtbar ist: Dann bleibt die Eingabetaste beim fokussierten Knopf.
    pressNext() { if (ref.next.hidden || bubble.hidden) return false; ref.next.click(); return true; },

    close() {
      locked = true;
      bubble.hidden = true;
      ref.next.hidden = true;
    },
  };
}
