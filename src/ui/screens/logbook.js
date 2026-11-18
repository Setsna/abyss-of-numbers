// Logbuch (Plan Etappe 7, Konzept 11): vier Seiten.
//   Held: Werte, Punkte verteilen, „Neu verteilen“
//   Deck: alle Karten mit Anzahl
//   Regeln: sechs kurze Sätze mit Bild
//   Übungsliste: Aufgaben mit Lösung, ohne Zähler (A7)
import { wayText } from '../text.js?v=5b590f55';
import { ICON } from '../icons.js?v=5b590f55';
import { renderAsset } from '../assets.js?v=5b590f55';
import { renderCard } from '../components/card.js?v=5b590f55';
import { addWorld, homeAreaId, worldLayer } from '../components/world.js?v=5b590f55';

const PAGES = ['hero', 'deck', 'gear', 'rules', 'practice'];
const SLOTS = ['kopf', 'koerper', 'hand'];
const STATS = ['kraft', 'ruhe', 'leben'];
const STAT_ICON = { kraft: ICON.attack, ruhe: ICON.bolt, leben: ICON.heart };
const RULE_ICON = [ICON.attack, ICON.deck, ICON.check, ICON.bolt, ICON.heart, ICON.next];

export function mountLogbook(root, { t, config, game, onCommand, onClose, onEditHero = () => {} }) {
  root.innerHTML = `
  <main class="screen logbook-screen">
    <section class="panel logbook">
      <header class="logbook-head">
        <h1 class="logbook-title" data-ref="title"></h1>
        <nav class="logbook-tabs" data-ref="tabs"></nav>
        <button class="btn btn-quiet logbook-close" type="button" data-ref="close"></button>
      </header>
      <div class="logbook-page" data-ref="page"></div>
    </section>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll('[data-ref]')].map((el) => [el.dataset.ref, el]));
  // Spielwelt dahinter wie bei Beute und Händler (Ingos Wunsch 18.11.2026: das Logbuch gehört in die Unterwasserwelt)
  const v0 = game.view();
  const homeArea = homeAreaId(config, v0.profile, v0.run);
  addWorld(root.querySelector('.screen'), `area.${homeArea}`);
  ref.title.textContent = t('logbook.title');
  ref.close.textContent = t('logbook.close');
  ref.close.addEventListener('click', () => onClose(), { once: true });

  ref.tabs.replaceChildren(...PAGES.map((page) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-quiet logbook-tab';
    b.dataset.page = page;
    b.textContent = t(`logbook.tab.${page}`);
    b.addEventListener('click', () => { onCommand({ type: 'openLogbook', page }); render(); });
    return b;
  }));

  function heroPage(p) {
    const wrap = document.createElement('div');
    wrap.className = 'lb-hero';
    const thresholds = config.levels.xpThresholds;
    const next = thresholds[p.stufe];
    wrap.innerHTML = `
      <div class="lb-hero-art"></div>
      <div class="lb-hero-info lb-sheet">
        <p class="lb-name"></p>
        <p class="lb-line"></p>
        <p class="lb-line lb-quiet"></p>
        <ul class="lb-stats"></ul>
        <div class="lb-points">
          <span class="lb-free"></span>
          <button class="btn btn-quiet lb-reset" type="button"></button>
        </div>
      </div>
      <button class="btn btn-quiet lb-change" type="button"></button>`;
    // Held steht im Bild seines Gebiets, wie ein Comicpanel
    wrap.querySelector('.lb-hero-art').append(worldLayer(`area.${homeArea}`, 'lb-hero-scene'), renderAsset(p.asset, p.name));
    wrap.querySelector('.lb-name').textContent = p.name;
    const [line1, line2] = wrap.querySelectorAll('.lb-line');
    line1.textContent = `${t('logbook.level', { n: p.stufe })} · ${t('logbook.xp', { n: p.ep })} · ${t('logbook.hp', { n: p.maxHp })}`;
    line2.textContent = next !== undefined ? t('logbook.nextLevel', { n: next - p.ep, stufe: p.stufe + 1 }) : t('logbook.maxLevel');
    wrap.querySelector('.lb-stats').replaceChildren(...STATS.map((stat) => {
      const li = document.createElement('li');
      li.className = 'lb-stat';
      li.dataset.stat = stat;
      li.innerHTML = `<span class="lb-stat-icon">${STAT_ICON[stat]}</span><span class="lb-stat-text"><b></b><small></small></span><span class="lb-stat-value"></span><button class="btn lb-plus" type="button">+</button>`;
      li.querySelector('b').textContent = t(`logbook.stat.${stat}`);
      li.querySelector('small').textContent = t(`logbook.statHelp.${stat}`);
      li.querySelector('.lb-stat-value').textContent = String(p.punkte[stat]);
      const plus = li.querySelector('.lb-plus');
      plus.setAttribute('aria-label', t('logbook.add', { stat: t(`logbook.stat.${stat}`) }));
      plus.disabled = p.freePoints === 0;
      plus.addEventListener('click', () => { onCommand({ type: 'spendPoint', stat }); render(); });
      return li;
    }));
    const free = wrap.querySelector('.lb-free');
    free.textContent = p.freePoints === 0 ? t('logbook.freeNone') : p.freePoints === 1 ? t('logbook.freeOne') : t('logbook.freeMany', { n: p.freePoints });
    if (p.freePoints > 0) free.classList.add('is-on');
    const reset = wrap.querySelector('.lb-reset');
    reset.textContent = t('logbook.reset');
    reset.disabled = STATS.every((s) => p.punkte[s] === 0);
    reset.addEventListener('click', () => { onCommand({ type: 'resetPoints' }); render(); });
    // Held ändern (18.11.2026): Figur und Name, öffnet die Heldenwahl
    const change = wrap.querySelector('.lb-change');
    change.textContent = t('logbook.changeHero');
    change.addEventListener('click', () => onEditHero());
    return wrap;
  }

  // Ausrüstung (Phase 5, Etappe 7): drei Plätze, darunter je Platz die Gegenstände im Besitz
  function gearPage(p) {
    const wrap = document.createElement('div');
    wrap.className = 'lb-gear';
    const head = document.createElement('p');
    head.className = 'lb-quiet';
    head.textContent = p.gear.besitz.length ? t('gear.hint') : t('gear.none');
    wrap.append(head);
    for (const slot of SLOTS) {
      const row = document.createElement('section');
      row.className = 'lb-slot';
      const title = document.createElement('h3');
      title.className = 'lb-slot-title';
      title.textContent = t(`slots.${slot}`);
      row.append(title);
      const owned = p.gear.besitz.filter((id) => config.items[id].slot === slot);
      if (!owned.length) {
        const empty = document.createElement('p');
        empty.className = 'lb-quiet';
        empty.textContent = t('gear.empty');
        row.append(empty);
      }
      for (const id of owned) {
        const worn = p.gear.angelegt[slot] === id;
        const item = document.createElement('div');
        item.className = 'lb-item' + (worn ? ' is-worn' : '');
        item.innerHTML = '<span class="item-pic"></span><span class="lb-item-text"><b></b><small></small></span><button class="btn btn-quiet lb-item-btn" type="button"></button>';
        item.querySelector('.item-pic').append(renderAsset(`item.${id}`, '')); // Bild des Gegenstands (18.11.2026)
        item.querySelector('b').textContent = t(`items.${id}.name`) + (worn ? ` · ${t('gear.worn')}` : '');
        item.querySelector('small').textContent = t(`items.${id}.eff`);
        const b = item.querySelector('button');
        b.textContent = worn ? t('gear.unequip') : t('gear.equip');
        b.addEventListener('click', () => {
          onCommand(worn ? { type: 'unequipItem', slot } : { type: 'equipItem', itemId: id });
          render();
        });
        row.append(item);
      }
      wrap.append(row);
    }
    return wrap;
  }

  function deckPage(p) {
    const wrap = document.createElement('div');
    wrap.className = 'lb-deck';
    const total = p.deck.reduce((sum, d) => sum + d.n, 0);
    const head = document.createElement('p');
    head.className = 'lb-quiet';
    head.textContent = t('logbook.deckTotal', { n: total });
    const grid = document.createElement('div');
    grid.className = 'lb-deck-grid';
    grid.replaceChildren(...p.deck.map(({ cardId, n, level, toNext }, i) => {
      const cell = document.createElement('div');
      cell.className = 'lb-deck-cell';
      const card = renderCard({ uid: `d${i}`, cardId, level }, config.cards[cardId], { t, why: null });
      card.disabled = true;
      card.tabIndex = -1;
      const count = document.createElement('span');
      count.className = 'lb-count';
      count.textContent = t('logbook.deckCount', { n });
      cell.append(card, count);
      // Fortschritt zur nächsten Kartenstufe als positive Zahl (Etappe 8); Strudel hat keine Stufen
      if (toNext !== null || level > 1) {
        const next = document.createElement('p');
        next.className = 'lb-next';
        next.textContent = toNext !== null ? t('logbook.deckNext', { n: toNext }) : t('logbook.deckMax');
        cell.append(next);
      }
      return cell;
    }));
    wrap.append(head, grid);
    return wrap;
  }

  function rulesPage() {
    const ol = document.createElement('ol');
    ol.className = 'lb-rules';
    ol.replaceChildren(...RULE_ICON.map((icon, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="lb-rule-num">${i + 1}</span><span class="lb-rule-icon">${icon}</span><span></span>`;
      li.lastChild.textContent = t(`logbook.rules.${i}`, { n: config.game.penalty.wrong });
      return li;
    }));
    return ol;
  }

  function practicePage(p) {
    const wrap = document.createElement('div');
    wrap.className = 'lb-practice';
    const head = document.createElement('p');
    head.className = 'lb-quiet';
    head.textContent = p.practice.length ? t('logbook.practiceText') : t('logbook.practiceEmpty');
    const ul = document.createElement('ul');
    ul.replaceChildren(...p.practice.map((text, i) => {
      const li = document.createElement('li');
      li.textContent = text;
      const way = wayText(t, (p.practiceWays ?? [])[i]); // Rechenweg darunter (Phase 6b, Regelwerk 8.3)
      if (way) {
        const small = document.createElement('span');
        small.className = 'practice-way';
        small.textContent = way;
        li.append(small);
      }
      return li;
    }));
    wrap.append(head, ul);
    return wrap;
  }

  function render() {
    const v = game.view();
    const page = v.logbook?.page ?? 'hero';
    for (const b of ref.tabs.children) b.setAttribute('aria-pressed', String(b.dataset.page === page));
    const p = v.profile;
    const content = page === 'hero' ? heroPage(p) : page === 'deck' ? deckPage(p) : page === 'gear' ? gearPage(p) : page === 'rules' ? rulesPage() : practicePage(p);
    ref.page.replaceChildren(content);
  }
  render();
}
