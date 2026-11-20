// Ereignisraum (Phase 9, Jahresausbau Etappe 2; Konzept 8): Bild des Gebiets, zwei bis drei kurze Sätze,
// zwei große Knöpfe. Kostet eine Option Perlen und reichen sie nicht, ist der Knopf grau und sagt warum.
import { ICON } from '../icons.js?v=36a3ca2d';
import { worldLayer } from '../components/world.js?v=36a3ca2d';

export function mountEvent(root, { t, game, onChoose }) {
  const v = game.view();
  const ev = v.event;
  root.innerHTML = `
  <main class="screen event-screen">
    <section class="comic-page">
      <div class="panel comic-big event-scene">
        <p class="banner-word event-word" data-ref="word"></p>
      </div>
      <div class="panel event-body">
        <p class="event-text" data-ref="text"></p>
        <div class="event-btns" data-ref="btns" role="group"></div>
      </div>
    </section>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll('[data-ref]')].map((el) => [el.dataset.ref, el]));
  root.querySelector('.event-scene').prepend(worldLayer(`area.${v.run?.areaId ?? 'reef'}`, 'scene-bg'));
  ref.word.textContent = t('events.title');
  ref.text.textContent = t(`events.${ev.eventId}.text`);
  let busy = false;
  ref.btns.replaceChildren(...ev.options.map((o, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = i === 0 ? 'btn btn-go event-btn' : 'btn event-btn';
    b.innerHTML = '<span class="event-btn-label"></span>';
    b.firstChild.textContent = t(`events.${ev.eventId}.${o.id}`);
    if (o.cost > 0) {
      const small = document.createElement('small');
      small.className = 'event-cost';
      small.innerHTML = `${ICON.pearl}<span></span>`;
      small.lastChild.textContent = o.available ? t('events.cost', { n: o.cost }) : t('events.noPearls');
      b.append(small);
    }
    b.disabled = !o.available;
    b.addEventListener('click', () => { if (busy) return; busy = true; onChoose(o.id); });
    return b;
  }));
  ref.btns.querySelector('.btn:not(:disabled)')?.focus({ preventScroll: true });
}
