// Händler (Phase 5, Etappe 2; Konzept 10 und 11): drei Karten gegen Perlen, darunter
// „Eine Karte abgeben“ mit Auswahl aus dem Deck, „Weiter tauchen“. Jeder Tipp sperrt die
// Knöpfe, bis die Engine geantwortet hat (Doppeltipp, Prüfschwerpunkt 2).
import { ICON } from '../icons.js?v=6e7c9173';
import { renderAsset } from '../assets.js?v=6e7c9173';
import { renderCard } from '../components/card.js?v=6e7c9173';
import { addWorld } from '../components/world.js?v=6e7c9173';

export function mountShop(root, { t, config, game, onCommand, onLeave }) {
  root.innerHTML = `
  <main class="screen shop">
    <aside class="shop-keeper">
      <p class="shop-say" data-ref="msg" role="status"></p>
      <div class="shop-keeper-art" data-ref="keeper"></div>
    </aside>
    <section class="panel shop-panel">
      <header class="shop-head">
        <h1 class="shop-title"><span class="shop-icon">${ICON.shop}</span><span data-ref="title"></span></h1>
        <span class="chip shop-pearls" data-ref="pearls"></span>
      </header>
      <h2 class="shop-sub" data-ref="buyTitle"></h2>
      <div class="shop-offer" data-ref="offer"></div>
      <h2 class="shop-sub" data-ref="itemTitle" hidden></h2>
      <div class="shop-gear" data-ref="gear" hidden></div>
      <h2 class="shop-sub" data-ref="removeTitle"></h2>
      <div class="shop-remove" data-ref="remove"></div>
      <button class="btn btn-go shop-leave" type="button" data-ref="leave"></button>
    </section>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll('[data-ref]')].map((el) => [el.dataset.ref, el]));
  addWorld(root.querySelector('.screen'), `area.${game.view().run?.areaId ?? config.areas.order[0]}`); // Spielwelt dahinter (D25)
  ref.title.textContent = t('shop.title');
  ref.buyTitle.textContent = t('shop.buyTitle');
  ref.removeTitle.textContent = t('shop.removeTitle');
  ref.itemTitle.textContent = t('shop.itemTitle');
  ref.leave.textContent = t('shop.leave');

  let busy = false;
  let choosing = false; // Auswahl „welche Karte soll weg?“ offen

  // Der Händler (18.11.2026, Bilder von Ingo): spricht die Meldungen in seiner Sprechblase, ohne Meldung grüßt er.
  // Nach einem Kauf winkt er kurz (eigenes Bild), dann steht er wieder normal da.
  const keeper = renderAsset('place.merchant', '');
  const keeperHappy = renderAsset('place.merchant.happy', '');
  keeperHappy.hidden = true;
  ref.keeper.append(keeper, keeperHappy);
  let happyTimer = null;
  const cheer = () => {
    keeper.hidden = true; keeperHappy.hidden = false;
    clearTimeout(happyTimer);
    happyTimer = setTimeout(() => { keeper.hidden = false; keeperHappy.hidden = true; }, 1600);
  };
  const say = (text) => { ref.msg.textContent = text || t('shop.hello'); };
  say('');
  const cardName = (id) => t(`cards.${id}.name`).replaceAll('­', '');

  function send(command, onOk) {
    if (busy) return;
    busy = true;
    const events = onCommand(command);
    const no = events.find((e) => e.type === 'rejected');
    if (no) say(t(`reject.${no.reason}`, { n: config.rewards.minDeckSize }));
    else onOk(events);
    busy = false;
    render();
  }

  function offerItem(item, pearls) {
    const box = document.createElement('div');
    box.className = 'shop-item';
    const card = renderCard({ uid: `s-${item.cardId}`, cardId: item.cardId, level: game.view().cardLevels[item.cardId] ?? 1 }, config.cards[item.cardId], { t, why: null });
    card.disabled = true; // die Karte zeigt nur; gekauft wird über den Knopf darunter
    card.classList.add('is-display');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-quiet shop-buy';
    if (item.soldOut) {
      b.disabled = true;
      b.innerHTML = `${ICON.check}<span></span>`;
      b.lastChild.textContent = t('shop.soldOut');
    } else {
      b.disabled = pearls < item.price;
      b.innerHTML = `<span></span>${ICON.pearl}<span></span>`;
      b.firstChild.textContent = t('shop.buy');
      b.lastChild.textContent = String(item.price);
      b.setAttribute('aria-label', `${cardName(item.cardId)}: ${t('shop.buy')}, ${t('shop.price', { n: item.price })}`);
      if (b.disabled) b.title = t('shop.tooExpensive');
      b.addEventListener('click', () => send({ type: 'buyCard', cardId: item.cardId }, () => { cheer(); say(t('shop.bought', { name: cardName(item.cardId) })); }));
    }
    box.append(card, b);
    return box;
  }

  function removeArea(shop, profile) {
    if (shop.removed) {
      const p = document.createElement('p');
      p.className = 'shop-note';
      p.textContent = t('shop.removeDone');
      return [p];
    }
    if (!choosing) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-quiet shop-remove-open';
      b.textContent = t('shop.removeOpen', { n: shop.removePrice });
      b.disabled = profile.perlen < shop.removePrice;
      b.addEventListener('click', () => { choosing = true; say(''); render(); });
      return [b];
    }
    const ask = document.createElement('p');
    ask.className = 'shop-note';
    ask.textContent = t('shop.removeAsk');
    const list = document.createElement('div');
    list.className = 'shop-deck';
    list.append(...profile.deck.map(({ cardId, n }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-quiet shop-deck-card';
      b.innerHTML = '<span class="shop-deck-n"></span><span></span>';
      b.firstChild.textContent = t('shop.cardCount', { n });
      b.lastChild.textContent = t(`cards.${cardId}.name`); // mit weicher Trennstelle, damit lange Namen umbrechen
      b.addEventListener('click', () => send({ type: 'removeCard', cardId }, () => {
        choosing = false;
        say(t('shop.removed', { name: cardName(cardId) }));
      }));
      return b;
    }));
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-quiet';
    cancel.textContent = t('shop.removeCancel');
    cancel.addEventListener('click', () => { choosing = false; say(''); render(); });
    return [ask, list, cancel];
  }

  function render() {
    const v = game.view();
    if (!v.shop) return;
    const pearls = v.profile.perlen;
    ref.pearls.innerHTML = `${ICON.pearl}<span></span>`;
    ref.pearls.lastChild.textContent = String(pearls);
    ref.pearls.setAttribute('aria-label', t('hud.pearls', { n: pearls }));
    ref.offer.replaceChildren(...v.shop.cards.map((item) => offerItem(item, pearls)));
    // Ausrüstung im Angebot (Phase 5, Etappe 7)
    const it = v.shop.item;
    ref.itemTitle.hidden = !it;
    ref.gear.hidden = !it;
    if (it) {
      ref.gear.innerHTML = '<span class="item-pic"></span><span class="shop-gear-text"><b></b><small></small></span><button class="btn btn-quiet shop-buy" type="button"></button>';
      ref.gear.querySelector('.item-pic').append(renderAsset(`item.${it.itemId}`, ''));
      ref.gear.querySelector('b').textContent = `${t(`items.${it.itemId}.name`)} (${t(`slots.${config.items[it.itemId].slot}`)})`;
      ref.gear.querySelector('small').textContent = t(`items.${it.itemId}.eff`);
      const b = ref.gear.querySelector('button');
      if (it.soldOut) { b.disabled = true; b.innerHTML = `${ICON.check}<span></span>`; b.lastChild.textContent = t('shop.soldOut'); }
      else {
        b.innerHTML = `<span></span>${ICON.pearl}<span></span>`;
        b.firstChild.textContent = t('shop.buy');
        b.lastChild.textContent = String(it.price);
        b.disabled = pearls < it.price;
        b.addEventListener('click', () => send({ type: 'buyItem' }, () => { cheer(); say(t('gear.found', { name: t(`items.${it.itemId}.name`) })); }));
      }
    }
    ref.remove.replaceChildren(...removeArea(v.shop, v.profile));
  }

  ref.leave.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    ref.leave.disabled = true;
    onLeave();
  });

  render();
  return { destroy() {} };
}
