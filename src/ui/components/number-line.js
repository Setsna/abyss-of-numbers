// Zahlenstrahl in der Sprechblase (Phase 5, Etappe 3; Harpune). Zeichnung als SVG:
// Striche in bis zu drei Größen (line.ticks: groß, mittel, klein; Phase 6b), Zahlen an line.labels,
// darüber die Markierungen A bis D.
// Getippt wird nicht auf den Strahl (Markierungen liegen bis zu 5 Einheiten auseinander, zu eng
// für Finger), sondern auf die Antwortknöpfe A bis D darunter.
// solution: zeigt die gesuchte Zahl in einer eigenen Zeile unter den Beschriftungen und hebt
// die richtige Markierung hervor (eigene Zeile, damit sie keine Beschriftung überdeckt).

import { formatNumber } from '../../engine/math/format.js?v=6e7c9173';

const NS = 'http://www.w3.org/2000/svg';
// Rand links und rechts so groß, dass eine vierstellige Beschriftung („1000“) ganz ins Bild passt.
const W = 1000, LEFT = 75, RIGHT = 925, AXIS = 118;
// Muss zu .nline-num und .nline-num.is-answer in combat.css passen.
const NUM_SIZE = 52, ANSWER_SIZE = 56, CHAR_WIDTH = 0.62; // Ziffernbreite ≈ 0,62 × Schriftgröße
const LABEL_Y = AXIS + 62, ANSWER_Y = AXIS + 128;

// Breite: Ziffern 0,62 × Schriftgröße, Schmal-Leerzeichen (Tausendertrenner) etwa 0,2 × Schriftgröße.
// Ragt der Text über den Rand (lange Zahlen wie „1 000 000“), rückt er nach innen (Klasse 4, Phase 6b).
const THIN_WIDTH = 0.2;
function textBox(text, x, y, size) {
  const thin = [...text].filter((ch) => ch === ' ').length;
  const width = (text.length - thin) * size * CHAR_WIDTH + thin * size * THIN_WIDTH;
  const cx = Math.min(W - width / 2, Math.max(width / 2, x));
  return { text, x: cx, y, width, height: size };
}

// Reine Platzberechnung (getestet in tests/number-line-layout.test.js).
export function lineLayout(task, { solution = false } = {}) {
  const { min, max, ticks: steps, labels: labelled } = task.line;
  const x = (n) => LEFT + ((n - min) / (max - min)) * (RIGHT - LEFT);
  const ticks = [];
  const labels = [];
  const smallest = steps[steps.length - 1];
  const SIZES = ['big', 'mid', 'small'];
  for (let n = min; n <= max; n += smallest) {
    ticks.push({ x: x(n), size: SIZES[steps.findIndex((s) => n % s === 0)] });
    if (labelled.includes(n)) labels.push(textBox(formatNumber(n), x(n), LABEL_Y, NUM_SIZE));
  }
  const marks = task.marks.map((m, i) => ({ x: x(m), right: i === task.correctIndex }));
  const m = task.marks[task.correctIndex];
  const answer = solution ? textBox(formatNumber(m), x(m), ANSWER_Y, ANSWER_SIZE) : null;
  return { width: W, height: solution ? ANSWER_Y + 14 : 200, ticks, labels, marks, answer };
}

function el(name, attrs, text) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

export function renderNumberLine(task, { solution = false } = {}) {
  const L = lineLayout(task, { solution });
  const svg = el('svg', { viewBox: `0 0 ${L.width} ${L.height}`, class: 'nline-svg', role: 'img', 'aria-label': task.marks.map((m, i) => task.choices[i]).join(', ') });
  svg.append(el('line', { x1: LEFT, y1: AXIS, x2: RIGHT, y2: AXIS, class: 'nline-axis' }));
  const HALF = { big: 18, mid: 11, small: 6 };
  for (const t of L.ticks) svg.append(el('line', { x1: t.x, y1: AXIS - HALF[t.size], x2: t.x, y2: AXIS + HALF[t.size], class: `nline-tick is-${t.size}` }));
  for (const t of L.labels) svg.append(el('text', { x: t.x, y: t.y, class: 'nline-num' }, t.text));
  L.marks.forEach((mk, i) => {
    const g = el('g', { class: `nline-mark${solution && mk.right ? ' is-right' : ''}` });
    g.append(el('path', { d: `M${mk.x} ${AXIS - 4} l-12 -26 h24 z`, class: 'nline-pin' }));
    g.append(el('circle', { cx: mk.x, cy: 44, r: 26, class: 'nline-dot' }));
    g.append(el('text', { x: mk.x, y: 56, class: 'nline-letter' }, task.choices[i]));
    svg.append(g);
  });
  if (L.answer) svg.append(el('text', { x: L.answer.x, y: L.answer.y, class: 'nline-num is-answer' }, L.answer.text));
  return svg;
}
