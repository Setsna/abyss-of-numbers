// Gegner im Szenenpanel: Absicht, Immunität, Bild, Name, Leben, Schutz, Lebensbalken.
import { ICON, OP_ICON } from '../icons.js?v=2f0fe1f9';
import { renderAsset } from '../assets.js?v=2f0fe1f9';
import { OPERATOR_SIGN } from '../../engine/math/format.js?v=2f0fe1f9';

export function renderEnemy(e, { t, selected }) {
  const name = t(`enemies.${e.typeId}.name`);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'foe' + (e.alive ? '' : ' is-dead') + (e.rule === 'hidden' && e.alive ? ' is-hidden' : '');
  b.dataset.uid = e.uid;
  b.disabled = !e.alive;
  b.setAttribute('aria-pressed', String(selected && e.alive));

  const parts = [name, t('hud.hp', { n: e.hp, max: e.maxHp })];
  if (e.intent) parts.push(t(e.intent.type === 'attack' ? 'hud.intentAttack' : 'hud.intentBlock', { n: e.intent.amount }));
  const broken = e.immune && e.immuneBroken > 0; // Panzerknacker (Phase 5, Etappe 3)
  if (e.immune) parts.push(broken ? t('hud.immuneBroken', { op: OPERATOR_SIGN[e.immune], n: e.immuneBroken }) : t('hud.immune', { op: OPERATOR_SIGN[e.immune] }));
  if (e.shielded) parts.push(t('hud.shielded'));
  if (e.rule === 'hidden') parts.push(t('hud.hidden'));
  if (e.weakTurns > 0) parts.push(t('hud.weak', { n: e.weakTurns }));
  b.setAttribute('aria-label', parts.join(', '));

  const row = document.createElement('div');
  row.className = 'foe-row';
  if (e.intent) {
    const isAttack = e.intent.type === 'attack';
    row.insertAdjacentHTML('beforeend',
      `<span class="intent ${isAttack ? '' : 'is-shield'}${e.weakTurns > 0 && isAttack ? ' is-weak' : ''}">${isAttack ? ICON.attack : ICON.shield}${e.intent.amount}${e.weakTurns > 0 ? `<b class="weak-turns">${e.weakTurns}</b>` : ''}</span>`);
  }
  if (e.immune) {
    const title = broken ? t('hud.immuneBroken', { op: OPERATOR_SIGN[e.immune], n: e.immuneBroken }) : t('hud.immune', { op: OPERATOR_SIGN[e.immune] });
    row.insertAdjacentHTML('beforeend',
      `<span class="immune${broken ? ' is-broken' : ''}" title="${title}">${OP_ICON[e.immune].replaceAll('#fbfbf7', '#14161f')}${broken ? `<b class="immune-turns">${e.immuneBroken}</b>` : ''}</span>`);
  }

  const art = document.createElement('div');
  art.className = 'foe-art';
  art.append(renderAsset(`enemy.${e.typeId}`, name));

  const label = document.createElement('span');
  label.className = 'foe-name';
  label.textContent = name;

  const plate = document.createElement('div');
  plate.className = 'plate';
  // Leben stehen im Balken; das Schild zeigt Schutz, und Leben nur, wo der Balken fehlt (3 oder 4 Gegner)
  plate.innerHTML = `<span class="stat hp">${ICON.heart}${e.hp}</span>${e.block > 0 ? `<span class="stat block">${ICON.shield}${e.block}</span>` : ''}`;

  const bar = document.createElement('div');
  bar.className = 'hpbar';
  const fill = document.createElement('i');
  fill.style.width = `${(Math.max(0, e.hp) / e.maxHp) * 100}%`; // per CSSOM, CSP erlaubt keine style-Attribute
  const num = document.createElement('span');
  num.className = 'hpbar-num';
  num.innerHTML = `${ICON.heart}<span></span>`;
  num.lastChild.textContent = String(e.hp);
  bar.append(fill, num);

  b.append(row, art, label);
  if (e.shielded && e.alive) {
    const tag = document.createElement('span');
    tag.className = 'shield-tag';
    tag.textContent = t('hud.shielded');
    b.append(tag);
  }
  b.append(plate, bar);
  return b;
}
