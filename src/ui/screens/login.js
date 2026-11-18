// Anmeldung mit dem Code der Klasse (Etappe 10, D37): derselbe Code wie im Perlentaucher.
// Aufbau wie der Titel (Riff im Hintergrund), darauf ein Papierkasten mit Eingabefeld.
// busy: „Einen Moment …“ statt Eingabe (z. B. während der Aufkleber-Code geprüft wird).
// Rückgabe: { fail(text), ready(text) } zum Melden eines Fehlers bzw. zum Freigeben der Eingabe.
import { renderAsset } from '../assets.js?v=511d1702';

export function mountLogin(root, { t, hint = '', busy = false, onSubmit }) {
  root.innerHTML = `
  <main class="screen title-screen login-screen">
    <div class="title-bg" data-ref="bg"></div>
    <section class="title-box">
      <h1 class="title-word"></h1>
      <form class="login-box" novalidate>
        <label class="login-label" for="login-code"></label>
        <input class="login-code" id="login-code" name="code" type="text" inputmode="text"
          autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="12"
          aria-describedby="login-hint login-info">
        <p class="login-hint" id="login-hint" aria-live="polite"></p>
        <button class="btn btn-go login-go" type="submit"></button>
        <p class="login-info" id="login-info"></p>
      </form>
    </section>
    <a class="title-adult login-privacy" href="datenschutz.html"></a>
  </main>`;
  root.querySelector('[data-ref=bg]').append(renderAsset('area.reef', ''));
  root.querySelector('.title-word').textContent = t('title.name');
  root.querySelector('.login-label').textContent = t('login.ask');
  root.querySelector('.login-info').textContent = t('login.info');
  root.querySelector('.login-privacy').textContent = t('login.privacy');
  const form = root.querySelector('.login-box');
  const input = root.querySelector('.login-code');
  const hintEl = root.querySelector('.login-hint');
  const go = root.querySelector('.login-go');
  go.textContent = t('login.go');

  function ready(text = '') {
    hintEl.textContent = text;
    go.disabled = false;
    input.disabled = false;
    input.focus({ preventScroll: true });
  }
  function wait() {
    hintEl.textContent = t('login.wait');
    go.disabled = true;
    input.disabled = true;
  }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (go.disabled) return;
    wait();
    onSubmit(input.value);
  });

  if (busy) wait(); else ready(hint);
  return { fail: (text) => ready(text), ready };
}
