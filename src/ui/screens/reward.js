// Beute nach einem Sieg (Plan Etappe 5, Schritt 6): Erfahrung, Perlen, ggf. neue Stufe,
// eine von drei Karten oder „Keine Karte“, darunter bis zu 5 Übungsaufgaben mit Lösung.
// Keine Quote, keine Zeit, kein Vergleich (A7).
import { wayText } from '../text.js?v=b0dbf0d6';
import { ICON } from '../icons.js?v=b0dbf0d6';
import { renderCard } from '../components/card.js?v=b0dbf0d6';
import { renderAsset } from '../assets.js?v=b0dbf0d6';
import { addWorld } from '../components/world.js?v=b0dbf0d6';

export function mountReward(root, { config, t, reward, onPick, levels = {}, areaId = null }) {
  root.innerHTML = `
  <main class="screen reward">
    <div class="reward-head"><p class="banner-word reward-word"></p></div>
    <section class="panel reward-panel">
      <div class="reward-gains">
        <span class="gain" data-ref="xp"></span>
        <span class="gain" data-ref="pearls"></span>
        <span class="gain gain-level" data-ref="level" hidden></span>
        <span class="gain gain-item" data-ref="item" hidden></span>
        <span class="gain gain-current" data-ref="current" hidden></span>
        <span class="gain gain-cards" data-ref="cardUps" hidden></span>
        <span class="gain gain-stage" data-ref="stageUps" hidden></span>
      </div>
      <p class="reward-ask"></p>
      <div class="reward-cards" data-ref="cards"></div>
      <button class="btn btn-quiet reward-skip" type="button" data-ref="skip"></button>
      <div class="reward-practice" data-ref="practice" hidden>
        <p class="reward-practice-title"></p>
        <ul data-ref="practiceList"></ul>
      </div>
    </section>
    <p class="reward-lightning" data-ref="lightning" hidden></p>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll('[data-ref]')].map((el) => [el.dataset.ref, el]));
  addWorld(root.querySelector('.screen'), `area.${areaId ?? config.areas.order[0]}`); // Spielwelt dahinter (D25)
  // Schatz (Phase 5, Etappe 2): eigenes Wort, keine Erfahrung
  root.querySelector('.reward-word').textContent = reward.treasure ? t('reward.treasureWord') : reward.riddle ? t('reward.riddleWord') : reward.event ? t('reward.eventWord') : t('result.winWord'); // Ereignis (Phase 9)
  ref.xp.textContent = t('reward.xp', { n: reward.xp });
  ref.xp.hidden = reward.xp === 0;
  ref.pearls.textContent = t('reward.pearls', { n: reward.pearls });
  if (reward.levelUps > 0) {
    ref.level.hidden = false;
    ref.level.textContent = t('reward.levelUp');
  }
  if (reward.current) { // Strömung (D33): Gegner im nächsten Kampf stärker oder schwächer
    ref.current.hidden = false;
    ref.current.textContent = t(reward.current.to > reward.current.from ? 'current.up' : 'current.down');
  }
  if (reward.item) { // Ausrüstung gefunden (Phase 5, Etappe 7)
    ref.item.hidden = false;
    ref.item.textContent = t('gear.found', { name: t(`items.${reward.item}.name`) });
    ref.item.prepend(renderAsset(`item.${reward.item}`, '')); // Bild des Gegenstands (18.11.2026)
  }
  // Lernstufen (Phase 6b, Regelwerk 7.4): neue Aufgaben warten, dazu die Perlen; keine Stufenzahl, ein Abstieg zeigt nichts
  const stageUps = reward.stageUps ?? [];
  if (stageUps.length > 0) {
    ref.stageUps.hidden = false;
    ref.stageUps.replaceChildren(...stageUps.map(({ ladder, pearls }) => {
      const line = document.createElement('span');
      line.className = 'gain-stage-up';
      line.textContent = `${t(`learning.up.${ladder}`)} ${t('learning.pearls', { n: pearls })}`;
      return line;
    }));
  }
  // Kartenstufen (Etappe 8): welche Kartenart in diesem Kampf stärker geworden ist
  const ups = reward.cardLevelUps ?? [];
  if (ups.length > 0) {
    ref.cardUps.hidden = false;
    ref.cardUps.replaceChildren(...ups.map(({ cardId }) => {
      const line = document.createElement('span');
      line.className = 'gain-card-up';
      line.innerHTML = ICON.star;
      line.append(t('reward.cardLevelUp', { name: t(`cards.${cardId}.name`).replaceAll('­', '') }));
      return line;
    }));
  }
  root.querySelector('.reward-ask').textContent = t('reward.pick');

  let picked = false;
  const pick = (cardId) => {
    if (picked) return; // Doppeltipp
    picked = true;
    root.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    onPick(cardId);
  };

  ref.cards.replaceChildren(...reward.cards.map((cardId, i) => {
    const b = renderCard({ uid: `r${i}`, cardId, level: levels[cardId] ?? 1 }, config.cards[cardId], { t, why: null });
    b.addEventListener('click', () => pick(cardId));
    return b;
  }));
  ref.skip.textContent = t('reward.none');
  ref.skip.addEventListener('click', () => pick(null));

  if (reward.practice.length > 0) {
    ref.practice.hidden = false;
    root.querySelector('.reward-practice-title').textContent = t('reward.practice');
    ref.practiceList.replaceChildren(...reward.practice.map((text, i) => {
      const li = document.createElement('li');
      li.textContent = text;
      const way = wayText(t, (reward.practiceWays ?? [])[i]); // Rechenweg darunter (Phase 6b, Regelwerk 8.3)
      if (way) {
        const small = document.createElement('span');
        small.className = 'practice-way';
        small.textContent = way;
        li.append(small);
      }
      return li;
    }));
  }
  if (reward.lightningHits > 0) {
    ref.lightning.hidden = false;
    ref.lightning.innerHTML = `${ICON.bolt}<span></span>`;
    ref.lightning.lastChild.textContent = t('reward.lightning', { n: reward.lightningHits });
  }
}
