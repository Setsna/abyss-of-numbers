// Handkarte: Kosten, Rechenzeichen oder Symbol, Name, Wirkung, ggf. Grund für „geht nicht“.
import { ICON, OP_ICON } from '../icons.js';
import { cardEffect } from '../../engine/cards/effect.js';

const KIND_BG = { damage: 'var(--sea)', block: 'var(--shield)', heal: 'var(--heal)', cycle: 'var(--sea-deep)', buff: 'var(--sea)', breakImmunity: 'var(--sea-deep)', damagePerStep: 'var(--sea)', energy: 'var(--sea-deep)', weaken: 'var(--shield)' };
const KIND_ICON = { block: ICON.shield, heal: ICON.heal, cycle: ICON.swirl, buff: ICON.conch, breakImmunity: ICON.crack, weaken: ICON.ink };
// Karten ohne Rechenart zeigen ihr Aufgabenformat (Phase 5, Etappen 3 und 4)
const FORMAT_ICON = { numberLine: ICON.harpoon, wall: ICON.wall, chain: ICON.bubbles, match: ICON.pearl };

// level: Kartenstufe (Phase 5, Etappe 8); Stufe 2 und 3 zeigen die stärkere Wirkung.
export function effectText(def, t, level = 1) {
  const e = cardEffect(def, level);
  return e.type === 'cycle' ? t('eff.cycle', { discard: e.discard, draw: e.draw }) : t(`eff.${e.type}`, { n: e.amount, turns: e.turns });
}

// h: Handkarte aus combatView; def: Karte aus cards.json.
// why: Grund, der auf der Karte steht (oder null); picked: in der Strudel-Auswahl markiert.
export function renderCard(h, def, { t, why, picked, pending }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'card';
  b.dataset.uid = h.uid;
  if (why) b.classList.add('is-off');
  if (picked) b.classList.add('is-picked');
  if (pending) b.classList.add('is-pending');
  const name = t(`cards.${h.cardId}.name`);
  const level = h.level ?? 1;
  const eff = effectText(def, t, level);
  const art = def.task?.operation ? OP_ICON[def.task.operation] : FORMAT_ICON[def.task?.format] ?? KIND_ICON[def.effect.type] ?? '';
  b.innerHTML = `<span class="cost">${def.cost}</span>`
    + `<span class="card-art card-op">${art}</span>`
    + (level > 1 ? `<span class="card-stars">${ICON.star.repeat(level - 1)}</span>` : '')
    + `<span class="card-name">${name}</span><span class="card-eff">${eff}</span>`
    + (why ? `<span class="card-why">${t(`reject.${why}`)}</span>` : '');
  b.querySelector('.card-art').style.setProperty('--kind', KIND_BG[def.effect.type]); // per CSSOM, CSP erlaubt keine style-Attribute
  const plain = t('hud.cardLabel', { name: name.replaceAll('­', ''), cost: def.cost, effect: eff });
  const label = level > 1 ? `${plain}, ${t('hud.cardLevel', { n: level })}` : plain;
  b.setAttribute('aria-label', why ? `${label}, ${t(`reject.${why}`)}` : label);
  return b;
}

export function emptySlot() {
  const d = document.createElement('div');
  d.className = 'card is-gone';
  return d;
}
