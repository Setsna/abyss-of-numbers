// Zahlenmauer in der Sprechblase (Phase 5, Etappe 4; Korallenmauer). Drei Reihen Steine:
import { formatNumber } from '../../engine/math/format.js?v=5b590f55';
// oben die Spitze (Zelle 5), Mitte 3 und 4, unten die Grundsteine 0 bis 2. Gegebene und schon
// gefüllte Steine zeigen ihre Zahl, der gesuchte Stein leuchtet mit „?“, spätere leere Steine
// bleiben leer. solution: der gesuchte Stein zeigt die richtige Zahl.

const ROWS = [[5], [3, 4], [0, 1, 2]];

export function renderNumberWall(task, { solution = false, t } = {}) {
  const { cells, hidden } = task.wall;
  const i = task.stepIndex - (task.stepOffset ?? 0); // Muräne: Suchschritt vorweg
  const current = hidden[i];
  const filled = new Set(hidden.slice(0, i));
  const wrap = document.createElement('div');
  wrap.className = 'nwall';
  wrap.setAttribute('role', 'img');
  const label = [];
  for (const row of ROWS) {
    const r = document.createElement('div');
    r.className = 'nwall-row';
    for (const cell of row) {
      const stone = document.createElement('span');
      stone.className = 'nwall-stone';
      const known = !hidden.includes(cell) || filled.has(cell);
      if (cell === current) {
        stone.classList.add(solution ? 'is-solved' : 'is-current');
        stone.textContent = solution ? formatNumber(cells[cell]) : '?';
      } else if (known) {
        stone.textContent = formatNumber(cells[cell]);
      } else {
        stone.classList.add('is-empty');
      }
      label.push(stone.textContent || '_');
      r.append(stone);
    }
    wrap.append(r);
  }
  wrap.setAttribute('aria-label', t ? t('task.wallLabel', { stones: label.join(', ') }) : label.join(', '));
  return wrap;
}
