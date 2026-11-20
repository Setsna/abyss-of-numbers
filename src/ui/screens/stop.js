// Halt vor dem Spiel (Update-Sicherheit, 20.11.2026). Zwei Fälle, in denen KEIN neues Spiel beginnen darf:
//   'newer'   Der Spielstand stammt aus einer neueren Fassung des Spiels. Dieses Gerät hat noch die ältere geladen
//             (Seite seit Tagen offen oder gerade erst aktualisiert). „Neu laden“ holt die neue Fassung.
//   'corrupt' Der Spielstand im gemeinsamen Konto lässt sich nicht lesen. Die Lehrkraft entscheidet.
// In beiden Fällen bliebe sonst nur „Los!“: Ein neuer Held würde den echten Stand im Konto überschreiben.
// Aufbau wie die Anmeldung (Riff im Hintergrund, Papierkasten). Die Seite schreibt nichts.
import { renderAsset } from '../assets.js?v=6e7c9173';

export function mountStop(root, { t, kind, onReload, onLogout = null }) {
  root.innerHTML = `
  <main class="screen title-screen login-screen stop-screen">
    <div class="title-bg" data-ref="bg"></div>
    <section class="title-box">
      <h1 class="title-word"></h1>
      <div class="login-box stop-box" role="alert">
        <h2 class="stop-title"></h2>
        <p class="stop-text"></p>
        <button class="btn btn-go stop-reload" type="button"></button>
        <button class="btn stop-logout" type="button" hidden></button>
      </div>
    </section>
  </main>`;
  root.querySelector('[data-ref=bg]').append(renderAsset('area.reef', ''));
  root.querySelector('.title-word').textContent = t('title.name');
  root.querySelector('.stop-title').textContent = t(kind === 'newer' ? 'save.newerTitle' : 'save.corruptTitle');
  root.querySelector('.stop-text').textContent = t(kind === 'newer' ? 'save.newerText' : 'save.corruptText');
  const reload = root.querySelector('.stop-reload');
  reload.textContent = t('save.reload');
  let busy = false;
  reload.addEventListener('click', () => { if (busy) return; busy = true; onReload(); });
  const logout = root.querySelector('.stop-logout');
  if (onLogout) {
    logout.hidden = false;
    logout.textContent = t('login.logout');
    logout.addEventListener('click', () => { if (busy) return; busy = true; onLogout(); });
  }
  reload.focus({ preventScroll: true });
  return {};
}
