// Basisstation als Ort (Phase 5, Etappe 9, D25): eine Szene wie im Kampf. Links steht der Held
// mit Name, Stufe und Perlen; im Bild drei Stellen zum Antippen:
//   Bullaugen – je offenem Gebiet ein Fenster mit dem Gebietsbild und einem gelben Knopf (Abtauchen),
//   Logbuch   – mit dem Schild „freie Punkte“,
//   Ausrüstung – öffnet die Logbuch-Seite „Ausrüstung“.
// Mit Konto (Ingo, iPad 19.11.2026) unten links, wer angemeldet ist, und „Abmelden“ mit Rückfrage
// (account: { name, onLogout } wie auf dem Titel), damit ein anderes Kind sich anmelden kann.
// Hintergrund: das Bild der Station (place.station), bis es da ist das Bild des Heimatgebiets.
import { ICON } from '../icons.js?v=ad3e5b3d';
import { renderAsset, assetUrl } from '../assets.js?v=ad3e5b3d';
import { homeAreaId, worldLayer } from '../components/world.js?v=ad3e5b3d';

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
        <div class="station-depths" data-ref="askDepths" hidden>
          <span class="station-depths-label" data-ref="askDepthsLabel"></span>
          <div class="station-depths-btns" data-ref="askDepthsBtns"></div>
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
    <span class="chip" aria-label="${t('hud.pearls', { n: p.perlen })}">${ICON.pearl}<span>${p.perlen}</span></span>
    <span class="chip chip-stars" aria-label="${p.stars === 1 ? t('base.starsOne') : t('base.stars', { n: p.stars })}">${ICON.star}<span>${p.stars}</span></span>`;
  ref.text.textContent = t('base.text');

  let busy = false;
  const once = (fn) => () => { if (busy) return; busy = true; fn(); };

  // Nachfrage im Fenster der Station: beim Wechsel des Gebiets (der laufende Tauchgang endet, Gesammeltes bleibt)
  // und beim Abmelden. Ja führt onYes aus, Nein schließt das Fenster.
  let onYes = null;
  function ask(text, yes, no, fn) {
    onYes = fn;
    ref.askDepths.hidden = true;
    ref.askText.textContent = text;
    ref.askYes.textContent = yes;
    ref.askNo.textContent = no;
    ref.ask.hidden = false;
    ref.askNo.focus({ preventScroll: true });
  }
  const askSwitch = (areaId, name) => ask(
    t('base.switchAsk', { from: t(`areas.${v.run.areaId}.name`), to: name }),
    t('base.switchYes'), t('base.switchNo'), () => onDive(areaId, { abandon: true }));
  // Tiefe wählen (Phase 9, Konzept 7): Standard ist die höchste offene Tiefe, darunter „Leichter tauchen“
  // mit den geschafften Tiefen. Nur, wenn im Gebiet schon eine Tiefe geschafft ist.
  const askDepth = (a, name) => {
    ask(name, t('base.depthGo', { n: a.maxDepth }), t('base.depthBack'), () => onDive(a.id, { depth: a.maxDepth }));
    ref.askDepthsLabel.textContent = t('base.easier');
    ref.askDepthsBtns.replaceChildren(...Array.from({ length: a.maxDepth - 1 }, (_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn station-depth';
      b.textContent = String(i + 1);
      b.setAttribute('aria-label', t('base.depthGo', { n: i + 1 }));
      b.addEventListener('click', () => { if (busy) return; busy = true; onDive(a.id, { depth: i + 1 }); });
      return b;
    }));
    ref.askDepths.hidden = false;
  };
  const askResume = (a, name) => {
    ask(name, t('base.resume'), t('base.depthBack'), () => onDive(a.id));
    ref.askDepthsLabel.textContent = t('base.restart');
    ref.askDepthsBtns.replaceChildren(...Array.from({ length: a.maxDepth }, (_, i) => i + 1).filter((n) => n !== v.run.depth).map((n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn station-depth';
      b.textContent = String(n);
      b.setAttribute('aria-label', t('base.depthGo', { n }));
      b.addEventListener('click', () => { if (busy) return; busy = true; onDive(a.id, { depth: n, abandon: true }); });
      return b;
    }));
    ref.askDepths.hidden = false;
  };
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

  // Bullaugen: Fenster mit dem Gebietsbild, darunter der Knopf; das ganze Bullauge ist der Knopf.
  // Seit Phase 9 erscheinen auch geschlossene Gebiete, abgedunkelt mit den fehlenden Seesternen.
  const shown = p.areas.filter((a) => a.open || !a.comingSoon);
  ref.dives.dataset.n = String(shown.length);
  ref.dives.replaceChildren(...shown.map((a) => {
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
    } else if (!a.open) {
      // Geschlossen (Phase 9): Preis in Seesternen
      b.disabled = true;
      b.classList.add('is-locked');
      const missing = a.missing === 1 ? t('base.missingOne') : t('base.missing', { n: a.missing });
      label.innerHTML = `<span class="porthole-name"></span><span class="porthole-sub">${ICON.star}<span></span></span>`;
      label.querySelector('.porthole-name').textContent = name;
      label.querySelector('.porthole-sub > span').textContent = missing;
      b.setAttribute('aria-label', `${name}: ${missing}`);
    } else {
      // Sichtbar der Ortsname (Ingos Wunsch 18.11.2026) und darunter die Tiefe (Phase 9); vorgelesen „Abtauchen: …“
      const here = v.run?.areaId === a.id;
      label.innerHTML = '<span class="porthole-name"></span><span class="porthole-sub"></span>';
      label.querySelector('.porthole-name').textContent = here ? t('base.resume') : name;
      label.querySelector('.porthole-sub').textContent = t('base.depth', { n: here ? v.run.depth : a.maxDepth });
      if (!here) b.setAttribute('aria-label', `${t('base.diveTo', { area: name })}, ${t('base.depth', { n: a.maxDepth })}`);
      // Läuft ein Tauchgang in einem anderen Gebiet, fragt die Station erst nach (Ingos Probespiel 18.11.2026)
      if (v.run && !here) b.addEventListener('click', () => { if (!busy) askSwitch(a.id, name); });
      else if (!here && a.depth >= 1) b.addEventListener('click', () => { if (!busy) askDepth(a, name); });
      // laufender Tauchgang (Abschlussreview Phase 9): weiter tauchen oder neu in einer anderen Tiefe beginnen
      else if (here && a.depth >= 1) b.addEventListener('click', () => { if (!busy) askResume(a, name); });
      else b.addEventListener('click', once(() => onDive(a.id)));
    }
    b.append(win, label);
    return b;
  }));

  ref.logbook.innerHTML = `<span class="spot-icon">${ICON.book}</span><span class="spot-label"></span>`;
  ref.logbook.querySelector('.spot-label').textContent = t('base.logbook');
  if (p.freePoints > 0 || p.talentOpen) {
    const badge = document.createElement('span');
    badge.className = 'badge spot-badge';
    // Neues Talent (Phase 9) geht vor; freie Punkte sieht das Kind dann auf der Heldenseite
    badge.textContent = p.talentOpen ? t('base.talentNew') : p.freePoints === 1 ? t('base.freeOne') : t('base.freeMany', { n: p.freePoints });
    ref.logbook.append(badge);
  }
  ref.logbook.addEventListener('click', once(() => onLogbook(p.talentOpen ? 'talents' : 'hero')));

  ref.gear.innerHTML = `<span class="spot-icon">${ICON.helmet}</span><span class="spot-label"></span>`;
  ref.gear.querySelector('.spot-label').textContent = t('base.gear');
  ref.gear.addEventListener('click', once(() => onLogbook('gear')));

  root.querySelector('.porthole:not(:disabled)')?.focus({ preventScroll: true });
}
