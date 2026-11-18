// Basisstation als Ort (Phase 5, Etappe 9, D25): eine Szene wie im Kampf. Links steht der Held
// mit Name, Stufe und Perlen; im Bild drei Stellen zum Antippen:
//   Bullaugen – je offenem Gebiet ein Fenster mit dem Gebietsbild und einem gelben Knopf (Abtauchen),
//   Logbuch   – mit dem Schild „freie Punkte“,
//   Ausrüstung – öffnet die Logbuch-Seite „Ausrüstung“.
// Hintergrund: das Bild der Station (place.station), bis es da ist das Bild des Heimatgebiets.
import { ICON } from '../icons.js?v=1ea03785';
import { renderAsset, assetUrl } from '../assets.js?v=1ea03785';
import { homeAreaId, worldLayer } from '../components/world.js?v=1ea03785';

export function mountBase(root, { t, config, game, onDive, onLogbook }) {
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
      b.addEventListener('click', once(() => onDive(a.id)));
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
