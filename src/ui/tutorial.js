// Erklärung im ersten Kampf (Plan Etappe 8, Konzept 11). Vier Schritte; weiter geht es
// durch die richtige Handlung selbst, nicht durch einen „Weiter“-Knopf:
//   1 Gegner antippen → 2 Karte antippen → 3 rechnen (erste Aufgabe ohne Zeit) → 4 Zug beenden
// Der Satz steht in der Ansage oben links, das passende Feld wird hervorgehoben.
// Die Aufgabe selbst wird nie verdeckt: Schritt 3 hebt nichts im Aufgabenfeld hervor.

const STEP_TARGET = { 1: '#foes', 2: '#hand', 3: null, 4: '#endBtn' };

export function createTutorial({ active }) {
  let step = active ? 1 : 0;
  return {
    get active() { return step > 0; },
    get step() { return step; },
    text(t, { noPlayable = false } = {}) {
      if (step === 0) return null;
      if (step === 4 && noPlayable) return t('tutorial.step4end');
      return t(`tutorial.step${step}`);
    },
    // what: 'target' | 'task' | 'answered' | 'turnEnded' | 'combatOver'
    // Liefert true, wenn die Erklärung damit fertig ist.
    advance(what) {
      if (step === 0) return false;
      if (what === 'combatOver') { step = 0; return true; }
      if (step === 1 && what === 'target') step = 2;
      else if (step <= 2 && what === 'task') step = 3; // Karte ohne Ziel (Schildblase) überspringt Schritt 1
      else if (step === 3 && what === 'answered') step = 4;
      else if (step === 4 && what === 'turnEnded') { step = 0; return true; }
      return false;
    },
    // Hervorhebung setzen (Klasse is-tutorial-focus) und alte entfernen.
    // quiet: solange eine Aufgabe offen ist, wird nichts hervorgehoben
    highlight(root, { quiet = false } = {}) {
      root.querySelectorAll('.is-tutorial-focus').forEach((el) => el.classList.remove('is-tutorial-focus'));
      root.querySelector('#caption')?.classList.toggle('is-quiet', quiet);
      if (quiet) return;
      const sel = STEP_TARGET[step];
      if (sel) root.querySelector(sel)?.classList.add('is-tutorial-focus');
    },
  };
}
