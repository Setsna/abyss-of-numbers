// Basisstation als Ort (Phase 5, Etappe 9, D25): eine Szene wie im Kampf. Links steht der Held
// mit Name, Stufe und Perlen; im Bild drei Stellen zum Antippen:
//   Bullaugen – je offenem Gebiet ein Fenster mit dem Gebietsbild und einem gelben Knopf (Abtauchen),
//   Logbuch   – mit dem Schild „freie Punkte“,
//   Ausrüstung – öffnet die Logbuch-Seite „Ausrüstung“,
//   Ausbauen  – Liste der Stücke für Perlen (Phase 9, Etappe 8); gekaufte Stücke stehen im Stationsbild.
// Mit Konto (Ingo, iPad 19.11.2026) unten links, wer angemeldet ist, und „Abmelden“ mit Rückfrage
// (account: { name, onLogout } wie auf dem Titel), damit ein anderes Kind sich anmelden kann.
// Hintergrund: das Bild der Station (place.station), bis es da ist das Bild des Heimatgebiets.
import { ICON } from '../icons.js?v=6737eab0';
import { renderAsset, assetUrl } from '../assets.js?v=6737eab0';
import { homeAreaId, worldLayer } from '../components/world.js?v=6737eab0';
import { renderCard } from '../components/card.js?v=6737eab0';
import { isCalm } from '../app.js?v=6737eab0';

