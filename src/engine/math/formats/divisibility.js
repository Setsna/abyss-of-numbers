// Teilbarkeit (Klasse 4, Regelwerk 6.7; Lehrplan PDF S. 13): vier Zahlen, genau eine passt.
//   by        „Welche Zahl ist durch 5 teilbar?“ (2, 5 oder 10)
//   divisor   „Welche Zahl ist ein Teiler von 24?“ (Vorgabe ein Ergebnis des kleinen Einmaleins)
//   multiple  „Welche Zahl ist ein Vielfaches von 7?“ (richtige Zahl aus dem Einmaleins der Vorgabe)
// Falsche Zahlen sind verlockend: F-TEIL-a die Ziffer der Regel steht an der falschen Stelle
// (357 bei „durch 5“, 12 435 bei „durch 2“), F-TEIL-b eine Nachbarzahl einer passenden Zahl.
import { formatNumber } from '../format.js?v=e972392a';
import { drawUntil } from './common.js?v=e972392a';

const draw = (r, rng) => r.min + (r.step ?? 1) * rng.nextInt(0, Math.floor((r.max - r.min) / (r.step ?? 1)));

// verlockend bei „durch n teilbar“: die Ziffer, auf die es ankommt, steht nicht am Ende
function lures(x, n) {
  const s = String(x);
  const last = s.at(-1);
  const front = s.slice(0, -1);
  if (n === 2) return '13579'.includes(last) && /[02468]/.test(front);
  if (n === 5) return !'05'.includes(last) && /[05]/.test(front);
  return last === '5' || (last !== '0' && front.includes('0'));
}

function question(stage, rng) {
  if (stage.question === 'by') {
    const n = rng.pick(stage.divisors);
    const right = drawUntil(() => draw(stage.numbers, rng), (x) => x % n === 0);
    const fits = (x) => x % n === 0;
    return { q: { kind: 'by', n }, right, fits, lure: (x) => lures(x, n), lureType: 'F-TEIL-a' };
  }
  if (stage.question === 'divisor') {
    const v = drawUntil(() => draw(stage.factors, rng) * draw(stage.factors, rng), (x) => x >= stage.valueMin && x <= stage.valueMax);
    const fits = (x) => v % x === 0;
    const right = drawUntil(() => draw(stage.numbers, rng), fits);
    return { q: { kind: 'divisor', n: v }, right, fits, lure: (x) => fits(x + 1) || fits(x - 1), lureType: 'F-TEIL-b' };
  }
  const n = draw(stage.base, rng);
  const fits = (x) => x % n === 0;
  const right = drawUntil(() => n * rng.nextInt(2, 10), (x) => x >= stage.numbers.min && x <= stage.numbers.max);
  return { q: { kind: 'multiple', n }, right, fits, lure: (x) => fits(x + 1) || fits(x - 1), lureType: 'F-TEIL-b' };
}

export function generate(stage, area, rng) {
  const { q, right, fits, lure, lureType } = question(stage, rng);
  const pool = [];
  for (let i = 0; i < 400 && pool.length < 3; i++) {
    const x = draw(stage.numbers, rng);
    if (!fits(x) && x !== right && !pool.some((p) => p.value === x) && lure(x)) pool.push({ value: x, type: lureType });
  }
  while (pool.length < 3) {
    const x = draw(stage.numbers, rng);
    if (!fits(x) && !pool.some((p) => p.value === x)) pool.push({ value: x, type: null });
  }
  const order = rng.shuffle([{ value: right, type: null }, ...pool]);
  const numbers = order.map((m) => m.value);
  const solution = q.kind === 'divisor' ? `${q.n} : ${right} = ${q.n / right}`
    : q.kind === 'multiple' ? `${right / q.n} · ${q.n} = ${right}` : `${formatNumber(right)} : ${q.n} = ${formatNumber(right / q.n)}`;
  return {
    format: 'divisibility',
    question: q,
    numbers,
    prompt: `task.divisibility.${q.kind}`,
    promptParams: { n: formatNumber(q.n) },
    display: null,
    choices: numbers.map(formatNumber),
    correctIndex: numbers.indexOf(right),
    choiceTypes: order.map((m) => m.type),
    solutionText: solution,
    practiceKey: `divisibility:${q.kind}:${q.n}:${right}`,
    ladder: 'teil', stageId: stage.id,
    extraMs: stage.extraMs ?? 0,
  };
}
