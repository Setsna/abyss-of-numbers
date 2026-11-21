// Spielkarte (Kartenentwurf C, Ingos Wahl 18.11.2026; Prototyp prototypes/cards/): Bild über der ganzen Karte,
// pastelliger Rand in der Farbe der Kartenart (Angriff, Schutz, Heilung, Sonstiges), oben rechts das Rechenzeichen
// oder Format, unten rechts auf dem Bild die Wirkung als Plakette, darunter Name und Wirkung als Text.
// Kosten als gelbe Perle links oben, Sterne für die Kartenstufe, Stempel mit dem Grund für „geht nicht“.
import { ICON, OP_ICON } from '../icons.js?v=f988db35';
import { assetUrl } from '../assets.js?v=f988db35';
import { cardEffect } from '../../engine/cards/effect.js?v=f988db35';

// Kartenart je Wirkung; alles andere ist „Sonstiges“
const KIND = { damage: 'attack', damagePerStep: 'attack', damageBlock: 'attack', damageAll: 'attack', damageTwo: 'attack', block: 'block', heal: 'heal' };
// Karten ohne Rechenart zeigen ihr Aufgabenformat (Phase 5, Etappen 3 und 4)
const FORMAT_ICON = { numberLine: ICON.harpoon, wall: ICON.wall, chain: ICON.bubbles, match: ICON.pearl };

// Plakette: Symbol und Zahl der Wirkung (Wirbel ohne Zahl: „Wirf 2 ab, zieh 3“ passt nicht in eine Zahl)
function plaque(e) {
  switch (e.type) {
    case 'damage': case 'damagePerStep': return [ICON.attack, e.amount];
    case 'block': return [ICON.shield, e.amount];
    case 'heal': return [ICON.heal, e.amount];
    case 'energy': return [ICON.bolt, `+${e.amount}`];
    case 'buff': return [ICON.conch, `+${e.amount}`];
    case 'weaken': return [ICON.ink, `−${e.amount}`];
    case 'breakImmunity': return [ICON.crack, e.turns];
    case 'cycle': return [ICON.swirl, null];
    case 'damageBlock': case 'damageAll': case 'damageTwo': return [ICON.attack, e.amount];
    case 'poison': return [ICON.ink, e.amount];
    case 'thorns': return [ICON.crack, e.amount];
    case 'draw': return [ICON.deck, `+${e.amount}`];
    case 'slowTime': return [ICON.swirl, `×${e.factor}`];
    default: return [null, null];
  }
}

// level: Kartenstufe (Phase 5, Etappe 8); Stufe 2 und 3 zeigen die stärkere Wirkung.
export function effectText(def, t, level = 1) {
  const e = cardEffect(def, level);
  if (e.type === 'cycle') return t('eff.cycle', { discard: e.discard, draw: e.draw });
  if (e.type === 'damage' && e.perStreak) return t('eff.damageStreak', { n: e.amount });
  if (e.type === 'block' && e.keep) return t('eff.blockKeep', { n: e.amount });
  return t(`eff.${e.type}`, { n: e.amount, b: e.block, turns: e.turns });
}

// h: Handkarte aus combatView; def: Karte aus cards.json.
// why: Grund, der auf der Karte steht (oder null); picked: in der Strudel-Auswahl markiert.
export function renderCard(h, def, { t, why, picked, pending }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `card k-${KIND[def.effect.type] ?? 'other'}${def.rarity === 'rare' ? ' is-rare' : ''}`; // seltene Karte (Phase 9)
  b.dataset.uid = h.uid;
  if (why) b.classList.add('is-off');
  if (picked) b.classList.add('is-picked');
  if (pending) b.classList.add('is-pending');
  const name = t(`cards.${h.cardId}.name`);
  const level = h.level ?? 1;
  const eff = effectText(def, t, level);
  const op = def.task?.operation ? OP_ICON[def.task.operation] : FORMAT_ICON[def.task?.format] ?? null;
  const [icon, n] = plaque(cardEffect(def, level));
  b.innerHTML = `<span class="cost">${def.cost}</span>`
    + '<span class="card-frame"><span class="card-art">'
    + (op ? `<span class="card-op${def.task?.operation ? '' : ' is-format'}">${op}</span>` : '')
    + (icon ? `<span class="card-plaque">${icon}${n !== null ? `<b>${n}</b>` : ''}</span>` : '')
    + `</span><span class="card-text"><span class="card-name">${name}</span><span class="card-eff">${eff}</span></span></span>`
    + (level > 1 ? `<span class="card-stars">${ICON.star.repeat(level - 1)}</span>` : '')
    + (why ? `<span class="card-why">${t(`reject.${why}`)}</span>` : '');
  // Bild per CSSOM (die CSP erlaubt keine style-Attribute); ohne Bild bleibt die helle Fläche der Kartenart
  const url = assetUrl(`card.${h.cardId}`);
  if (url) b.querySelector('.card-art').style.backgroundImage = `url("${url}")`;
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