export function mountBase(root, { t, config, game, onDive, onLogbook, onAckNewCards = null, onAckMission = null, onBuy = null, bought = null, account = null, onAdult = null }) {
  const v = game.view();
  const p = v.profile;
  root.innerHTML = `
  <main class="screen base station">
    <section class="panel station-scene" aria-label="${t('base.title')}">
      <div class="station-decor" data-ref="decor" aria-hidden="true"></div>
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
        <button class="spot" type="button" data-ref="build"></button>
      </div>
      <div class="title-who station-who" data-ref="who" hidden>
        <span data-ref="whoName"></span>
        <button class="title-logout" type="button" data-ref="logout" hidden></button>
        <button class="title-logout" type="button" data-ref="adult" hidden></button>
      </div>
      <div class="station-news" data-ref="news" role="status" hidden>
        <p class="station-news-title" data-ref="newsTitle"></p>
        <div class="station-news-cards" data-ref="newsCards"></div>
        <button class="btn btn-go" type="button" data-ref="newsOk"></button>
      </div>
      <div class="station-build" data-ref="buildPanel" role="dialog" aria-modal="true" aria-labelledby="station-build-title" hidden>
        <div class="station-build-head">
          <h2 class="station-build-title" id="station-build-title" data-ref="buildTitle"></h2>
          <span class="chip station-build-pearls" data-ref="buildPearls"></span>
        </div>
        <p class="station-build-hint" data-ref="buildHint" role="status"></p>
        <ul class="station-build-list" data-ref="buildList"></ul>
        <button class="btn station-build-back" type="button" data-ref="buildBack"></button>
      </div>
      <div class="station-ask" data-ref="ask" role="dialog" aria-modal="true" hidden>
        <div class="station-ask-pic" data-ref="askPic" hidden></div>
        <p class="station-ask-text" data-ref="askText"></p>
        <p class="chip station-ask-sub" data-ref="askSub" hidden></p>
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
  // Nach dem zehnten Stück (Ingo 20.11.2026): „Deine Station ist fertig!“ statt des üblichen Satzes
  const complete = Boolean(bought) && (v.station?.items ?? []).every((x) => x.owned);
  // Schild oben links: Kauf (einmalig) → Tagesauftrag (Phase 10, Etappe 5) → der übliche Satz
  const m = v.mission;
  const missionNews = !bought && m?.geschafft && !m.gemeldet;
  if (complete) ref.text.textContent = t('station.complete');
  else if (bought) ref.text.textContent = t('station.bought', { name: t(`station.items.${bought}.name`) });
  else if (missionNews) ref.text.textContent = t('mission.done', { n: config.game.mission.reward });
  else if (m?.geschafft) ref.text.textContent = t('mission.doneLater');
  else if (m) {
    ref.text.classList.add('is-mission');
    const op = m.leiter ? t(`mission.ops.${m.leiter}`) : '';
    // Stand als Pille „2/6“ und daneben die Belohnung mit Perle (Durchsicht Etappe 6)
    const line = document.createElement('span');
    line.className = 'mission-progress';
    const pill = document.createElement('span');
    pill.className = 'mission-pill';
    pill.textContent = t('mission.short', { stand: m.stand, ziel: m.ziel });
    pill.setAttribute('aria-label', t('mission.progress', { stand: m.stand, ziel: m.ziel }));
    const reward = document.createElement('span');
    reward.className = 'mission-reward';
    reward.setAttribute('aria-label', t('mission.reward', { n: config.game.mission.reward }));
    reward.innerHTML = `<span aria-hidden="true">+${Number(config.game.mission.reward)}</span>${ICON.pearl}`;
    line.append(pill, reward);
    ref.text.replaceChildren(t(`mission.${m.art}`, { ziel: m.ziel, op }), line);
  } else ref.text.textContent = t('base.text');

  let busy = false;
  const once = (fn) => () => { if (busy) return; busy = true; fn(); };

  // Nachfrage im Fenster der Station: beim Wechsel des Gebiets (der laufende Tauchgang endet, Gesammeltes bleibt)
  // und beim Abmelden. Ja führt onYes aus, Nein schließt das Fenster.
  let onYes = null;
  let askFrom = null; // Knopf, der die Nachfrage geöffnet hat: bekommt beim Schließen den Fokus zurück
  // Offenes Fenster (Nachfrage vor der Liste vor der Station): alles andere ist gesperrt (inert),
  // damit Tab und Vorlesen im Fenster bleiben (Durchsicht Etappe 8, P3).
  function updateInert() {
    const top = !ref.ask.hidden ? ref.ask : !ref.buildPanel.hidden ? ref.buildPanel : null;
    for (const el of scene.children) el.inert = top ? el !== top : false;
  }
  function ask(text, yes, no, fn, { pic = null, sub = null, from = null } = {}) {
    onYes = fn;
    askFrom = from ?? document.activeElement;
    ref.askDepths.hidden = true;
    ref.askPic.replaceChildren(...(pic ? [pic] : []));
    ref.askPic.hidden = !pic;
    ref.askSub.hidden = !sub;
    if (sub) { ref.askSub.innerHTML = `${ICON.pearl}<span></span>`; ref.askSub.lastChild.textContent = sub; }
    ref.askText.textContent = text;
    ref.askYes.textContent = yes;
    ref.askNo.textContent = no;
    ref.ask.hidden = false;
    updateInert();
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
  ref.askNo.addEventListener('click', () => {
    ref.ask.hidden = true; onYes = null;
    updateInert();
    askFrom?.focus?.({ preventScroll: true });
  });
  ref.askYes.addEventListener('click', () => { if (busy || !onYes) return; busy = true; onYes(); });

  // „Für Erwachsene“ oben rechts neben „Abmelden“ (Ingo, Handytest 21.11.2026: nach der Anmeldung nicht zu finden)
  if (onAdult) {
    ref.who.hidden = false;
    ref.adult.hidden = false;
    ref.adult.textContent = t('adult.open');
    ref.adult.addEventListener('click', () => { if (!busy) onAdult(); });
  }
  if (account) {
    ref.who.hidden = false;
    ref.whoName.textContent = t('login.who', { name: account.name });
    ref.logout.hidden = false;
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

  // Neue Karten entdeckt (Phase 9, Etappe 5): einmal je Karte, mit Bild; „Super!“ bestätigt
  if (p.newCards?.length) {
    ref.news.hidden = false;
    ref.newsTitle.textContent = p.newCards.length === 1 ? t('collection.newOne') : t('collection.newMany', { n: p.newCards.length });
    ref.newsCards.replaceChildren(...p.newCards.map((cardId, i) => {
      const card = renderCard({ uid: `n${i}`, cardId, level: 1 }, config.cards[cardId], { t, why: null });
      card.disabled = true;
      card.tabIndex = -1;
      return card;
    }));
    ref.newsOk.textContent = t('collection.newOk');
    ref.newsOk.addEventListener('click', () => { onAckNewCards?.(); ref.news.hidden = true; }, { once: true });
  }

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

  // Station ausbauen (Phase 9, Etappe 8): gekaufte Stücke auf ihren Plätzen (hoch eigene Plätze, falls vorhanden)
  const pieces = (v.station?.items.filter((x) => x.owned) ?? []).map((it) => {
    const piece = document.createElement('div');
    piece.className = `station-piece${it.id === bought ? ' is-new' : ''}`;
    piece.dataset.id = it.id;
    piece.append(renderAsset(`station.${it.id}`, t(`station.items.${it.id}.name`)));
    ref.decor.append(piece);
    return piece;
  });
  // Plätze nach Ausrichtung; dreht das Kind das iPad auf der Station, wandern die Stücke mit (Durchsicht Etappe 8).
  // Ist die Station schon abgebaut, meldet sich der Zuhörer beim nächsten Drehen ab.
  const portraitQuery = matchMedia('(orientation: portrait)');
  const place = () => {
    for (const piece of pieces) {
      const cfg = config.station[piece.dataset.id];
      const slot = (portraitQuery.matches && cfg.slotPortrait) || cfg.slot;
      piece.style.left = `${slot.x * 100}%`;
      piece.style.top = `${slot.y * 100}%`;
      piece.style.width = `${slot.w * 100}%`;
    }
  };
  place();
  if (pieces.length) portraitQuery.addEventListener('change', place);

  // Eben gekauft (Durchsicht Etappe 8, P1): Lautwort „Gebaut!“ am Stück, die Perlen zählen herunter.
  // Der Klang kommt über das Ereignis upgradeBought (sounds.json). Weniger Bewegung: Wort nur ein- und ausblenden, Zahl sofort.
  if (bought && config.station[bought]) {
    const piece = pieces.find((x) => x.dataset.id === bought);
    if (piece) {
      const word = document.createElement('span');
      word.className = 'station-boom';
      word.setAttribute('aria-hidden', 'true');
      word.textContent = complete ? t('station.done') : t('station.built');
      if (complete) word.classList.add('is-complete');
      word.style.left = piece.style.left;
      word.style.top = piece.style.top;
      word.style.width = piece.style.width;
      scene.append(word); // über Karten und Held, unter den Fenstern
      word.addEventListener('animationend', () => word.remove());
    }
    const num = ref.hud.querySelector('.chip:nth-child(2) > span');
    const from = p.perlen + config.station[bought].price;
    if (num && !isCalm()) {
      const ms = 700;
      num.textContent = String(from);
      setTimeout(() => {
        const start = performance.now();
        const tick = (now) => {
          const k = Math.min(1, (now - start) / ms);
          num.textContent = String(Math.round(from - (from - p.perlen) * (1 - (1 - k) ** 3)));
          if (k < 1 && num.isConnected) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, 300);
    }
  }

  // Tagesauftrag geschafft (Phase 10, Etappe 5): beim nächsten Stationsbesuch einmal „Geschafft!“ mit Klang
  // (Ereignis missionSeen, sounds.json); danach bestätigt, damit es nicht wiederkommt
  if (missionNews) {
    const word = document.createElement('span');
    word.className = 'station-boom is-mission';
    word.setAttribute('aria-hidden', 'true');
    word.textContent = t('mission.doneWord');
    scene.append(word);
    word.addEventListener('animationend', () => word.remove());
    onAckMission?.();
  }

  ref.build.innerHTML = `<span class="spot-icon">${ICON.build}</span><span class="spot-label"></span>`;
  ref.build.querySelector('.spot-label').textContent = t('station.button');
  if (v.station?.items.some((x) => x.affordable)) {
    const badge = document.createElement('span');
    badge.className = 'badge spot-badge';
    badge.textContent = t('station.badge');
    ref.build.append(badge);
  }
  ref.buildTitle.textContent = t('station.title');
  ref.buildPearls.innerHTML = `${ICON.pearl}<span></span>`;
  ref.buildPearls.lastChild.textContent = t('station.have', { n: p.perlen });
  ref.buildBack.textContent = t('station.back');
  ref.buildList.replaceChildren(...(v.station?.items ?? []).map((it) => {
    const li = document.createElement('li');
    li.className = `station-item${it.owned ? ' is-owned' : ''}`;
    const name = t(`station.items.${it.id}.name`);
    const pic = document.createElement('div');
    pic.className = 'station-item-pic';
    pic.append(renderAsset(`station.${it.id}`, name));
    const title = document.createElement('p');
    title.className = 'station-item-name';
    title.textContent = name;
    li.append(pic, title);
    if (it.effect) {
      const [key, n] = Object.entries(it.effect)[0];
      const fx = document.createElement('p');
      fx.className = 'station-item-effect';
      fx.textContent = t(`station.effect.${key}`, { n });
      li.append(fx);
    }
    if (it.owned) {
      const done = document.createElement('p');
      done.className = 'station-item-owned';
      done.innerHTML = ICON.check;
      done.append(t('station.owned'));
      li.append(done);
    } else {
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = `btn station-item-buy${it.affordable ? ' btn-go' : ' is-short'}`;
      buy.innerHTML = `<span class="station-item-buy-word"></span>${ICON.pearl}<span></span>`;
      buy.firstChild.textContent = t('station.buy');
      buy.lastChild.textContent = String(it.price);
      const missing = it.price - p.perlen;
      if (it.affordable) {
        buy.setAttribute('aria-label', t('station.buyLabel', { name, price: it.price }));
        buy.addEventListener('click', () => {
          if (busy) return;
          const pic = renderAsset(`station.${it.id}`, name);
          ask(t('station.ask', { name }), t('station.yes'), t('station.no'), () => onBuy?.(it.id), {
            pic, sub: t('station.after', { n: p.perlen - it.price }), from: buy,
          });
        });
      } else {
        // Zu wenig Perlen (Durchsicht Etappe 8, P1): grau, aber antippbar – sagt, wie viele fehlen und woher Perlen kommen
        buy.setAttribute('aria-disabled', 'true');
        buy.setAttribute('aria-label', t('station.shortLabel', { name, price: it.price, n: missing }));
        // Der Hinweis legt sich als Blase über Bild und Name der Kachel (dort schaut das Kind hin);
        // vorgelesen wird er über die versteckte Statuszeile der Liste.
        const short = document.createElement('p');
        short.className = 'station-item-short';
        short.hidden = true;
        short.textContent = missing === 1 ? t('station.tileShortOne') : t('station.tileShort', { n: missing });
        li.append(short);
        buy.addEventListener('click', () => {
          if (busy) return;
          for (const other of ref.buildList.querySelectorAll('.station-item-short')) other.hidden = other !== short;
          ref.buildHint.textContent = missing === 1 ? t('station.shortOne', { name }) : t('station.short', { name, n: missing });
        });
      }
      li.append(buy);
    }
    return li;
  }));
  ref.build.addEventListener('click', () => {
    if (busy) return;
    ref.buildHint.textContent = '';
    for (const el of ref.buildList.querySelectorAll('.station-item-short')) el.hidden = true;
    ref.buildPanel.hidden = false;
    updateInert();
    ref.buildBack.focus({ preventScroll: true });
  });
  ref.buildBack.addEventListener('click', () => {
    ref.buildPanel.hidden = true;
    updateInert();
    ref.build.focus({ preventScroll: true });
  });
  // Escape schließt das oberste Fenster (erst die Nachfrage, dann die Liste); am Dokument, damit es auch wirkt,
  // wenn nach einem Tipp nichts den Fokus hat (Review Etappe 5–8)
  const onKey = (e) => {
    if (e.key !== 'Escape' || busy) return;
    if (!ref.ask.hidden) { e.preventDefault(); ref.askNo.click(); }
    else if (!ref.buildPanel.hidden) { e.preventDefault(); ref.buildBack.click(); }
  };
  document.addEventListener('keydown', onKey);

  root.querySelector('.porthole:not(:disabled)')?.focus({ preventScroll: true });

  // Kasten „Angemeldet … Abmelden · Für Erwachsene“ oben rechts: Hochkant ist das Auftragsschild so breit wie der
  // Bildschirm und lag darüber (Handytest 21.11.2026). Überlappen sie, rückt der Kasten unter das Schild.
  const placeWho = () => {
    if (ref.who.hidden) return;
    ref.who.style.top = '';
    if (!ref.text.textContent.trim()) return;
    const cap = ref.text.getBoundingClientRect();
    const who = ref.who.getBoundingClientRect();
    if (cap.right > who.left && cap.left < who.right && cap.bottom > who.top && cap.top < who.bottom) {
      const top = ref.who.offsetParent?.getBoundingClientRect().top ?? 0;
      ref.who.style.top = `${Math.ceil(cap.bottom - top + 6)}px`;
    }
  };
  placeWho();
  document.fonts?.ready.then(placeWho); // Schrift kann die Höhe des Schilds noch ändern
  window.addEventListener('resize', placeWho);

  // Beim Wechsel des Bildschirms (show() in main.js) melden sich die Zuhörer ab
  return {
    destroy() {
      document.removeEventListener('keydown', onKey);
      portraitQuery.removeEventListener('change', place);
      window.removeEventListener('resize', placeWho);
    },
  };
}
