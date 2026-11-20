// Erwachsenenbereich (Plan Etappe 8, Konzept 13): vom Startbildschirm aus, Erwachsene werden gesiezt.
// Inhalt: worum es geht, „Mehr Zeit“, Ton, Musik, „Weniger Bewegung“, Hinweis zum Speicherort,
// „Spielstand zurücksetzen“ mit Rückfrage. Seit Phase 5, Etappe 1 (D26) liegt die Sperre
// (Zahl von 10 000 bis 99 999 in Worten als Ziffern eintippen) vor dem ganzen Bereich.
// Mit Konto (Etappe 10, D37) gibt es kein Zurücksetzen auf dem Gerät (onReset = null), das macht die
// Lehrkraft im Perlentaucher; dafür ein Hinweis zum Speicherort und ein Link zur Datenschutzseite.
import { createGateChallenge, GATE_DIGITS } from '../../engine/adult-gate.js?v=805614a5';

const TOGGLES = ['ton', 'musik', 'wenigBewegung'];

export function mountAdult(root, { t, config, game, rng, onSetting, onReset, onBack }) {
  root.innerHTML = `
  <main class="screen adult-screen">
    <section class="panel adult">
      <header class="adult-head">
        <h1 class="adult-title" data-ref="title"></h1>
        <button class="btn btn-quiet" type="button" data-ref="back"></button>
      </header>
      <div class="adult-gate" data-ref="gate">
          <p class="adult-text" data-ref="gateAsk"></p>
          <p class="gate-words" data-ref="gateWords"></p>
          <p class="gate-input" data-ref="gateInput" aria-live="polite"></p>
          <p class="adult-note gate-wrong" data-ref="gateWrong" hidden></p>
          <div class="gate-keys" data-ref="keys"></div>
          <div class="gate-actions">
            <button class="btn btn-quiet" type="button" data-ref="gateCancel"></button>
            <button class="btn" type="button" data-ref="gateOk"></button>
          </div>
      </div>
      <div class="adult-body" data-ref="body" hidden>
        <p class="adult-text" data-ref="about"></p>
        <p class="adult-note" data-ref="pending" hidden></p>
        <div class="adult-row">
          <span class="adult-label" data-ref="moreTimeLabel"></span>
          <div class="adult-options" data-ref="moreTime" role="group"></div>
        </div>
        <div data-ref="toggles"></div>
        <div class="adult-row">
          <span class="adult-label" data-ref="volumeLabel"></span>
          <div class="adult-options" data-ref="volume" role="group"></div>
        </div>
        <p class="adult-note" data-ref="storage"></p>
        <p class="adult-note"><a data-ref="privacy" href="datenschutz.html"></a> · <a data-ref="imprint" href="impressum.html"></a></p>
        <div class="adult-reset" data-ref="resetBox">
          <button class="btn btn-quiet adult-reset-btn" type="button" data-ref="reset"></button>
          <p class="adult-note" data-ref="resetHelp"></p>
        </div>
        <div class="adult-confirm" data-ref="confirm" hidden>
          <p class="adult-text" data-ref="confirmAsk"></p>
          <div class="gate-actions">
            <button class="btn btn-quiet" type="button" data-ref="confirmCancel"></button>
            <button class="btn adult-danger" type="button" data-ref="confirmOk"></button>
          </div>
        </div>
      </div>
    </section>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll('[data-ref]')].map((el) => [el.dataset.ref, el]));
  ref.title.textContent = t('adult.title');
  ref.back.textContent = t('adult.back');
  ref.back.addEventListener('click', () => onBack(), { once: true });
  ref.about.textContent = t('adult.about');
  ref.moreTimeLabel.textContent = t('adult.moreTime');
  ref.volumeLabel.textContent = t('adult.volume');
  ref.storage.textContent = onReset ? t('adult.storage') : t('adult.storageAccount');
  ref.privacy.textContent = t('adult.privacy');
  ref.imprint.textContent = t('adult.imprint');
  if (!onReset) ref.resetBox.remove();
  ref.reset.textContent = t('adult.reset');
  ref.resetHelp.textContent = t('adult.resetHelp');
  ref.gateAsk.textContent = t('adult.gateAsk');
  ref.gateCancel.textContent = t('adult.cancel');
  ref.gateOk.textContent = t('adult.gateOk');
  ref.confirmAsk.textContent = t('adult.resetConfirm');
  ref.confirmCancel.textContent = t('adult.cancel');
  ref.confirmOk.textContent = t('adult.resetOk');

  function renderSettings() {
    const v = game.view();
    const s = v.settings;
    ref.pending.hidden = Boolean(v.profile);
    ref.pending.textContent = t('adult.pendingNote');
    ref.moreTime.replaceChildren(...Object.keys(config.game.moreTime).map((key) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-quiet adult-option';
      b.textContent = t(`adult.moreTimeOpt.${key}`);
      b.setAttribute('aria-pressed', String(s.mehrZeit === key));
      b.addEventListener('click', () => { onSetting('mehrZeit', key); renderSettings(); });
      return b;
    }));
    ref.toggles.replaceChildren(...TOGGLES.map((key) => {
      const row = document.createElement('div');
      row.className = 'adult-row';
      const label = document.createElement('span');
      label.className = 'adult-label';
      label.textContent = t(`adult.${key}`);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-quiet adult-toggle';
      b.setAttribute('aria-pressed', String(s[key]));
      b.textContent = s[key] ? t('adult.on') : t('adult.off');
      b.setAttribute('aria-label', `${t(`adult.${key}`)}: ${b.textContent}`);
      b.addEventListener('click', () => { onSetting(key, !s[key]); renderSettings(); });
      row.append(label, b);
      return row;
    }));
    // Lautstärke (Etappe 9): Stufen aus sounds.json, gilt für Klänge und Musik
    ref.volume.replaceChildren(...config.sounds.volumeSteps.map((value, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-quiet adult-option';
      b.textContent = t(`adult.volumeOpt.v${i}`);
      b.setAttribute('aria-pressed', String(s.lautstaerke === value));
      b.addEventListener('click', () => { onSetting('lautstaerke', value); renderSettings(); });
      return b;
    }));
    if (onReset) {
      ref.reset.disabled = !v.profile;
      ref.resetHelp.textContent = v.profile ? t('adult.resetHelp') : t('adult.noSave');
    }
  }

  // ---------- Sperre vor dem Bereich ----------
  let challenge = null;
  let typed = '';
  function newChallenge(wrong) {
    challenge = createGateChallenge(rng);
    typed = '';
    // Umbruch nur hinter „tausend“, nie mitten im Wort
    const cut = challenge.words.indexOf('tausend') + 'tausend'.length;
    ref.gateWords.replaceChildren(challenge.words.slice(0, cut), document.createElement('wbr'), challenge.words.slice(cut));
    ref.gateWrong.hidden = !wrong;
    ref.gateWrong.textContent = t('adult.gateWrong');
    renderInput();
  }
  function renderInput() {
    ref.gateInput.textContent = typed || '–';
    ref.gateOk.disabled = typed.length !== GATE_DIGITS;
  }
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0'];
  ref.keys.replaceChildren(...KEYS.map((k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-quiet gate-key';
    b.textContent = k === 'del' ? '⌫' : k;
    if (k === 'del') b.setAttribute('aria-label', t('adult.gateDelete'));
    b.addEventListener('click', () => {
      if (k === 'del') typed = typed.slice(0, -1);
      else if (typed.length < GATE_DIGITS) typed += k;
      renderInput();
    });
    return b;
  }));
  ref.gateCancel.addEventListener('click', () => onBack(), { once: true });
  ref.gateOk.addEventListener('click', () => {
    if (typed !== challenge.digits) { newChallenge(true); return; }
    ref.gate.hidden = true;
    ref.body.hidden = false;
    renderSettings();
  });

  // ---------- Zurücksetzen mit Rückfrage ----------
  ref.reset.addEventListener('click', () => {
    ref.resetBox.hidden = true;
    ref.confirm.hidden = false;
    ref.confirm.scrollIntoView({ block: 'nearest' });
  });
  ref.confirmCancel.addEventListener('click', () => { ref.confirm.hidden = true; ref.resetBox.hidden = false; });
  ref.confirmOk.addEventListener('click', () => {
    ref.confirmOk.disabled = true;
    onReset();
  });

  newChallenge(false);
}
