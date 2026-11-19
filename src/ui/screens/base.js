// Basisstation als Ort (Phase 5, Etappe 9, D25): eine Szene wie im Kampf. Links steht der Held
// mit Name, Stufe und Perlen; im Bild drei Stellen zum Antippen:
//   Bullaugen – je offenem Gebiet ein Fenster mit dem Gebietsbild und einem gelben Knopf (Abtauchen),
//   Logbuch   – mit dem Schild „freie Punkte“,
//   Ausrüstung – öffnet die Logbuch-Seite „Ausrüstung“.
// Mit Konto (Ingo, iPad 19.11.2026) unten links, wer angemeldet ist, und „Abmelden“ mit Rückfrage
// (account: { name, onLogout } wie auf dem Titel), damit ein anderes Kind sich anmelden kann.
// Hintergrund: das Bild der Station (place.station), bis es da ist das Bild des Heimatgebiets.
import { ICON } from '../icons.js?v=0bcb9d58';
import { renderAsset, assetUrl } from '../assets.js?v=0bcb9d58';
import { homeAreaId, worldLayer } from '../components/world.js?v=0bcb9d58';

export function mountBase(root, { t, config, game, onDive, onLogbook, account = null }) {
  const v = game.view();
  const p = v.profile;
  root.innerHTML = `
  <main class="screen base station">
    <section class="panel station-scene" aria-label="${t('base.title')}">
      <p class="caption" data-ref="text"></p>
      <div class="station-hero">
        <div class="station-art" data-ref="hero"></div>
        <p class="station-name" data-ref="name"></p>
        <div class="sea-hud" data-ref="hud"></div>
      </div>
      <div class="station-dives" data-ref="dives" role="group"></div>
      <div class="station-tools">
        <button class="spot base-logbook" type="button" data-ref="logbook"></button>
        <button class="spot" type="button" data-ref="gear"></button>
      </div>
      <div class="title-who station-who" data-ref="who" hidden>
        <span data-ref="whoName"></span>
        <button class="title-logout" type="button" data-ref="logout"></button>
      </div>
      <div class="station-ask" data-ref="ask" role="dialog" aria-modal="true" hidden>
        <p class="station-ask-text" data-ref="askText"></p>
        <div class="station-ask-btns">
          <button class="btn btn-go" type="button" data-ref="askYes"></button>
          <button class="btn" type="button" data-ref="askNo"></button>
        </div>
      </div>
    </section>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll('[data-ref]')].map((el) => [el.dataset.ref, el]));
  const scene = root.querySelector('.station-scene');
  const bgKey = assetUrl('place.station') ? 'place.station' : `area.${homeAreaId(config, p, v.run)}`;
  scene.prepend(worldLayer(bgKey, 'scene-bg'));

  ref.hero.append(renderAsset(p.asset, p.name));
  ref.name.textContent = p.name;
  ref.hud.innerHTML = `
    <span class="chip">${t('hud.level', { n: p.stufe })}</span>
    <span class="chip" aria-label="${t('hud.pearls', { n: p.perlen })}">${ICON.pearl}<span>${p.perlen}</span></span>`;
  ref.text.textContent = t('base.text');

  let busy = false;
  const once = (fn) => () => { if (busy) return; busy = true; fn(); };

  // Nachfrage im Fenster der Station: beim Wechsel des Gebiets (der laufende Tauchgang endet, Gesammeltes bleibt)
  // und beim Abmelden. Ja führt onYes aus, Nein schließt das Fenster.
  let onYes = null;
  function ask(text, yes, no, fn) {
    onYes = fn;
    ref.askText.textContent = text;
    ref.askYes.textContent = yes;
    ref.askNo.textContent = no;
    ref.ask.hidden = false;
    ref.askNo.focus({ preventScroll: true });
  }
  const askSwitch = (areaId, name) => ask(
    t('base.switchAsk', { from: t(`areas.${v.run.areaId}.name`), to: name }),
    t('base.switchYes'), t('base.switchNo'), () => onDive(areaId, { abandon: true }));
  ref.askNo.addEventListener('click', () => { ref.ask.hidden = true; onYes = null; });
  ref.askYes.addEventListener('click', () => { if (busy || !onYes) return; busy = true; onYes(); });

  if (account) {
    ref.who.hidden = false;
    ref.whoName.textContent = t('login.who', { name: account.name });
    ref.logout.textContent = t('login.logout');
    ref.logout.addEventListener('click', () => {
      if (busy) return;
      ask(t('base.logoutAsk', { name: account.name }), t('login.logout'), t('base.logoutNo'), () => {
        ref.askYes.disabled = true; ref.askNo.disabled = true;
        account.onLogout();
      });
    });
  }

  // Bullaugen: Fenster mit dem Gebietsbild, darunter der Knopf; das ganze Bullauge ist der Knopf
  const openAreas = p.areas.filter((a) => a.open);
  ref.dives.dataset.n = String(openAreas.length);
  ref.dives.replaceChildren(...openAreas.map((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'porthole base-dive';
    const name = t(`areas.${a.id}.name`);
    const win = document.createElement('span');
    win.className = 'porthole-window';
    win.append(worldLayer(`area.${a.id}`, 'porthole-view'));
    const label = document.createElement('span');
    label.className = 'porthole-label';
    if (a.comingSoon) {
      b.disabled = true;
      b.classList.add('is-soon');
      label.textContent = t('base.soon', { area: name });
    } else {
      // Sichtbar nur der Ortsname (Ingos Wunsch 18.11.2026); vorgelesen weiter „Abtauchen: …“
      label.textContent = v.run?.areaId === a.id ? t('base.resume') : name;
      if (v.run?.areaId !== a.id) b.setAttribute('aria-label', t('base.diveTo', { area: name }));
      // Läuft ein Tauchgang in einem anderen Gebiet, fragt die Station erst nach (Ingos Probespiel 18.11.2026)
      if (v.run && v.run.areaId !== a.id) b.addEventListener('click', () => { if (!busy) askSwitch(a.id, name); });
      else b.addEventListener('click', once(() => onDive(a.id)));
    }
    b.append(win, label);
    return b;
  }));

  ref.logbook.innerHTML = `<span class="spot-icon">${ICON.book}</span><span class="spot-label"></span>`;
  ref.logbook.querySelector('.spot-label').textContent = t('base.logbook');
  if (p.freePoints > 0) {
    const badge = document.createElement('span');
    badge.className = 'badge spot-badge';
    badge.textContent = p.freePoints === 1 ? t('base.freeOne') : t('base.freeMany', { n: p.freePoints });
    ref.logbook.append(badge);
  }
  ref.logbook.addEventListener('click', once(() => onLogbook('hero')));

  ref.gear.innerHTML = `<span class="spot-icon">${ICON.helmet}</span><span class="spot-label"></span>`;
  ref.gear.querySelector('.spot-label').textContent = t('base.gear');
  ref.gear.addEventListener('click', once(() => onLogbook('gear')));

  root.querySelector('.porthole:not(:disabled)')?.focus({ preventScroll: true });
}
