// Zahlenstrahl (Konzept 8.2, Harpune; Regelwerk 5.5): „Wo ist die 35?“ Vier Markierungen A bis D,
// eine davon die gesuchte Zahl. Strahl, Striche (ticks: groß, mittel, klein) und Beschriftung
// kommen aus der Stufe. Die gesuchte Zahl ist nie eine beschriftete Zahl.
// Alle Markierungen sitzen auf Strichen und liegen mindestens `markGap` auseinander (lesbar auf
// dem iPad). Falsche Markierungen: F-LINE-a Nachbarstrich oder übernächster (± markGap, ± 2 markGap),
// F-LINE-b Zahlendreher (640 → 460), nur wenn er auf einem Strich liegt, F-LINE-c vom falschen Ende gezählt.

import { formatNumber } from '../format.js?v=83dff991';

const LETTERS = ['A', 'B', 'C', 'D'];

// Zahlendreher der beiden ersten Ziffern: 35 → 53, 640 → 460; sonst null
function swapLead(n) {
  const s = String(n);
  if (s.length === 2 && s[1] !== '0' && s[0] !== s[1]) return Number(s[1] + s[0]);
  if (s.length === 3 && s[2] === '0' && s[1] !== '0' && s[0] !== s[1]) return Number(`${s[1]}${s[0]}0`);
  return null;
}

export function generate(stage, area, rng) {
  const { max, ticks, labels, markGap, target: T } = stage;
  const min = 0;
  const grid = ticks[ticks.length - 1];
  const targets = [];
  for (let n = T.min; n <= T.max; n += T.step ?? 1) if (!labels.includes(n)) targets.push(n);
  const target = rng.pick(targets);

  const cands = [];
  for (const k of [1, 2]) for (const s of [-1, 1]) cands.push({ value: target + s * k * markGap, type: 'F-LINE-a' });
  const swapped = swapLead(target);
  if (swapped !== null) cands.push({ value: swapped, type: 'F-LINE-b' });
  cands.push({ value: min + max - target, type: 'F-LINE-c' });
  const mistakes = rng.shuffle(cands).filter((m) => stage.mistakes.includes(m.type));
  // Die gesuchte Zahl soll gleich oft auf A, B, C und D liegen (Review 7b, B7): erst wird gelost, wie viele
  // Markierungen links von ihr liegen, dann werden Fehler und Nachbarstriche passend zu den Seiten gewählt.
  // Geht die geloste Lage nicht (Zahl am Rand), kommt die nächste.
  const build = (left) => {
    const marks = [{ value: target, type: null }];
    // nie auf einer beschrifteten Zahl (dort wäre die Markierung keine echte Wahl)
    const ok = (v) => Number.isInteger(v) && v >= min && v <= max && v % grid === 0 && !labels.includes(v) && marks.every((m) => Math.abs(m.value - v) >= markGap);
    const room = (v) => (v < target ? marks.filter((m) => m.value < target).length < left : marks.filter((m) => m.value > target).length < 3 - left);
    for (const m of mistakes) if (marks.length < 4 && ok(m.value) && room(m.value)) marks.push(m);
    for (let k = 1; marks.length < 4 && k * markGap <= max; k++) {
      for (const v of rng.shuffle([target - k * markGap, target + k * markGap])) if (marks.length < 4 && ok(v) && room(v)) marks.push({ value: v, type: null });
    }
    return marks.length === 4 ? marks : null;
  };
  const first = rng.nextInt(0, 3);
  let marks = null;
  for (const left of [first, ...rng.shuffle([0, 1, 2, 3].filter((x) => x !== first))]) if (!marks) marks = build(left);
  if (!marks) throw new Error('keine vier Markierungen möglich');
  marks.sort((a, b) => a.value - b.value);
  // Liegt die Zahl selbst auf einem großen Strich, nennt der Satz die Nachbarn (70 liegt zwischen 60 und 80;
  // Review 7b, B3), sonst die beiden großen Striche um sie herum (35 liegt zwischen 30 und 40).
  const onBig = target % ticks[0] === 0;
  const lower = onBig ? target - ticks[0] : Math.floor(target / ticks[0]) * ticks[0];
  const upper = onBig ? target + ticks[0] : lower + ticks[0];
  return {
    format: 'numberLine',
    target,
    line: { min, max, ticks: ticks.slice(), labels: labels.slice() },
    marks: marks.map((m) => m.value),
    markGap,
    prompt: 'task.numberLine',
    promptParams: { n: formatNumber(target) },
    extraMs: stage.extraMs ?? 0,
    choices: LETTERS.slice(),
    correctIndex: marks.findIndex((m) => m.value === target),
    choiceTypes: marks.map((m) => m.type),
    solutionText: `${formatNumber(target)} liegt zwischen ${formatNumber(lower)} und ${formatNumber(upper)}.`,
    practiceKey: `numberLine:${target}`,
    ladder: 'line', stageId: stage.id,
  };
}
