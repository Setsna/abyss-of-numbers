// Seekarte (Plan Etappe 6, Schritt 6): Räume als große Felder, verbunden durch Wege.
// Erledigte Räume sind abgehakt, erreichbare hervorgehoben, andere blass. Bei Kampfräumen
// zeigen kleine Bilder die Gegner, damit die Wahl des Wegs eine Entscheidung ist.
// Oben: Leben, Stufe, Perlen und „Auftauchen“. Ruheplatz: kurze Meldung „+25 Leben“.
// Seit Phase 5, Etappe 2 auch Schatz und Händler (eigene Bildschirme: Beute bzw. Laden).
import { ICON } from '../icons.js?v=1ea03785';
import { renderAsset } from '../assets.js?v=1ea03785';
import { worldLayer, bossOfArea } from '../components/world.js?v=1ea03785';

const ROOM_ICON = { combat: ICON.attack, rest: ICON.rest, boss: ICON.boss, treasure: ICON.treasure, shop: ICON.shop };
const SVG_NS = 'http://www.w3.org/2000/svg';

export function mountMap(root, { t, config, game, onEnter, onSurface, onExplain }) {
  root.innerHTML = `
  <main class="screen sea">
    <header class="sea-bar">
      <h1 class="sea-title" data-ref="title"></h1>
      <div class="sea-hud" data-ref="hud"></div>
      <button class="btn btn-quiet sea-surface" type="button" data-ref="surface"></button>
    </header>
    <section class="sea-map" data-ref="map">
      <svg class="sea-paths" data-ref="paths" aria-hidden="true"></svg>
      <div class="sea-layers" data-ref="layers"></div>
      <p class="sea-toast" data-ref="toast" role="status" hidden></p>
      <div class="sea-intro" data-ref="intro" role="dialog" aria-modal="true" hidden>
        <p class="sea-intro-text" data-ref="introText"></p>
        <button class="btn btn-go" type="button" data-ref="introOk"></button>
      </div>
    </section>
    <p class="sea-pick" data-ref="pick"></p>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll('[data-ref]')].map((el) => [el.dataset.ref, el]));
  let busy = false;

  ref.surface.textContent = t('btn.surface');
  ref.surface.addEventListener('click', () => { if (!busy) { busy = true; onSurface(); } });
  ref.pick.textContent = t('map.pick');

  function roomButton(room) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `room room-${room.type}${room.done ? ' is-done' : ''}${room.reachable ? ' is-open' : ''}`;
    b.dataset.id = room.id;
    b.disabled = !room.reachable;
    const state = room.done ? t('map.stateDone') : room.reachable ? t('map.stateOpen') : t('map.stateLater');
    const enemyNames = (room.enemies ?? []).map((id) => t(`enemies.${id}.name`));
    const uniqueNames = [...new Set(enemyNames)];
    b.setAttribute('aria-label', [t('map.roomLabel', { type: t(`map.room.${room.type}`), state }), ...uniqueNames].join(', '));

    const head = document.createElement('span');
    head.className = 'room-head';
    head.innerHTML = `<span class="room-icon">${ROOM_ICON[room.type]}</span><span class="room-name"></span>`;
    head.lastChild.textContent = room.type === 'boss' ? t(`enemies.${room.enemies.at(-1)}.name`) : t(`map.room.${room.type}`); // Boss: letzter Gegner der Begegnung
    b.append(head);

    if (room.type === 'combat' || room.type === 'boss') {
      const foes = document.createElement('span');
      foes.className = 'room-foes';
      // beim Boss nur der Körper (letzter Gegner der Begegnung)
      for (const id of room.type === 'boss' ? room.enemies.slice(-1) : room.enemies) {
        const f = document.createElement('span');
        f.className = 'room-foe';
        f.append(renderAsset(`enemy.${id}`, t(`enemies.${id}.name`)));
        foes.append(f);
      }
      b.append(foes);
    }
    if (room.done) {
      const mark = document.createElement('span');
      mark.className = 'room-check';
      mark.innerHTML = ICON.check;
      b.append(mark);
    }
    b.addEventListener('click', () => enter(room.id));
    return b;
  }

  function drawPaths(view) {
    const box = ref.map.getBoundingClientRect();
    const svg = ref.paths;
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.replaceChildren();
    const centre = (id) => {
      const el = ref.layers.querySelector(`[data-id="${id}"]`);
      const r = el.getBoundingClientRect();
      return {
        x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2,
        top: r.top - box.top, bottom: r.bottom - box.top, left: r.left - box.left, right: r.right - box.left,
      };
    };
    for (const room of view.rooms) {
      for (const next of room.next) {
        const a = centre(room.id);
        const b = centre(next);
        const line = document.createElementNS(SVG_NS, 'path');
        // Querformat: Schichten als Spalten (Weg nach rechts), Hochformat: als Reihen (Weg nach unten)
        const sideways = b.left >= a.right;
        const midX = (a.right + b.left) / 2;
        const midY = (a.bottom + b.top) / 2;
        line.setAttribute('d', sideways
          ? `M${a.right} ${a.y} C${midX} ${a.y} ${midX} ${b.y} ${b.left} ${b.y}`
          : `M${a.x} ${a.bottom} C${a.x} ${midY} ${b.x} ${midY} ${b.x} ${b.top}`);
        const walked = room.done && (view.rooms.find((r) => r.id === next)?.done || view.reachable.includes(next));
        line.setAttribute('class', walked ? 'path is-walked' : 'path');
        svg.append(line);
      }
    }
  }

  function render() {
    const v = game.view();
    const view = v.map;
    const h = v.hero;
    ref.title.textContent = t(`areas.${view.areaId}.name`);
    ref.hud.innerHTML = `
      <span class="chip" aria-label="${t('hud.hp', { n: h.hp, max: h.maxHp })}">${ICON.heart}<span>${h.hp}/${h.maxHp}</span></span>
      <span class="chip">${t('hud.level', { n: h.stufe })}</span>
      <span class="chip" aria-label="${t('hud.pearls', { n: h.perlen })}">${ICON.pearl}<span>${h.perlen}</span></span>`;
    const layers = [];
    for (const room of view.rooms) (layers[room.layer] ??= []).push(room);
    ref.layers.replaceChildren(...layers.map((rooms) => {
      const row = document.createElement('div');
      row.className = 'sea-layer';
      row.append(...rooms.map(roomButton));
      return row;
    }));
    requestAnimationFrame(() => drawPaths(view));
  }

  let toastTimer = null;

  function enter(roomId) {
    if (busy) return;
    busy = true;
    const events = game.dispatch({ type: 'enterRoom', roomId });
    const rest = events.find((e) => e.type === 'restUsed');
    if (rest) {
      onEnter(events, { stay: true });
      ref.toast.textContent = rest.healed > 0 ? t('map.restHealed', { n: rest.healed }) : t('map.restFull');
      ref.toast.hidden = false;
      render();
      busy = false; // die Meldung sperrt nichts; der nächste Raum ist sofort antippbar
      // Lesezeit, keine Bewegung: gilt auch bei „weniger Bewegung“
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { ref.toast.hidden = true; }, 1600);
      return;
    }
    onEnter(events, { stay: false });
  }

  // Hinweis zum neuen Stoff beim ersten Tauchgang in ein Gebiet (Konzept 9; Phase 5, Etappe 5)
  const v0 = game.view();
  // Klasse 4 (Phase 6b): eigener Einführungstext, wenn das Gebiet einen hat (intro4)
  const areaCfg = config?.areas.areas[v0.map.areaId];
  const introKey = (v0.profile?.klasse === 4 && areaCfg?.intro4) || areaCfg?.intro;
  if (introKey && !v0.explained[`area.${v0.map.areaId}`]) {
    ref.introText.textContent = t(introKey);
    ref.introOk.textContent = t('areas.introOk');
    ref.intro.hidden = false;
    ref.layers.inert = true;
    ref.introOk.addEventListener('click', () => {
      ref.intro.hidden = true;
      ref.layers.inert = false;
      onExplain?.(`area.${v0.map.areaId}`);
    }, { once: true });
    ref.introOk.focus({ preventScroll: true });
  }

  const onResize = () => { const v = game.view(); if (v.map) drawPaths(v.map); };
  window.addEventListener('resize', onResize);
  render();
  return { destroy() { clearTimeout(toastTimer); window.removeEventListener('resize', onResize); } };
}

// „Gebiet geschafft!“ als Comicseite (Phase 5, Etappe 9, D25): drei Panels.
//   1 groß: Gebietsbild, links der Held, rechts der besiegte Boss, darüber das Banner-Wort,
//   2 Erzählkasten: wer besiegt ist,
//   3 das neue Gebiet im Bild mit „kommt bald“ und dem gelben Knopf zur Station.
export function mountAreaCleared(root, { t, config, cleared, profile, onDone }) {
  root.innerHTML = `
  <main class="screen cleared">
    <section class="comic-page">
      <div class="panel comic-big">
        <div class="comic-hero" data-ref="hero"></div>
        <div class="comic-boss" data-ref="boss"></div>
        <p class="banner-word cleared-word" data-ref="word"></p>
      </div>
      <div class="comic-row">
        <div class="panel comic-say"><p class="cleared-text" data-ref="text"></p></div>
        <div class="panel comic-next" data-ref="nextPanel">
          <p class="cleared-next" data-ref="next" hidden></p>
          <button class="btn btn-go" type="button" data-ref="done"></button>
        </div>
      </div>
    </section>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll('[data-ref]')].map((el) => [el.dataset.ref, el]));
  const big = root.querySelector('.comic-big');
  big.prepend(worldLayer(`area.${cleared.areaId}`, 'scene-bg'));
  if (profile) ref.hero.append(renderAsset(profile.asset, profile.name));
  const boss = bossOfArea(config, cleared.areaId);
  if (boss) {
    ref.boss.append(renderAsset(`enemy.${boss}`, t(`enemies.${boss}.name`)));
    // Schwindelsterne über dem besiegten Boss (gezeichnet, Comic-Zeichen für „k. o.“)
    const dizzy = document.createElement('span');
    dizzy.className = 'comic-dizzy';
    dizzy.setAttribute('aria-hidden', 'true');
    dizzy.innerHTML = ICON.star.repeat(3);
    ref.boss.append(dizzy);
  }
  ref.word.textContent = t('cleared.word');
  ref.text.textContent = t(`areas.${cleared.areaId}.bossDefeated`);
  if (cleared.unlocked) {
    ref.nextPanel.prepend(worldLayer(`area.${cleared.unlocked}`, 'scene-bg'));
    ref.next.hidden = false;
    const soon = config.areas.areas[cleared.unlocked]?.comingSoon;
    ref.next.innerHTML = '<span></span><span class="soon-tag"></span>';
    ref.next.firstChild.textContent = t('cleared.next', { area: t(`areas.${cleared.unlocked}.name`) });
    if (soon) ref.next.lastChild.textContent = t('cleared.soon'); else ref.next.lastChild.remove();
  }
  ref.done.textContent = t('btn.toBase');
  ref.done.addEventListener('click', () => { ref.done.disabled = true; onDone(); }, { once: true });
  ref.done.focus({ preventScroll: true });
}
