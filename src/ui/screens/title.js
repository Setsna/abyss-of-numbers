// Startbildschirm (Plan Etappe 7): Titel und ein großer Knopf, „Los!“ ohne Stand, „Weiter“ mit Stand.
// Unten unauffällig „Für Erwachsene“ (Etappe 8). Mit Konto (Etappe 10) unten links: wer angemeldet ist,
// „Abmelden“ und, wenn nötig, eine Zeile zum Netz (account: { name, onLogout, onNet(f) }).
import { renderAsset, assetUrl } from '../assets.js?v=ad3e5b3d';

export function mountTitle(root, { t, hasSave, onStart, onAdult, account = null }) {
  root.innerHTML = `
  <main class="screen title-screen">
    <div class="title-bg" data-ref="bg"></div>
    <section class="title-box">
      <h1 class="title-word"></h1>
      <button class="btn btn-go title-go" type="button"></button>
    </section>
    <div class="title-who" data-ref="who" hidden>
      <span data-ref="name"></span>
      <button class="title-logout" type="button" data-ref="logout"></button>
      <span class="title-net" data-ref="net" role="status" hidden></span>
    </div>
    <button class="title-adult" type="button"></button>
  </main>`;
  // Titelbild (18.11.2026, von Ingo): Heldin taucht in die Tiefe; Titel und Knopf oben im freien Wasser
  const hasArt = Boolean(assetUrl('place.title'));
  root.querySelector('[data-ref=bg]').append(renderAsset(hasArt ? 'place.title' : 'area.reef', ''));
  root.querySelector('.title-screen').classList.toggle('has-art', hasArt);
  root.querySelector('.title-word').textContent = t('title.name');
  const go = root.querySelector('.title-go');
  go.textContent = hasSave ? t('title.continue') : t('title.start');
  go.addEventListener('click', () => { go.disabled = true; onStart(); }, { once: true });
  go.focus({ preventScroll: true });
  const adult = root.querySelector('.title-adult');
  adult.textContent = t('adult.open');
  adult.addEventListener('click', () => onAdult(), { once: true });

  let stop = null;
  if (account) {
    const who = root.querySelector('[data-ref=who]');
    who.hidden = false;
    root.querySelector('[data-ref=name]').textContent = t('login.who', { name: account.name });
    const out = root.querySelector('[data-ref=logout]');
    out.textContent = t('login.logout');
    out.addEventListener('click', () => { out.disabled = true; go.disabled = true; account.onLogout(); }, { once: true });
    const net = root.querySelector('[data-ref=net]');
    stop = account.onNet((text) => { net.textContent = text; net.hidden = !text; });
  }
  return { destroy: () => stop?.() };
}
