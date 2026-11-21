var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/engine/config/files.js
var CONFIG_FILES = {
  game: "game.json",
  texts: "texts/de.json",
  class3: "curricula/class3.json",
  class4: "curricula/class4.json",
  cards: "cards/cards.json",
  decks: "cards/decks.json",
  enemies: "enemies/enemies.json",
  bosses: "enemies/bosses.json",
  elites: "enemies/elites.json",
  // Elitegegner (Phase 9, Etappe 2)
  areas: "dungeons/areas.json",
  events: "dungeons/events.json",
  // Ereignisräume (Phase 9, Etappe 2)
  riddles: "dungeons/riddles.json",
  // Rätselraum im Tempel (Phase 9, Etappe 7)
  levels: "progression/levels.json",
  rewards: "progression/rewards.json",
  depths: "progression/depths.json",
  // Jahresausbau (Phase 9)
  station: "progression/station.json",
  // Station ausbauen (Phase 9, Etappe 8)
  heroes: "heroes/heroes.json",
  talents: "heroes/talents.json",
  // Talente (Phase 9, Etappe 3)
  items: "items/items.json",
  sounds: "audio/sounds.json"
};

// src/platform/config-loader.js
async function loadConfig(fetchJson) {
  const entries = await Promise.all(
    Object.entries(CONFIG_FILES).map(async ([key, path]) => [key, await fetchJson(path)])
  );
  return Object.fromEntries(entries);
}
function browserFetchJson(base = "config/") {
  return async (path) => {
    const res = await fetch(base + path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  };
}

// src/engine/rng.js
function makeRng(state) {
  let a = state | 0;
  const rng = {
    nextUint32() {
      a = a + 1831565813 | 0;
      let t2 = Math.imul(a ^ a >>> 15, 1 | a);
      t2 = t2 + Math.imul(t2 ^ t2 >>> 7, 61 | t2) ^ t2;
      return (t2 ^ t2 >>> 14) >>> 0;
    },
    // beide Grenzen eingeschlossen
    nextInt(min, max) {
      return min + rng.nextUint32() % (max - min + 1);
    },
    pick(array) {
      return array[rng.nextUint32() % array.length];
    },
    // liefert ein neues Array, die Eingabe bleibt unverändert
    shuffle(array) {
      const out = array.slice();
      for (let i = out.length - 1; i >= 1; i--) {
        const j = rng.nextUint32() % (i + 1);
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
    getState() {
      return a >>> 0;
    }
  };
  return rng;
}
function createRng(seed) {
  return makeRng(seed >>> 0);
}
function fnv1a32(text2) {
  let h = 2166136261;
  for (let i = 0; i < text2.length; i++) {
    h ^= text2.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function deriveSeed(seed, label) {
  return (fnv1a32(label) ^ seed) >>> 0;
}

// src/engine/dungeon/map.js
function nextSlots(slot, nextCount, count) {
  const wanted = nextCount < count ? [slot - 1, slot] : [slot, slot + 1];
  const clamped = wanted.map((s) => Math.min(nextCount - 1, Math.max(0, s)));
  return [...new Set(clamped)];
}
function layoutsOf(areaConfig) {
  return [{ layers: areaConfig.layers }, ...areaConfig.moreLayouts ?? []];
}
function specAt(spec, depth) {
  return spec.fromDepth !== void 0 && depth < spec.fromDepth ? specAt(spec.fallback, depth) : spec;
}
function groupsAt(spec, depth) {
  return [...spec.pool ?? [], ...(spec.deepPools ?? []).filter((p) => p.fromDepth <= depth).flatMap((p) => p.groups)];
}
function addExtraRest(map) {
  const pick = map.rooms.filter((r) => r.type === "treasure" || r.type === "event").sort((a, b) => b.layer - a.layer || a.slot - b.slot)[0];
  return {
    ...map,
    rooms: map.rooms.map((r) => r === pick ? { id: r.id, layer: r.layer, slot: r.slot, type: "rest", next: r.next.slice() } : r)
  };
}
function generateMap(areaConfig, seed, config, depth = 1) {
  const rng = createRng(deriveSeed(seed, "map"));
  const layouts = layoutsOf(areaConfig);
  const layout = layouts.length > 1 ? rng.nextInt(0, layouts.length - 1) : 0;
  const layers = layouts[layout].layers.map((layer, li) => layer.rooms.map((raw, si) => {
    const spec = specAt(raw, depth);
    const type = spec.type ?? rng.pick(spec.choices);
    const room = { id: `r${li}-${si}`, layer: li, slot: si, type, next: [] };
    if (type === "combat" || type === "elite" || type === "event" && spec.pool) {
      room.enemies = rng.pick(groupsAt(spec, depth)).slice();
      room.level = spec.level;
    }
    if (type === "boss") {
      const enc = config.bosses.encounters[spec.encounter];
      if (!enc) throw new Error(`unbekannte Boss-Begegnung: ${spec.encounter}`);
      room.enemies = enc.slice();
      room.level = spec.level;
      room.encounter = spec.encounter;
    }
    if (spec.tutorial) room.tutorial = true;
    return room;
  }));
  for (let li = 0; li < layers.length - 1; li++) {
    const next = layers[li + 1];
    for (const room of layers[li]) {
      room.next = nextSlots(room.slot, next.length, layers[li].length).map((s) => next[s].id);
    }
  }
  return { rooms: layers.flat(), start: layers[0].map((r) => r.id), layout };
}

// src/engine/math/places.js
function calcPlace(n) {
  if (!Number.isInteger(n) || n === 0) return 0;
  let place = 1;
  let m = Math.abs(n);
  while (m % 10 === 0) {
    m /= 10;
    place *= 10;
  }
  return place;
}
function digitAt(n, place) {
  return Math.floor(Math.abs(n) / place) % 10;
}
function crossPlace(op, a, b) {
  if (op !== "add" && op !== "sub") return null;
  for (let p = 1; p <= Math.max(a, b); p *= 10) {
    const x = digitAt(a, p);
    const y = digitAt(b, p);
    if (op === "add" ? x + y >= 10 : x < y) return p * 10;
  }
  return null;
}

// src/engine/math/formats/common.js
var MAX_TRIES = 1e4;
function drawUntil(draw3, accept) {
  for (let i = 0; i < MAX_TRIES; i++) {
    const v = draw3();
    if (accept(v)) return v;
  }
  throw new Error("keine passende Aufgabe gefunden");
}
function pickWrong(correct, candidates, { min, max, step = 1 }, rng) {
  const seen = /* @__PURE__ */ new Set([correct]);
  const ok = (n) => Number.isInteger(n) && n >= min && n <= max && !seen.has(n);
  const pool = [];
  for (const n of candidates) if (ok(n)) {
    seen.add(n);
    pool.push(n);
  }
  const picked = rng.shuffle(pool).slice(0, 3);
  for (let k = 1; picked.length < 3; k++) {
    for (const n of [correct + k * step, correct - k * step]) if (picked.length < 3 && ok(n)) {
      seen.add(n);
      picked.push(n);
    }
    if (k * step > max - min + 3) throw new Error("keine drei falschen Antworten m\xF6glich");
  }
  return picked;
}
function placeCorrect(correct, wrong, rng) {
  const choices = rng.shuffle([correct, ...wrong]);
  return { choices, correctIndex: choices.indexOf(correct) };
}
function swapDigits(n) {
  if (n < 10 || n > 99 || n % 10 === 0) return null;
  const tens = Math.floor(n / 10), ones = n % 10;
  return tens === ones ? null : ones * 10 + tens;
}

// src/engine/math/format.js
var OPERATOR_SIGN = { add: "+", sub: "\u2212", mul: "\xB7", div: ":" };
function formatNumber(n) {
  if (!Number.isInteger(n) || Math.abs(n) < 1e4) return String(n);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F");
}
function formatExpression(operation, a, b) {
  return `${formatNumber(a)} ${OPERATOR_SIGN[operation]} ${formatNumber(b)}`;
}
function formatEquation(operation, a, b, result) {
  return `${formatExpression(operation, a, b)} = ${formatNumber(result)}`;
}

// src/engine/math/mistakes.js
var crossesAdd = (a, b, p) => digitAt(a, p) + digitAt(b, p) >= 10;
var crossesSub = (a, b, p) => digitAt(a, p) < digitAt(b, p);
function smallerFromLarger(a, b) {
  let out = 0;
  for (let p = 1; p <= Math.max(a, b); p *= 10) out += Math.abs(digitAt(a, p) - digitAt(b, p)) * p;
  return out;
}
var RULES = {
  add: {
    "F-ADD-a": ({ a, b, result }, p) => crossesAdd(a, b, p) ? [result - 10 * p] : [],
    "F-ADD-b": ({ result }, p) => [result + 10 * p],
    "F-ADD-c": ({ result }, p) => [result - p, result + p],
    "F-ADD-d": ({ result }) => [swapDigits(result)],
    "F-ADD-e": ({ a, b }) => [a + b * 10, a + b / 10]
  },
  sub: {
    "F-SUB-a": ({ a, b, result }, p) => crossesSub(a, b, p) ? [result + 10 * p] : [],
    "F-SUB-b": ({ a, b }) => [smallerFromLarger(a, b)],
    "F-SUB-c": ({ result }, p) => [result - p, result + p],
    "F-SUB-d": ({ result }, p) => [result - 10 * p],
    "F-SUB-e": ({ a, b }) => [a - b * 10, a - b / 10],
    "F-SUB-f": ({ a, b }) => [a + b]
  },
  // Regelwerk 5.3: Nachbaraufgabe (ein Faktor um 1 oder 2 daneben, kein Faktor 0), addiert,
  // eine Null zu wenig, Nachbaraufgabe bei Zehner- und Hunderterzahlen
  mul: {
    // nach Abstand geordnet: erst ein Faktor um 1, dann um 2 daneben
    "F-MUL-a": ({ a, b }) => [-1, 1, -2, 2].flatMap((d) => [a + d >= 1 ? (a + d) * b : null, b + d >= 1 ? a * (b + d) : null]),
    "F-MUL-b": ({ a, b }) => [a + b],
    "F-MUL-c": ({ result }) => [result / 10],
    // Nachbaraufgabe an der Stelle beider Faktoren (3 · 60 → 2 · 60, 3 · 70; 40 · 70 → 30 · 70, 40 · 80)
    "F-MUL-d": ({ a, b }) => {
      const [s, big] = a < b ? [a, b] : [b, a];
      const u = calcPlace(big);
      const v = calcPlace(s);
      return [(s - v) * big, (s + v) * big, s * (big - u), s * (big + u)];
    },
    // eine Null zu viel (Klasse 4: 300 · 10 → 30 000)
    "F-MUL-e": ({ result }) => [result * 10]
  },
  // Regelwerk 5.4: Nachbar in der Reihe, Divisor genannt, eine Null zu viel oder zu wenig,
  // Nachbaraufgabe bei Zehner- und Hunderterzahlen
  div: {
    "F-DIV-a": ({ result }) => [result - 1, result + 1, result - 2, result + 2],
    "F-DIV-b": ({ b }) => [b],
    "F-DIV-c": ({ result }) => [result * 10, result / 10],
    "F-DIV-d": ({ result }) => [result - calcPlace(result), result + calcPlace(result)]
  }
};
function mistakesFor(ladder3, stage, numbers) {
  const rules = RULES[ladder3];
  if (!rules) throw new Error(`keine Fehlertypen f\xFCr ${ladder3}`);
  const p = calcPlace(numbers.b);
  const out = [];
  for (const type of stage.mistakes ?? []) {
    const rule = rules[type];
    if (!rule) throw new Error(`unbekannter Fehlertyp ${type}`);
    for (const value of rule(numbers, p)) if (value !== null) out.push({ value, type });
  }
  return out;
}
function commonRound(a, b) {
  let k = 1;
  while (a % (k * 10) === 0 && b % (k * 10) === 0) k *= 10;
  return k;
}
function pickChoices(correct, candidates, { min, max, roundTo = 1, sameUnits = false, prefer = null, fillStep = roundTo, exclude = [] }, rng) {
  const seen = /* @__PURE__ */ new Set([correct, ...exclude.filter((n) => n !== correct)]);
  const ok = (n) => Number.isInteger(n) && n >= min && n <= max && n % roundTo === 0 && !seen.has(n);
  const pool = [];
  for (const m of candidates) if (ok(m.value)) {
    seen.add(m.value);
    pool.push(m);
  }
  const shuffled = rng.shuffle(pool);
  const picked = [];
  if (prefer) {
    for (const m of shuffled) if (m.type === prefer[0] && picked.length < prefer[1]) picked.push(m);
  }
  if (sameUnits) {
    const same = shuffled.find((m) => m.value % 10 === correct % 10);
    if (same) picked.push(same);
  }
  for (const m of shuffled) if (picked.length < 3 && !picked.includes(m)) picked.push(m);
  const fill = (step) => {
    for (let k = 1; picked.length < 3 && k * step <= max - min + step; k++) {
      for (const n of [correct + k * step, correct - k * step]) {
        if (picked.length < 3 && ok(n)) {
          seen.add(n);
          picked.push({ value: n, type: null });
        }
      }
    }
  };
  if (sameUnits && !picked.some((m) => m.value % 10 === correct % 10)) {
    for (let k = 1; k * 10 <= max; k++) {
      const n = [correct - 10 * k, correct + 10 * k].find(ok);
      if (n === void 0) continue;
      seen.add(n);
      if (picked.length === 3) picked.pop();
      picked.push({ value: n, type: null });
      break;
    }
  }
  fill(fillStep);
  if (picked.length < 3) throw new Error("keine drei falschen Antworten m\xF6glich");
  const order = rng.shuffle([{ value: correct, type: null }, ...picked.slice(0, 3)]);
  return {
    choices: order.map((m) => formatNumber(m.value)),
    correctIndex: order.findIndex((m) => m.value === correct),
    choiceTypes: order.map((m) => m.value === correct ? null : m.type)
  };
}

// src/engine/math/ladders/add.js
var add_exports = {};
__export(add_exports, {
  drawStage: () => drawStage,
  kinds: () => kinds
});

// src/engine/math/ladders/plus-minus.js
function rangeCount(r) {
  return Math.floor((r.max - r.min) / (r.step ?? 1)) + 1;
}
function drawRange(r, rng) {
  return r.min + (r.step ?? 1) * rng.nextInt(0, rangeCount(r) - 1);
}
var fits = (n, r) => !(r.notMultipleOf && n % r.notMultipleOf === 0) && !(r.noZeroDigit && String(n).includes("0"));
function drawFromRanges(ranges, rng) {
  const total = ranges.reduce((s, r) => s + rangeCount(r), 0);
  let k = rng.nextInt(0, total - 1);
  for (const r of ranges) {
    const n = rangeCount(r);
    if (k < n) return { value: r.min + (r.step ?? 1) * k, range: r };
    k -= n;
  }
  throw new Error("Bereich leer");
}
function makeLadder(op) {
  const apply = op === "add" ? (a, b) => a + b : (a, b) => a - b;
  const crosses = op === "add" ? (a, b, p) => digitAt(a, p) + digitAt(b, p) >= 10 : (a, b, p) => digitAt(a, p) < digitAt(b, p);
  const resultOk = (s, result) => (s.resultMin === void 0 || result >= s.resultMin) && (s.resultMax === void 0 || result <= s.resultMax);
  function draw3(s, rng) {
    switch (s.kind) {
      case "onePlace":
        return drawUntil(
          () => {
            const a = drawRange(s.a, rng);
            const { value: b, range } = drawFromRanges(s.b, rng);
            return { a, b, okA: fits(a, s.a), okB: fits(b, range) };
          },
          ({ a, b, okA, okB }) => okA && okB && resultOk(s, apply(a, b)) && (s.checkPlaces ?? []).every((p) => !crosses(a, b, p))
        );
      case "pair":
        return drawUntil(
          () => ({ a: drawRange(s.a, rng), b: drawRange(s.b, rng) }),
          ({ a, b }) => fits(a, s.a) && fits(b, s.b) && resultOk(s, apply(a, b)) && (s.carry === void 0 || crosses(a, b, s.carryAt) === s.carry)
        );
      case "either": {
        const weights = s.weights ?? s.variants.map(() => 1);
        let k = rng.nextInt(0, weights.reduce((x, y) => x + y, 0) - 1);
        let i = 0;
        while (k >= weights[i]) {
          k -= weights[i];
          i += 1;
        }
        return draw3({ ...s.variants[i], resultMin: s.resultMin, resultMax: s.resultMax }, rng);
      }
      default:
        throw new Error(`unbekannte Zugart ${s.kind}`);
    }
  }
  return {
    kinds: ["onePlace", "pair", "either"],
    drawStage(stage, rng) {
      const { a, b } = draw3(stage, rng);
      return { a, b, result: apply(a, b) };
    }
  };
}

// src/engine/math/ladders/add.js
var ladder = makeLadder("add");
var kinds = ladder.kinds;
var drawStage = ladder.drawStage;

// src/engine/math/ladders/sub.js
var sub_exports = {};
__export(sub_exports, {
  drawStage: () => drawStage2,
  kinds: () => kinds2
});
var ladder2 = makeLadder("sub");
var kinds2 = ladder2.kinds;
var drawStage2 = ladder2.drawStage;

// src/engine/math/ladders/mul.js
var mul_exports = {};
__export(mul_exports, {
  drawStage: () => drawStage3,
  kinds: () => kinds3
});
var kinds3 = ["facts", "scaled", "roundPair"];
function factors(stage, rng) {
  if (stage.kind === "facts") return [rng.pick(stage.rows), rng.pick(stage.partners)];
  const unit = () => stage.units ? rng.pick(stage.units) : stage.unit;
  const ok = ([x, y]) => stage.productMax === void 0 || x * y <= stage.productMax;
  if (stage.kind === "scaled") return drawUntil(() => [rng.pick(stage.small), unit() * rng.pick(stage.big)], ok);
  if (stage.kind === "roundPair") return drawUntil(() => [rng.pick(stage.digits) * unit(), rng.pick(stage.digits) * unit()], ok);
  throw new Error(`unbekannte Zugart ${stage.kind}`);
}
function drawStage3(stage, rng) {
  const [x, y] = factors(stage, rng);
  const [a, b] = rng.nextUint32() % 2 === 0 ? [x, y] : [y, x];
  return { a, b, result: a * b };
}

// src/engine/math/ladders/div.js
var div_exports = {};
__export(div_exports, {
  drawStage: () => drawStage4,
  kinds: () => kinds4
});
var kinds4 = ["inverse"];
function drawStage4(stage, rng) {
  if (stage.kind !== "inverse" || !stage.fromStage) throw new Error(`Geteilt-Stufe ${stage.id} ohne Mal-Stufe`);
  const { a: x, b: y, result } = drawStage3(stage.fromStage, rng);
  const rule = stage.divisor ?? "any";
  const isDivisor = (f) => rule === "small" ? f < 10 : rule === "pow10" ? f === 10 || f === 100 : true;
  const d = isDivisor(x) ? x : y;
  if (!isDivisor(d)) throw new Error(`${stage.id}: kein Divisor nach Regel ${rule} in ${x} \xB7 ${y}`);
  return { a: result, b: d, result: result / d };
}

// src/engine/math/ladders/index.js
var LADDERS = { add: add_exports, sub: sub_exports, mul: mul_exports, div: div_exports };
var FORMAT_LADDER = { numberLine: "line", sequence: "seq", complement: "comp", wall: "wall", chain: "chain", pointBeforeLine: "pvs", divisibility: "teil" };
var FORMAT_KINDS = { line: ["line"], seq: ["seq"], comp: ["comp"], wall: ["wall"], chain: ["chain"], pvs: ["pvs"], teil: ["teil"] };
function stageAt(curriculum, ladder3, n) {
  const stage = curriculum.ladders?.[ladder3]?.stages?.[n - 1];
  if (!stage) throw new Error(`Stufe ${n} der Leiter ${ladder3} fehlt`);
  return linked(curriculum, stage);
}
function linked(curriculum, stage) {
  if (!stage.from || stage.fromStage) return stage;
  const from = findStage(curriculum, stage.from);
  if (!from) throw new Error(`${stage.id}: Stufe ${stage.from} fehlt`);
  return { ...stage, fromStage: from };
}
function findStage(curriculum, id) {
  for (const l of Object.values(curriculum.ladders ?? {})) {
    const s = l.stages.find((x) => x.id === id);
    if (s) return s;
  }
  return null;
}
function curriculumOf(config, grade) {
  const cur = config[`class${grade}`];
  return cur?.sameAs ? config[`class${cur.sameAs}`] : cur;
}
function stageWithoutLearning([lo, hi], kind) {
  if (kind === "intro") return lo;
  if (kind === "boss") return hi;
  return lo + Math.floor((hi - lo) / 2);
}
function planWithoutLearning(curriculum, areaId, kind, grade) {
  const win = { ...curriculum.windows?.[areaId] ?? {} };
  const stageOf = Object.fromEntries(Object.entries(win).map(([ladder3, w]) => [ladder3, stageWithoutLearning(w, kind)]));
  return { grade, stageOf, windows: win };
}
function stageById(curriculum, id) {
  const s = findStage(curriculum, id);
  return s ? linked(curriculum, s) : null;
}

// src/engine/math/ways.js
var APPLY = { add: (x, y) => x + y, sub: (x, y) => x - y, mul: (x, y) => x * y, div: (x, y) => x / y };
var eq = (op, x, y) => formatEquation(op, x, y, APPLY[op](x, y));
var CORE = [2, 5, 10];
var nextMult = (a, k) => Math.ceil((a + 1) / k) * k;
function plusMinus(op, a, b) {
  const k = commonRound(a, b);
  if (k >= 10 && a / k < 100 && b / k < 100) return { key: "scaled", parts: [eq(op, a / k, b / k), eq(op, a, b)] };
  const p = calcPlace(b);
  const crosses = op === "add" ? digitAt(a, p) + digitAt(b, p) >= 10 : digitAt(a, p) < digitAt(b, p);
  if (!crosses) return null;
  const high = b - digitAt(b, p) * p;
  if (high > 0) return { key: "steps", parts: [eq(op, a, high), eq(op, APPLY[op](a, high), b - high)] };
  const d = digitAt(a, p);
  const first = (op === "add" ? 10 - d : d) * p;
  if (d === 0 || first >= b) return null;
  const mid = APPLY[op](a, first);
  return { key: "steps", parts: [eq(op, a, first), eq(op, mid, b - first)] };
}
function times(a, b) {
  const round = (x) => x >= 20 && x % 10 === 0 ? x / calcPlace(x) : x;
  if (round(a) === 1 || round(b) === 1) return null;
  if (round(a) !== a || round(b) !== b) return { key: "scaled", parts: [eq("mul", round(a), round(b)), eq("mul", a, b)] };
  if (CORE.includes(a) || CORE.includes(b)) return null;
  const base = a >= 6 ? 5 : 2;
  return { key: "core", parts: [eq("mul", base, b), eq("mul", a - base, b), formatNumber(a * b)] };
}
function divide(a, b) {
  const r = a / b;
  return { key: "inverse", parts: [eq("mul", r, b), eq("div", a, b)] };
}
function complement({ a, target }) {
  const next = nextMult(a, 10 * calcPlace(a));
  if (next >= target) return null;
  return { key: "complement", parts: [eq("add", a, next - a), eq("add", next, target - next), formatNumber(target - a)] };
}
function pointFirst({ a, op, point: point2, b, c, bracket = false, aFirst = false }) {
  if (bracket) {
    const inner = APPLY[op](b, c);
    return { key: "steps", parts: [eq(op, b, c), point2 === "mul" && aFirst ? eq("mul", a, inner) : eq(point2, inner, a)] };
  }
  const v = APPLY[point2](b, c);
  return { key: "steps", parts: [eq(point2, b, c), eq(op, a, v)] };
}
function neighborWay(a, b, wrong) {
  const result = a * b;
  if (!Number.isInteger(wrong) || wrong === result) return null;
  for (const first of [true, false]) {
    const x = first ? a : b;
    const unit = x >= 20 && x % 10 === 0 ? calcPlace(x) : 1;
    for (const k of [1, -1, 2, -2]) {
      const nx = x + k * unit;
      if (nx < 1) continue;
      const [na, nb] = first ? [nx, b] : [a, nx];
      if (na * nb !== wrong) continue;
      return { key: wrong < result ? "neighborUp" : "neighborDown", parts: [eq("mul", na, nb), formatNumber(Math.abs(result - wrong)), formatNumber(result)] };
    }
  }
  return null;
}
function wayFor(kind, n) {
  switch (kind) {
    case "add":
    case "sub":
      return plusMinus(kind, n.a, n.b);
    case "mul":
      return times(n.a, n.b);
    case "div":
      return divide(n.a, n.b);
    case "comp":
      return complement(n);
    case "pvs":
      return pointFirst(n);
    default:
      return null;
  }
}
function wayForKey(key) {
  const [kind, x, y] = String(key).split(":");
  const a = Number(x);
  const b = Number(y);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
  if (APPLY[kind]) return wayFor(kind, { a, b });
  if (kind === "complement") return wayFor("comp", { a, target: b });
  return null;
}

// src/engine/math/formats/number-line.js
var number_line_exports = {};
__export(number_line_exports, {
  generate: () => generate
});
var LETTERS = ["A", "B", "C", "D"];
function swapLead(n) {
  const s = String(n);
  if (s.length === 2 && s[1] !== "0" && s[0] !== s[1]) return Number(s[1] + s[0]);
  if (s.length === 3 && s[2] === "0" && s[1] !== "0" && s[0] !== s[1]) return Number(`${s[1]}${s[0]}0`);
  return null;
}
function generate(stage, area, rng) {
  const { max, ticks, labels, markGap, target: T } = stage;
  const min = 0;
  const grid = ticks[ticks.length - 1];
  const targets = [];
  for (let n = T.min; n <= T.max; n += T.step ?? 1) if (!labels.includes(n)) targets.push(n);
  const target = rng.pick(targets);
  const cands = [];
  for (const k of [1, 2]) for (const s of [-1, 1]) cands.push({ value: target + s * k * markGap, type: "F-LINE-a" });
  const swapped = swapLead(target);
  if (swapped !== null) cands.push({ value: swapped, type: "F-LINE-b" });
  cands.push({ value: min + max - target, type: "F-LINE-c" });
  const mistakes = rng.shuffle(cands).filter((m) => stage.mistakes.includes(m.type));
  const build = (left) => {
    const marks2 = [{ value: target, type: null }];
    const ok = (v) => Number.isInteger(v) && v >= min && v <= max && v % grid === 0 && !labels.includes(v) && marks2.every((m) => Math.abs(m.value - v) >= markGap);
    const room = (v) => v < target ? marks2.filter((m) => m.value < target).length < left : marks2.filter((m) => m.value > target).length < 3 - left;
    for (const m of mistakes) if (marks2.length < 4 && ok(m.value) && room(m.value)) marks2.push(m);
    for (let k = 1; marks2.length < 4 && k * markGap <= max; k++) {
      for (const v of rng.shuffle([target - k * markGap, target + k * markGap])) if (marks2.length < 4 && ok(v) && room(v)) marks2.push({ value: v, type: null });
    }
    return marks2.length === 4 ? marks2 : null;
  };
  const first = rng.nextInt(0, 3);
  let marks = null;
  for (const left of [first, ...rng.shuffle([0, 1, 2, 3].filter((x) => x !== first))]) if (!marks) marks = build(left);
  if (!marks) throw new Error("keine vier Markierungen m\xF6glich");
  marks.sort((a, b) => a.value - b.value);
  const onBig = target % ticks[0] === 0;
  const lower = onBig ? target - ticks[0] : Math.floor(target / ticks[0]) * ticks[0];
  const upper = onBig ? target + ticks[0] : lower + ticks[0];
  return {
    format: "numberLine",
    target,
    line: { min, max, ticks: ticks.slice(), labels: labels.slice() },
    marks: marks.map((m) => m.value),
    markGap,
    prompt: "task.numberLine",
    promptParams: { n: formatNumber(target) },
    extraMs: stage.extraMs ?? 0,
    choices: LETTERS.slice(),
    correctIndex: marks.findIndex((m) => m.value === target),
    choiceTypes: marks.map((m) => m.type),
    solutionText: `${formatNumber(target)} liegt zwischen ${formatNumber(lower)} und ${formatNumber(upper)}.`,
    practiceKey: `numberLine:${target}`,
    ladder: "line",
    stageId: stage.id
  };
}

// src/engine/math/formats/sequence.js
var sequence_exports = {};
__export(sequence_exports, {
  generate: () => generate2
});
function drawStart(v, st, rng) {
  const r = v.start;
  if (v.startMultipleOfStep) return st * rng.nextInt(Math.ceil(r.min / st), Math.floor(r.max / st));
  if (v.startMultipleOfPlace) {
    const p = calcPlace(st);
    return p * rng.nextInt(Math.ceil(r.min / p), Math.floor(r.max / p));
  }
  const step = r.step ?? 1;
  return r.min + step * rng.nextInt(0, Math.floor((r.max - r.min) / step));
}
function generate2(stage, area, rng) {
  const terms = drawUntil(() => {
    const v = rng.pick(stage.variants);
    const st = rng.pick(v.steps);
    const s2 = rng.pick(v.dirs) === "down" ? -st : st;
    const start = drawStart(v, st, rng);
    return Array.from({ length: 5 }, (_, k) => start + k * s2);
  }, (t2) => t2.every((n) => n >= stage.min && n <= stage.max) && (!stage.crossTen || Math.floor(t2[0] / 10) !== Math.floor(t2[4] / 10)));
  const shown = terms.slice(0, 4);
  const answer2 = terms[4];
  const s = terms[1] - terms[0];
  const p = calcPlace(Math.abs(s));
  const all = {
    "F-SEQ-a": [answer2 + s],
    "F-SEQ-b": [answer2 - p, answer2 + p],
    "F-SEQ-c": [shown[3] - s],
    "F-SEQ-d": [shown[3]]
  };
  const cands = stage.mistakes.flatMap((type) => all[type].map((value) => ({ value, type })));
  const { choices, correctIndex, choiceTypes } = pickChoices(answer2, cands, { min: Math.max(0, stage.min), max: Math.min(stage.max, area.maxNumber), fillStep: p }, rng);
  return {
    format: "sequence",
    shown,
    prompt: "task.sequence",
    display: `${shown.map(formatNumber).join(", ")}, ?`,
    choices,
    correctIndex,
    choiceTypes,
    solutionText: terms.map(formatNumber).join(", "),
    extraMs: stage.extraMs ?? 0,
    practiceKey: `sequence:${terms[0]}:${s}`,
    ladder: "seq",
    stageId: stage.id
  };
}

// src/engine/math/formats/complement.js
var complement_exports = {};
__export(complement_exports, {
  generate: () => generate3
});
var nextMult2 = (a, k) => Math.ceil((a + 1) / k) * k;
function digitComplement(a, target) {
  const p = calcPlace(a);
  let out = 0;
  for (let q = p; q < target; q *= 10) out += (10 - digitAt(a, q)) * q;
  return out;
}
function generate3(stageIn, area, rng) {
  const stage = stageIn.variants ? { ...stageIn, ...rng.pick(stageIn.variants) } : stageIn;
  const r = stage.a;
  const step = r.step ?? 1;
  const a = drawUntil(
    () => r.min + step * rng.nextInt(0, Math.floor((r.max - r.min) / step)),
    (n) => !(r.notMultipleOf && n % r.notMultipleOf === 0)
  );
  const target = stage.to ?? nextMult2(a, stage.toNext);
  const answer2 = target - a;
  const p = calcPlace(answer2);
  const pa = calcPlace(a);
  const all = {
    "F-COMP-a": [digitComplement(a, target)],
    "F-COMP-b": [answer2 - 10 * p, answer2 + 10 * p],
    "F-COMP-c": [answer2 - p, answer2 + p],
    "F-COMP-d": [digitAt(a, pa) * pa],
    "F-COMP-e": [nextMult2(a, 10 * pa) - a]
  };
  const cands = stage.mistakes.flatMap((type) => all[type].map((value) => ({ value, type })));
  const k = commonRound(a, target);
  const { choices, correctIndex, choiceTypes } = pickChoices(answer2, cands, { min: 1, max: area.maxNumber, roundTo: k, exclude: [a, target] }, rng);
  return {
    format: "complement",
    a,
    target,
    prompt: "task.complement",
    display: `${formatNumber(a)} + ? = ${formatNumber(target)}`,
    choices,
    correctIndex,
    choiceTypes,
    solutionText: `${formatNumber(a)} + ${formatNumber(answer2)} = ${formatNumber(target)}`,
    extraMs: stage.extraMs ?? 0,
    timeClass: stage.time ?? null,
    // Regelwerk 5.5: Stufe 3 und 6 mittel; ohne Angabe die Grundzeit des Formats
    practiceKey: `complement:${a}:${target}`,
    ladder: "comp",
    stageId: stage.id,
    way: wayFor("comp", { a, target })
  };
}

// src/engine/math/formats/chain.js
var chain_exports = {};
__export(chain_exports, {
  generate: () => generate4
});
var drawRange2 = (r, rng) => r.min + (r.step ?? 1) * rng.nextInt(0, Math.floor((r.max - r.min) / (r.step ?? 1)));
function drawLinks(stage, rng) {
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const start = drawRange2(stage.start, rng);
    const links = [];
    let v = start;
    let ok = true;
    for (let i = 0; i < stage.links && ok; i++) {
      let link;
      if (i === 0 && stage.mulFirst) {
        const b = rng.pick(stage.mulFirst);
        link = { op: "mul", b, result: v * b };
      } else {
        const op = rng.nextUint32() % 2 === 0 ? "add" : "sub";
        const b = drawRange2(stage.plusMinus, rng);
        link = { op, b, result: op === "add" ? v + b : v - b };
      }
      ok = link.result >= stage.min && link.result <= stage.max;
      links.push({ ...link, from: v });
      v = link.result;
    }
    if (ok) return { start, links };
  }
  throw new Error("keine passende Kette gefunden");
}
function generate4(stage, area, rng) {
  const { start, links } = drawLinks(stage, rng);
  const steps = links.map((link, i) => {
    const { op, b, result, from } = link;
    const plusMinus2 = op !== "mul";
    const cands = mistakesFor(op, { mistakes: stage.linkMistakes[op] }, { a: from, b, result });
    const k = plusMinus2 ? commonRound(from, b) : 1;
    const { choices, correctIndex, choiceTypes } = pickChoices(result, cands, {
      min: plusMinus2 ? 0 : 1,
      max: area.maxNumber,
      roundTo: k,
      fillStep: plusMinus2 ? k : Math.min(calcPlace(result), 10)
    }, rng);
    return {
      prompt: "task.chain",
      promptParams: { n: i + 1, of: links.length },
      display: `${formatExpression(op, from, b)} = ?`,
      choices,
      correctIndex,
      choiceTypes,
      solutionText: formatEquation(op, from, b, result),
      practiceKey: `${op}:${from}:${b}`,
      ladder: "chain",
      stageId: stage.id,
      way: wayFor(op, { a: from, b })
    };
  });
  return {
    format: "chain",
    chain: { start, links: links.map(({ op, b, result }) => ({ op, b, result })) },
    steps,
    noTempo: true,
    extraMs: stage.extraMs ?? 0,
    practiceKey: `chain:${start}:${links.map((l) => `${l.op}${l.b}`).join(":")}`,
    ladder: "chain",
    stageId: stage.id
  };
}

// src/engine/math/formats/wall.js
var wall_exports = {};
__export(wall_exports, {
  generate: () => generate5
});
var HOW = {
  sum: [[3, "add", 0, 1], [4, "add", 1, 2], [5, "add", 3, 4]],
  oneBase: [[1, "sub", 3, 0], [4, "add", 1, 2], [5, "add", 3, 4]],
  fromTop: [[4, "sub", 5, 3], [1, "sub", 3, 0], [2, "sub", 4, 1]]
};
function generate5(stage, area, rng) {
  const u = stage.units ? rng.pick(stage.units) : stage.unit;
  const cells = drawUntil(() => {
    const [a, b, c] = [0, 1, 2].map(() => u * rng.nextInt(stage.baseMin, stage.baseMax));
    return [a, b, c, a + b, b + c, a + 2 * b + c];
  }, (w) => w[5] <= stage.topMax);
  const steps = HOW[stage.pattern].map(([cell, op, xi, yi]) => {
    const result = cells[cell];
    const [x, y] = [cells[xi], cells[yi]];
    const all = { "F-WALL-a": [result - u, result + u], "F-WALL-b": op === "sub" ? [x + y] : [], "F-WALL-c": [x, y] };
    const cands = stage.mistakes.flatMap((type) => all[type].map((value) => ({ value, type })));
    const { choices, correctIndex, choiceTypes } = pickChoices(result, cands, { min: 0, max: area.maxNumber, roundTo: commonRound(x, y) }, rng);
    return {
      prompt: "task.wall",
      display: null,
      cell,
      op,
      x,
      y,
      choices,
      correctIndex,
      choiceTypes,
      solutionText: formatEquation(op, x, y, result),
      practiceKey: `${op}:${x}:${y}`,
      ladder: "wall",
      stageId: stage.id,
      way: wayFor(op, { a: x, b: y })
    };
  });
  return {
    format: "wall",
    wall: { cells, hidden: HOW[stage.pattern].map(([cell]) => cell), pattern: stage.pattern },
    steps,
    noTempo: true,
    extraMs: stage.extraMs ?? 0,
    practiceKey: `wall:${cells.slice(0, 3).join(":")}:${stage.pattern}`,
    ladder: "wall",
    stageId: stage.id
  };
}

// src/engine/math/formats/match.js
var match_exports = {};
__export(match_exports, {
  generate: () => generate6
});
var OPS = ["add", "sub", "mul", "div"];
function generate6(stages, area, rng) {
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const items = OPS.map((op) => {
      const t2 = generateFromStage(op, stages[op], area, rng);
      return { expr: t2.prompt, result: t2.result, operation: op, a: t2.a, b: t2.b, stageId: t2.stageId, way: t2.way };
    });
    if (new Set(items.map((x) => x.result)).size < 4) continue;
    const ordered = rng.shuffle(items);
    const { choices } = placeCorrect(formatNumber(ordered[0].result), ordered.slice(1).map((x) => formatNumber(x.result)), rng);
    const steps = ordered.slice(0, 3).map((item) => ({
      prompt: "task.match",
      display: `${item.expr} = ?`,
      choices: choices.slice(),
      correctIndex: choices.indexOf(formatNumber(item.result)),
      solutionText: `${item.expr} = ${formatNumber(item.result)}`,
      practiceKey: `${item.operation}:${item.a}:${item.b}`,
      ladder: item.operation,
      stageId: item.stageId,
      way: item.way
    }));
    return {
      format: "match",
      match: { items: ordered.map(({ expr, result }) => ({ expr, result })) },
      steps,
      noTempo: true,
      practiceKey: `match:${ordered.map((x) => `${x.operation}${x.a}_${x.b}`).join(":")}`
    };
  }
  throw new Error("keine vier verschiedenen Ergebnisse gefunden");
}

// src/engine/math/formats/two-step.js
var two_step_exports = {};
__export(two_step_exports, {
  composeTwoStep: () => composeTwoStep,
  generate: () => generate7
});
function composeTwoStep(first, op2, c, area, rng) {
  const mid = first.result;
  const result = op2 === "add" ? mid + c : mid - c;
  const p = calcPlace(mid);
  const other = op2 === "add" ? mid - c : mid + c;
  const rest = pickWrong(result, [other, result + p, result - p].filter((n) => n !== mid), { min: 0, max: area.maxNumber, step: p }, rng).filter((n) => n !== mid);
  const wrong = [mid, ...rest].slice(0, 3);
  const { choices, correctIndex } = placeCorrect(formatNumber(result), wrong.map(formatNumber), rng);
  const text2 = `${formatNumber(first.a)} ${OPERATOR_SIGN[first.operation]} ${formatNumber(first.b)} ${OPERATOR_SIGN[op2]} ${formatNumber(c)}`;
  return {
    format: "twoStep",
    operation: first.operation,
    parts: { a: first.a, b: first.b, mid, op2, c, result },
    prompt: "task.twoStep",
    display: `${text2} = ?`,
    choices,
    correctIndex,
    solutionText: `${text2} = ${formatNumber(result)}`,
    practiceKey: `twoStep:${first.operation}:${first.a}:${first.b}:${op2}:${c}`
  };
}
function generate7(stages, area, rng, spec = {}) {
  const op = spec.operation ?? "add";
  for (let i = 0; i < MAX_TRIES; i++) {
    const first = { operation: op, ...LADDERS[op].drawStage(stages[op], rng) };
    const mid = first.result;
    const p = calcPlace(mid);
    const d0 = digitAt(mid, p);
    const op2 = rng.nextUint32() % 2 === 0 ? "add" : "sub";
    const maxDigit = op2 === "add" ? 9 - d0 : d0;
    if (maxDigit < 1) continue;
    const c = p * rng.nextInt(1, maxDigit);
    const result = op2 === "add" ? mid + c : mid - c;
    if (result < 1 || result > area.maxNumber) continue;
    return composeTwoStep(first, op2, c, area, rng);
  }
  throw new Error("keine passende Aufgabe mit zwei Schritten gefunden");
}

// src/engine/math/formats/point-before-line.js
var point_before_line_exports = {};
__export(point_before_line_exports, {
  generate: () => generate8
});
var SIGN = { add: "+", sub: "\u2212", mul: "\xB7", div: ":" };
var APPLY2 = { add: (x, y) => x + y, sub: (x, y) => x - y, mul: (x, y) => x * y, div: (x, y) => x / y };
var draw = (r, rng) => r.min + (r.step ?? 1) * rng.nextInt(0, Math.floor((r.max - r.min) / (r.step ?? 1)));
function drawDivision(stage, rng) {
  const from = rng.pick(stage.divFrom ?? ["facts"]);
  if (from === "facts") {
    const c = draw(stage.factors, rng);
    const q = draw(stage.factors, rng);
    return [c * q, c, q];
  }
  const s = rng.nextInt(2, 9);
  const t2 = 10 * rng.nextInt(2, 9);
  return rng.nextUint32() % 2 === 0 ? [s * t2, s, t2] : [s * t2, t2, s];
}
function finish(stage, area, rng, { a, op, b, c, result, text: text2, wrong, parts }) {
  const cands = stage.mistakes.flatMap((type) => (wrong[type] ?? []).map((v) => ({ value: v, type })));
  const fillStep = parts?.bracket && result % 10 === 0 ? 10 : 1;
  const { choices, correctIndex, choiceTypes } = pickChoices(result, cands, { min: 0, max: area.maxNumber, prefer: [stage.mistakes[0], 1], fillStep }, rng);
  return {
    format: "pointBeforeLine",
    operation: stage.point,
    parts: { a, op, point: stage.point, b, c, result, ...parts },
    prompt: "task.pointBeforeLine",
    display: `${text2} = ?`,
    choices,
    correctIndex,
    choiceTypes,
    solutionText: `${text2} = ${formatNumber(result)}`,
    practiceKey: `pointBeforeLine:${a}:${op}:${b}:${stage.point}:${c}${parts?.bracket ? `:${parts.aFirst ? "a" : "b"}` : ""}`,
    ladder: "pvs",
    stageId: stage.id,
    way: wayFor("pvs", { a, op, point: stage.point, b, c, ...parts })
  };
}
function point(stage, area, rng) {
  for (let i = 0; i < MAX_TRIES; i++) {
    const op = rng.pick(stage.ops);
    let b;
    let c;
    let value;
    if (stage.point === "mul") {
      b = draw(stage.factors, rng);
      c = draw(stage.factors, rng);
      value = b * c;
    } else [b, c, value] = drawDivision(stage, rng);
    const a = draw(stage.a, rng);
    const result = APPLY2[op](a, value);
    if (result < stage.resultMin || result > stage.resultMax) continue;
    const ltr = APPLY2[stage.point](APPLY2[op](a, b), c);
    const text2 = `${formatNumber(a)} ${SIGN[op]} ${formatNumber(b)} ${SIGN[stage.point]} ${formatNumber(c)}`;
    return finish(stage, area, rng, {
      a,
      op,
      b,
      c,
      result,
      text: text2,
      wrong: { "F-PVS-a": [ltr], "F-PVS-b": [value], "F-PVS-c": [result + 1, result - 1, result + 10, result - 10] }
    });
  }
  throw new Error("keine Punkt-vor-Strich-Aufgabe gefunden");
}
function bracketMul(stage, area, rng) {
  for (let i = 0; i < MAX_TRIES; i++) {
    const op = rng.pick(stage.ops);
    const b = draw(stage.inner, rng);
    const c = draw(stage.inner, rng);
    const inner = APPLY2[op](b, c);
    if (inner < stage.innerMin || inner > stage.innerMax) continue;
    const a = draw(stage.a, rng);
    const result = a * inner;
    if (result > stage.resultMax) continue;
    const aFirst = rng.nextUint32() % 2 === 0;
    const text2 = aFirst ? `${a} \xB7 (${b} ${SIGN[op]} ${c})` : `(${b} ${SIGN[op]} ${c}) \xB7 ${a}`;
    const ignore = aFirst ? APPLY2[op](a * b, c) : APPLY2[op](b, c * a);
    return finish(stage, area, rng, {
      a,
      op,
      b,
      c,
      result,
      text: text2,
      parts: { bracket: true, aFirst },
      wrong: { "F-KL-a": [ignore], "F-KL-b": [a * b], "F-KL-c": [result + 10, result - 10] }
    });
  }
  throw new Error("keine Klammeraufgabe gefunden");
}
function bracketDiv(stage, area, rng) {
  for (let i = 0; i < MAX_TRIES; i++) {
    const op = rng.pick(stage.ops);
    const a = draw(stage.a, rng);
    const result = draw(stage.quotient, rng);
    const inner = a * result;
    const c = draw(stage.inner, rng);
    const b = op === "add" ? inner - c : inner + c;
    const r = stage.inner;
    if (b < r.min || b > r.max || b % (r.step ?? 1) !== 0) continue;
    const text2 = `(${formatNumber(b)} ${SIGN[op]} ${formatNumber(c)}) : ${a}`;
    const ignore = APPLY2[op](b, c / a);
    return finish(stage, area, rng, {
      a,
      op,
      b,
      c,
      result,
      text: text2,
      parts: { bracket: true, aFirst: false },
      wrong: { "F-KL-a": [ignore], "F-KL-b": [b / a], "F-KL-c": [result + 10, result - 10] }
    });
  }
  throw new Error("keine Klammeraufgabe mit Geteilt gefunden");
}
function generate8(stage, area, rng) {
  const form = stage.form ?? "point";
  const task = form === "bracketMul" ? bracketMul(stage, area, rng) : form === "bracketDiv" ? bracketDiv(stage, area, rng) : point(stage, area, rng);
  task.extraMs = stage.extraMs ?? 0;
  return task;
}

// src/engine/math/formats/compare-terms.js
var compare_terms_exports = {};
__export(compare_terms_exports, {
  generate: () => generate9
});
function termFor(v, p, max, rng, avoid) {
  for (let i = 0; i < 200; i++) {
    const y = p === 1 ? rng.nextInt(2, 9) : p * rng.nextInt(1, 9);
    const useSub = rng.nextUint32() % 2 === 0;
    const text2 = useSub ? v + y <= max ? formatExpression("sub", v + y, y) : null : v - y >= 1 ? formatExpression("add", v - y, y) : null;
    if (text2 && !avoid.has(text2)) return text2;
  }
  return null;
}
function generate9(stages, area, rng) {
  const max = area.maxNumber;
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const base = LADDERS.mul.drawStage(stages.mul, rng);
    const v = base.result;
    const expr = formatExpression("mul", base.a, base.b);
    const p = calcPlace(v);
    const avoid = /* @__PURE__ */ new Set();
    const right = termFor(v, p, max, rng, avoid);
    if (!right) continue;
    avoid.add(right);
    const wrong = [];
    for (const d of rng.shuffle([p, -p, 2 * p, -2 * p, 10 * p, -10 * p])) {
      if (wrong.length === 3) break;
      const w = v + d;
      if (w < 1 || w > max) continue;
      const text2 = termFor(w, p, max, rng, avoid);
      if (!text2) continue;
      avoid.add(text2);
      wrong.push({ text: text2, value: w });
    }
    if (wrong.length < 3) continue;
    const { choices, correctIndex } = placeCorrect(right, wrong.map((x) => x.text), rng);
    const valueOf = new Map([[right, v], ...wrong.map((x) => [x.text, x.value])]);
    return {
      format: "compareTerms",
      prompt: "task.compareTerms",
      promptParams: { expr },
      value: v,
      values: choices.map((c) => valueOf.get(c)),
      choices,
      correctIndex,
      solutionText: `${expr} = ${right} = ${v}`,
      practiceKey: `compareTerms:mul:${base.a}:${base.b}`
    };
  }
  throw new Error("keine gleichwertige Rechnung gefunden");
}

// src/engine/math/formats/divisibility.js
var divisibility_exports = {};
__export(divisibility_exports, {
  generate: () => generate10
});
var draw2 = (r, rng) => r.min + (r.step ?? 1) * rng.nextInt(0, Math.floor((r.max - r.min) / (r.step ?? 1)));
function lures(x, n) {
  const s = String(x);
  const last = s.at(-1);
  const front = s.slice(0, -1);
  if (n === 2) return "13579".includes(last) && /[02468]/.test(front);
  if (n === 5) return !"05".includes(last) && /[05]/.test(front);
  return last === "5" || last !== "0" && front.includes("0");
}
function question(stage, rng) {
  if (stage.question === "by") {
    const n2 = rng.pick(stage.divisors);
    const right2 = drawUntil(() => draw2(stage.numbers, rng), (x) => x % n2 === 0);
    const fits3 = (x) => x % n2 === 0;
    return { q: { kind: "by", n: n2 }, right: right2, fits: fits3, lure: (x) => lures(x, n2), lureType: "F-TEIL-a" };
  }
  if (stage.question === "divisor") {
    const v = drawUntil(() => draw2(stage.factors, rng) * draw2(stage.factors, rng), (x) => x >= stage.valueMin && x <= stage.valueMax);
    const fits3 = (x) => v % x === 0;
    const right2 = drawUntil(() => draw2(stage.numbers, rng), fits3);
    return { q: { kind: "divisor", n: v }, right: right2, fits: fits3, lure: (x) => fits3(x + 1) || fits3(x - 1), lureType: "F-TEIL-b" };
  }
  const n = draw2(stage.base, rng);
  const fits2 = (x) => x % n === 0;
  const right = drawUntil(() => n * rng.nextInt(2, 10), (x) => x >= stage.numbers.min && x <= stage.numbers.max);
  return { q: { kind: "multiple", n }, right, fits: fits2, lure: (x) => fits2(x + 1) || fits2(x - 1), lureType: "F-TEIL-b" };
}
function generate10(stage, area, rng) {
  const { q, right, fits: fits2, lure, lureType } = question(stage, rng);
  const pool = [];
  for (let i = 0; i < 400 && pool.length < 3; i++) {
    const x = draw2(stage.numbers, rng);
    if (!fits2(x) && x !== right && !pool.some((p) => p.value === x) && lure(x)) pool.push({ value: x, type: lureType });
  }
  while (pool.length < 3) {
    const x = draw2(stage.numbers, rng);
    if (!fits2(x) && !pool.some((p) => p.value === x)) pool.push({ value: x, type: null });
  }
  const order = rng.shuffle([{ value: right, type: null }, ...pool]);
  const numbers = order.map((m) => m.value);
  const solution = q.kind === "divisor" ? `${q.n} : ${right} = ${q.n / right}` : q.kind === "multiple" ? `${right / q.n} \xB7 ${q.n} = ${right}` : `${formatNumber(right)} : ${q.n} = ${formatNumber(right / q.n)}`;
  return {
    format: "divisibility",
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
    ladder: "teil",
    stageId: stage.id,
    extraMs: stage.extraMs ?? 0
  };
}

// src/engine/math/generate.js
var FORMATS = { numberLine: number_line_exports, sequence: sequence_exports, complement: complement_exports, chain: chain_exports, wall: wall_exports, match: match_exports, twoStep: two_step_exports, pointBeforeLine: point_before_line_exports, compareTerms: compare_terms_exports, divisibility: divisibility_exports };
var OPERATIONS = ["add", "sub", "mul", "div"];
function wrongShown(op, stage, n, area, rng) {
  const plusMinus2 = op === "add" || op === "sub";
  const k = plusMinus2 ? commonRound(n.a, n.b) : 1;
  const ok = (v) => Number.isInteger(v) && v !== n.result && !(plusMinus2 && (v === n.a || v === n.b)) && v >= (plusMinus2 ? 0 : 1) && v <= area.maxNumber && v % k === 0;
  const cands = mistakesFor(op, stage, n).filter((m) => ok(m.value));
  const type = stage.mistakes.find((t2) => cands.some((m) => m.type === t2));
  if (!type) return null;
  const ofType = cands.filter((m) => m.type === type);
  const near = Math.min(...ofType.map((m) => Math.abs(m.value - n.result)));
  return rng.pick(ofType.filter((m) => Math.abs(m.value - n.result) === near)).value;
}
function buildPick(format, stages, area, rng) {
  const wantTrue = format === "pickTrue";
  const ops = OPERATIONS.filter((op) => stages[op]);
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const items = Array.from({ length: 4 }, () => {
      const operation = rng.pick(ops);
      return { operation, ...LADDERS[operation].drawStage(stages[operation], rng) };
    });
    const lhs = items.map((it) => formatExpression(it.operation, it.a, it.b));
    if (new Set(lhs).size < 4 || new Set(items.map((it) => taskKey(it.operation, it.a, it.b))).size < 4) continue;
    const shown = items.map((it, i) => i === 0 === wantTrue ? it.result : wrongShown(it.operation, stages[it.operation], it, area, rng));
    if (shown.includes(null)) continue;
    const texts = items.map((it, i) => formatEquation(it.operation, it.a, it.b, shown[i]));
    const target = items[0];
    const { choices, correctIndex } = placeCorrect(texts[0], texts.slice(1), rng);
    return {
      format,
      operation: target.operation,
      a: target.a,
      b: target.b,
      result: target.result,
      prompt: `task.${format}`,
      choices,
      correctIndex,
      solutionText: formatEquation(target.operation, target.a, target.b, target.result),
      practiceKey: `${target.operation}:${target.a}:${target.b}`
    };
  }
  throw new Error("keine vier verschiedenen Gleichungen gefunden");
}
function taskKey(operation, a, b) {
  const [x, y] = operation === "add" || operation === "mul" ? [Math.min(a, b), Math.max(a, b)] : [a, b];
  return `${operation}:${x}:${y}`;
}
var AVOID_TRIES = 60;
function generateFromStage(ladder3, stage, area, rng, avoid = null) {
  let n = LADDERS[ladder3].drawStage(stage, rng);
  for (let i = 0; avoid && avoid.has(taskKey(ladder3, n.a, n.b)) && i < AVOID_TRIES; i++) n = LADDERS[ladder3].drawStage(stage, rng);
  return taskFromNumbers(ladder3, stage, n, area, rng);
}
var APPLY3 = { add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => a / b };
function taskFromNumbers(ladder3, stage, { a, b }, area, rng) {
  const result = APPLY3[ladder3](a, b);
  const n = { a, b, result };
  const plusMinus2 = ladder3 === "add" || ladder3 === "sub";
  const { choices, correctIndex, choiceTypes } = pickChoices(result, mistakesFor(ladder3, stage, n), {
    min: plusMinus2 ? 0 : 1,
    max: area.maxNumber,
    roundTo: plusMinus2 ? commonRound(a, b) : 1,
    // Auffüllen bei Mal und Geteilt: an der Stelle des Ergebnisses (8000 → 7000, 9000, nicht 8010; Review 7b, B8)
    fillStep: plusMinus2 ? commonRound(a, b) : calcPlace(result),
    sameUnits: stage.sameUnits === true,
    prefer: stage.prefer ?? null,
    // Plus und Minus: keine der beiden Zahlen als Antwort (23 + 10 → nicht 23; Review 7b, B9)
    exclude: plusMinus2 ? [a, b] : []
  }, rng);
  return {
    format: "solve",
    operation: ladder3,
    a,
    b,
    result,
    prompt: formatExpression(ladder3, a, b),
    choices,
    correctIndex,
    choiceTypes,
    solutionText: formatEquation(ladder3, a, b, result),
    practiceKey: `${ladder3}:${a}:${b}`,
    ladder: ladder3,
    stageId: stage.id,
    timeClass: stage.time,
    way: wayFor(ladder3, { a, b })
    // Rechenweg nach einem Fehler (Regelwerk 8.1)
  };
}
var COMPOSITE = /* @__PURE__ */ new Set(["match", "compareTerms", "twoStep"]);
function generateTask(spec, area, rng) {
  const stages = spec.stages;
  if (!stages) throw new Error(`${spec.format}: Stufen des Aufgabenplans fehlen (spec.stages)`);
  if (spec.format === "solve") {
    if (!stages[spec.operation]) throw new Error(`Rechnung l\xF6sen: keine Stufe f\xFCr ${spec.operation}`);
    return generateFromStage(spec.operation, stages[spec.operation], area, rng, spec.avoid ?? null);
  }
  if (spec.format === "pickTrue" || spec.format === "pickFalse") return buildPick(spec.format, stages, area, rng);
  if (COMPOSITE.has(spec.format)) return FORMATS[spec.format].generate(stages, area, rng, spec);
  const ladder3 = FORMAT_LADDER[spec.format];
  if (!ladder3) throw new Error(`unbekanntes Aufgabenformat: ${spec.format}`);
  if (!stages[ladder3]) throw new Error(`${spec.format}: keine Stufe der Leiter ${ladder3} im Gebiet`);
  return FORMATS[spec.format].generate(stages[ladder3], area, rng, spec);
}

// src/engine/learning/learning.js
var ARITHMETIC = ["add", "sub", "mul", "div"];
var clamp = (n, [lo, hi]) => Math.min(hi, Math.max(lo, n));
function gradeOf(lernen, grade) {
  const key = String(grade);
  if (!lernen[key]) lernen[key] = { gebiete: {}, hoechste: {}, eingefuehrt: [] };
  return lernen[key];
}
function stageFor(lernen, grade, areaId, ladder3, win) {
  const g = gradeOf(lernen, grade);
  const area = g.gebiete[areaId] ?? (g.gebiete[areaId] = {});
  if (!area[ladder3]) {
    const known = Object.values(g.gebiete).map((a) => a[ladder3]?.stufe).filter((n) => Number.isInteger(n));
    area[ladder3] = { stufe: clamp(known.length ? Math.max(...known) : win[0], win), liste: "" };
  }
  area[ladder3].stufe = clamp(area[ladder3].stufe, win);
  return area[ladder3].stufe;
}
function recordAnswer(lernen, grade, areaId, ladder3, correct, win, cfg) {
  stageFor(lernen, grade, areaId, ladder3, win);
  const entry = gradeOf(lernen, grade).gebiete[areaId][ladder3];
  entry.liste = `${entry.liste}${correct ? "1" : "0"}`.slice(-cfg.listSize);
  const right = [...entry.liste].filter((c) => c === "1").length;
  const wrong = entry.liste.length - right;
  let change = null;
  if (entry.liste.length === cfg.listSize && right >= cfg.upCorrect && entry.stufe < win[1]) change = "up";
  else if (entry.liste.length >= cfg.downMin && wrong >= cfg.downWrong && entry.stufe > win[0]) change = "down";
  if (change) {
    entry.stufe += change === "up" ? 1 : -1;
    entry.liste = "";
  }
  return { stufe: entry.stufe, change };
}
function isIntroduced(lernen, grade, areaId) {
  return Boolean(lernen[String(grade)]?.eingefuehrt?.includes(areaId));
}
function markIntroduced(lernen, grade, areaId) {
  const g = gradeOf(lernen, grade);
  if (!g.eingefuehrt.includes(areaId)) g.eingefuehrt.push(areaId);
}
function noteHighest(lernen, grade, ladder3, stufe) {
  const g = gradeOf(lernen, grade);
  if ((g.hoechste[ladder3] ?? 0) >= stufe) return false;
  g.hoechste[ladder3] = stufe;
  return true;
}
function atTopEverywhere(lernen, grade, areaId, windows) {
  const area = lernen[String(grade)]?.gebiete?.[areaId];
  return ARITHMETIC.filter((l) => windows[l]).every((l) => area?.[l]?.stufe === windows[l][1]);
}
function mixCounts(lernen, grade, areaId) {
  const area = lernen[String(grade)]?.gebiete?.[areaId] ?? {};
  return Object.fromEntries(Object.entries(area).map(([ladder3, e]) => [ladder3, e.misch ?? 0]));
}
function saveMixCounts(lernen, grade, areaId, counts2, mixEvery) {
  const area = lernen[String(grade)]?.gebiete?.[areaId];
  if (!area || !mixEvery) return;
  for (const [ladder3, n] of Object.entries(counts2)) if (area[ladder3]) area[ladder3].misch = n % mixEvery;
}
function chooseSource({ stufe, win, count, mixEvery, practiceEvery = 0, practice = [] }, rng) {
  if (!mixEvery || count % mixEvery !== 0) {
    if (practiceEvery && count % practiceEvery === 0 && practice.length > 0) return { source: "practice", entry: practice[0] };
    return { source: "current", stufe };
  }
  if (practice.length > 0) return { source: "practice", entry: practice[0] };
  if (stufe > win[0]) return { source: "lower", stufe: rng.nextInt(win[0], stufe - 1) };
  return { source: "current", stufe };
}

// src/engine/cards/piles.js
function createPiles(cardIds, rng) {
  const cards = cardIds.map((cardId, i) => ({ uid: `c${i + 1}`, cardId }));
  return { draw: rng.shuffle(cards), hand: [], discard: [], exhausted: [] };
}
function drawCount(piles, n, rng) {
  const events = [];
  const drawn = [];
  for (let i = 0; i < n; i++) {
    if (piles.draw.length === 0) {
      if (piles.discard.length === 0) break;
      piles.draw = rng.shuffle(piles.discard);
      piles.discard = [];
      events.push({ type: "pilesShuffled", count: piles.draw.length });
    }
    const card = piles.draw.shift();
    piles.hand.push(card);
    drawn.push(card.uid);
  }
  if (drawn.length > 0) events.push({ type: "cardsDrawn", cardUids: drawn });
  return events;
}
function drawTo(piles, handSize, rng) {
  const missing = handSize - piles.hand.length;
  return missing > 0 ? drawCount(piles, missing, rng) : [];
}
function take(piles, uid) {
  const i = piles.hand.findIndex((c) => c.uid === uid);
  if (i < 0) throw new Error(`Karte ${uid} ist nicht auf der Hand`);
  return piles.hand.splice(i, 1)[0];
}
function moveToDiscard(piles, uid) {
  piles.discard.push(take(piles, uid));
}
function moveToExhausted(piles, uid) {
  piles.exhausted.push(take(piles, uid));
}

// src/engine/enemies/intents.js
function intentFor(enemy) {
  const step = enemy.pattern[enemy.patternIndex % enemy.pattern.length];
  return { type: step.type, amount: step.amount };
}
function advancePattern(enemy) {
  enemy.patternIndex = (enemy.patternIndex + 1) % enemy.pattern.length;
}

// src/engine/combat/tempo.js
function judgeTempo(elapsedMs, timeLimitMs, tempoConfig) {
  if (timeLimitMs === 0) return { result: "ok", tierId: "normal", multiplier: 1 };
  if (elapsedMs >= timeLimitMs) return { result: "timeout", tierId: null, multiplier: 0 };
  for (const tier of tempoConfig.tiers) {
    if (elapsedMs * tier.den <= timeLimitMs * tier.num) {
      return { result: "ok", tierId: tier.id, multiplier: tier.multiplier };
    }
  }
  return { result: "ok", tierId: "normal", multiplier: 1 };
}
function applyMultiplier(base, multiplier) {
  const tenths = Math.round(multiplier * 10);
  return Math.floor((base * tenths + 5) / 10);
}
function timeLimitFor(format, calm, moreTime, gameConfig, timeClass = null, extraMs = 0) {
  const factor = gameConfig.moreTime[moreTime];
  if (factor === void 0) throw new Error(`unbekannte Einstellung Mehr Zeit: ${moreTime}`);
  if (factor === 0) return 0;
  const base = timeClass ? gameConfig.timeClassMs[timeClass] : gameConfig.baseTimeMs[format];
  if (base === void 0) throw new Error(`keine Grundzeit f\xFCr ${timeClass ?? format}`);
  return Math.round((base + extraMs + calm * gameConfig.stats.calmMsPerPoint) * factor);
}

// src/engine/cards/effect.js
function maxCardLevel(def) {
  return 1 + (def?.upgrades?.length ?? 0);
}
function cardEffect(def, level = 1) {
  const upto = Math.min(Math.max(1, level), maxCardLevel(def)) - 1;
  let effect = def.effect;
  for (let i = 0; i < upto; i++) effect = { ...effect, ...def.upgrades[i] };
  return effect;
}

// src/engine/combat/combat.js
var REJECT_REASONS = ["phase", "card", "target", "energy", "immune", "shielded", "noImmunity", "cycleCount", "discards", "command"];
var reject = (reason) => [{ type: "rejected", reason }];
var clone = (o) => JSON.parse(JSON.stringify(o));
function resolveCurriculum(config, grade, areaId) {
  const area = curriculumOf(config, grade)?.areas?.[areaId];
  if (!area) throw new Error(`Gebiet ${areaId} fehlt im Lehrplan Klasse ${grade}`);
  return area;
}
function enemyType(config, typeId) {
  const t2 = config.enemies?.[typeId] ?? config.bosses?.bosses?.[typeId];
  if (!t2) throw new Error(`unbekannter Gegner: ${typeId}`);
  return t2;
}
function createCombat({ config, enemyTypeIds, hero, deck, moreTime = "off", areaId, level = 1, seed, untimedTasks = 0, grade = 3, forgiving = false, cardLevels: cardLevels2 = {}, enemyPower = 1, depthPower: depthPower2 = 1, deep = false, elite = null, taskPlan = null, rescue = false }) {
  const shuffleRng = createRng(deriveSeed(seed, "shuffle"));
  const ops = damageOperations(deck, config);
  const taskRng = createRng(deriveSeed(seed, "tasks"));
  const combat = {
    config,
    rng: { shuffle: shuffleRng, tasks: taskRng },
    area: resolveCurriculum(config, grade, areaId),
    curriculum: curriculumOf(config, grade),
    taskPlan: taskPlan ?? planWithoutLearning(curriculumOf(config, grade), areaId, level === 1 ? "intro" : "normal", grade),
    asked: /* @__PURE__ */ new Set(),
    // A-3: schon gestellte Rechnungen dieses Kampfs
    // Mischregel (Regelwerk 7.2): Aufgaben je Leiter. Der Zähler läuft über Kämpfe und Tauchgänge weiter
    // (Review 7b, B1: ein Kampf allein hat selten vier Aufgaben einer Leiter); das Spiel reicht den Stand
    // im Aufgabenplan herein und schreibt ihn nach jeder Aufgabe in den Spielstand.
    mixCount: { ...taskPlan?.mixCount ?? {} },
    usedPractice: /* @__PURE__ */ new Set(),
    // Übungsaufgaben, die in diesem Kampf schon dran waren
    level,
    moreTime,
    untimedLeft: untimedTasks,
    forgiving: Boolean(forgiving),
    phase: "player",
    turn: 0,
    hero: { hp: hero.hp, maxHp: hero.maxHp, strength: hero.strength ?? 0, calm: hero.calm ?? 0, block: 0, energy: 0, healBonus: hero.healBonus ?? 0 },
    discardsPerTurn: hero.discards ?? config.game.hero.discardsPerTurn,
    enemies: enemyTypeIds.map((typeId, i) => {
      const t2 = enemyType(config, typeId);
      const power = Math.round(enemyPower * depthPower2 * 100) / 100;
      const isElite = Boolean(elite) && i === 0;
      const hp = Math.round(t2.hp * power * (isElite ? config.elites.hpFactor : 1));
      return {
        uid: `e${i + 1}`,
        typeId,
        hp,
        maxHp: hp,
        block: 0,
        power,
        immune: t2.immune ?? null,
        immuneBroken: 0,
        pattern: t2.pattern,
        patternIndex: 0,
        shieldedBy: t2.shieldedBy ?? [],
        // Phase 5, Etappe 6: Bossregel, Kampfphasen, Schwächung durch die Tintenwolke
        rule: t2.rule ?? null,
        phases: t2.phases ?? (deep ? t2.deepPhases ?? [] : []),
        phase: 1,
        weak: null,
        elite: isElite ? { rule: elite, acts: 0, cfg: config.elites.rules[elite] } : null,
        ...rotationFor(t2.rule, ops)
      };
    }),
    piles: createPiles(deck, shuffleRng),
    discardsLeft: 0,
    pending: null,
    cycle: null,
    practiceLog: [],
    startEvents: [],
    cardLevels: { ...cardLevels2 },
    enemyPower,
    // Talente (Phase 9, Etappe 3): Handgröße, Obergrenze der Serie, zweite Luft (Leben, 0 = keine)
    handSize: hero.handSize ?? config.game.hero.handSize,
    streakMax: config.game.streak.maxBonus + (hero.streakMaxBonus ?? 0),
    secondWind: hero.secondWind ?? 0,
    streak: 0,
    // Serie richtiger Antworten in Folge (Etappe 8, M13); die Zeit wird nie kürzer
    rescueLeft: rescue ? 1 : 0,
    // Rettungsaufgabe (Phase 10): noch möglich in diesem Kampf
    rescue: null
    // laufende Rettung: { ops, index, right, wrong, stage, results, task }
  };
  for (const [e, index] of rotationPlan(combat, { first: true })) {
    e.rotation.index = index;
    e.immune = immuneAt(e, index);
  }
  combat.startEvents = startTurn(combat);
  if (hero.startBlock) combat.hero.block = hero.startBlock;
  if (hero.firstTurnEnergy) combat.hero.energy += hero.firstTurnEnergy;
  for (const e of combat.enemies) if (e.elite) combat.startEvents.push({ type: "eliteRule", enemyUid: e.uid, rule: e.elite.rule });
  return combat;
}
function damageOperations(deck, config) {
  return new Set(deck.map((id) => config.cards[id]).filter((d) => d?.task?.operation && /^(damage|poison)/.test(d.effect.type)).map((d) => d.task.operation));
}
function rotationFor(rule, ops) {
  if (rule?.type !== "rotatingImmunity") return {};
  const order = rule.order.filter((op) => [...ops].some((o) => o !== op));
  return order.length ? { rotation: { order, index: 0 }, immune: order[0] } : { rotation: null, immune: null };
}
var immuneAt = (e, index) => e.rotation.order[index % e.rotation.order.length];
function freeIndex(c, enemy, from, immuneOf) {
  const others = c.enemies.filter((o) => o !== enemy && alive(o));
  const taken = (op) => others.length > 0 && others.every((o) => immuneOf(o) === op);
  for (let i = from; i < from + enemy.rotation.order.length; i++) if (!taken(immuneAt(enemy, i))) return i;
  return from;
}
function rotationPlan(c, { first = false } = {}) {
  const plan = /* @__PURE__ */ new Map();
  const immuneOf = (o) => plan.has(o) ? immuneAt(o, plan.get(o)) : o.immune;
  for (const e of c.enemies) {
    if (e.rotation && alive(e)) plan.set(e, freeIndex(c, e, first ? e.rotation.index : e.rotation.index + 1, immuneOf));
  }
  return plan;
}
var nextImmune = (c, e, plan = rotationPlan(c)) => plan.has(e) ? immuneAt(e, plan.get(e)) : null;
function settleRotation(c) {
  const events = [];
  const moved = [];
  for (const [e, index] of rotationPlan(c, { first: true })) {
    if (index === e.rotation.index) continue;
    e.rotation.index = index;
    e.immune = immuneAt(e, index);
    const event = { type: "immunityRotated", enemyUid: e.uid, immune: e.immune, next: null };
    events.push(event);
    moved.push([e, event]);
  }
  if (moved.length) {
    const after = rotationPlan(c);
    for (const [e, event] of moved) event.next = nextImmune(c, e, after);
  }
  return events;
}
function startTurn(c) {
  c.turn += 1;
  const restored = [];
  const plan = c.turn > 1 ? rotationPlan(c) : /* @__PURE__ */ new Map();
  const rotated = [];
  for (const e of c.enemies) {
    if (e.immuneBroken > 0) {
      e.immuneBroken -= 1;
      if (e.immuneBroken === 0) restored.push({ type: "immunityRestored", enemyUid: e.uid });
    }
    if (plan.has(e)) {
      e.rotation.index = plan.get(e);
      e.immune = immuneAt(e, e.rotation.index);
      const event = { type: "immunityRotated", enemyUid: e.uid, immune: e.immune, next: null };
      restored.push(event);
      rotated.push([e, event]);
    }
  }
  if (rotated.length) {
    const after = rotationPlan(c);
    for (const [e, event] of rotated) event.next = nextImmune(c, e, after);
  }
  if (c.blockKeep > 0) c.blockKeep -= 1;
  else c.hero.block = 0;
  c.slowNext = 0;
  if (c.hero.thorns && --c.hero.thorns.turns <= 0) c.hero.thorns = null;
  c.hero.energy = c.config.game.hero.energy;
  c.discardsLeft = c.discardsPerTurn ?? c.config.game.hero.discardsPerTurn;
  c.phase = "player";
  return [...restored, { type: "turnStarted", turn: c.turn }, ...drawTo(c.piles, c.handSize ?? c.config.game.hero.handSize, c.rng.shuffle)];
}
var alive = (e) => e.hp > 0;
var levelOf = (c, cardId) => c.cardLevels[cardId] ?? 1;
var effectOf = (c, cardId) => cardEffect(c.config.cards[cardId], levelOf(c, cardId));
function streakBonus(c) {
  const st = c.config.game.streak;
  const next = c.streak + 1;
  if (next < st.from) return 0;
  return Math.min(c.streakMax ?? st.maxBonus, (next - st.from + 1) * st.bonusPerStep);
}
function setStreak(c, value, events) {
  if (c.streak === value) return;
  c.streak = value;
  events.push({ type: "streakChanged", streak: value });
}
var findHand = (c, uid) => c.piles.hand.find((k) => k.uid === uid);
function immuneTo(enemy, cardDef) {
  return Boolean(enemy.immune && enemy.immuneBroken === 0 && cardDef.task?.operation === enemy.immune);
}
function isShielded(c, enemy) {
  return enemy.shieldedBy.length > 0 && c.enemies.some((o) => o !== enemy && alive(o) && enemy.shieldedBy.includes(o.typeId));
}
function blockedReason(c, cardDef, target) {
  if (cardDef.cost > c.hero.energy) return "energy";
  if (cardDef.target === "enemy" && target) {
    if (cardDef.effect.type === "breakImmunity" && (!target.immune || target.immuneBroken > 0)) return "noImmunity";
    if (target.immune && target.immuneBroken === 0 && cardDef.task?.operation === target.immune) return "immune";
    if (isShielded(c, target)) return "shielded";
  }
  if (cardDef.target === "enemies" && cardDef.effect.type === "damageAll" && !c.enemies.some((e) => alive(e) && !isShielded(c, e) && !immuneTo(e, cardDef))) return "immune";
  return null;
}
function hit(unit, amount, floor = 0) {
  const blocked = Math.min(unit.block, amount);
  unit.block -= blocked;
  const rest = amount - blocked;
  const before = unit.hp;
  unit.hp = Math.max(floor, unit.hp - rest);
  return { amount: before - unit.hp, blocked };
}
function effectiveIntent(enemy) {
  let intent = intentFor(enemy);
  if (intent.type === "attack" && enemy.power && enemy.power !== 1) intent = { ...intent, amount: Math.round(intent.amount * enemy.power) };
  if (intent.type === "attack" && enemy.elite?.rule === "rage") intent = { ...intent, amount: intent.amount + Math.min(enemy.elite.cfg.max, enemy.elite.cfg.plus * enemy.elite.acts) };
  if (intent.type === "attack" && enemy.weak) return { ...intent, amount: Math.max(0, intent.amount - enemy.weak.amount) };
  return intent;
}
function checkPhase(enemy, events) {
  const next = enemy.phases[enemy.phase - 1];
  if (!next || !alive(enemy) || enemy.hp >= enemy.maxHp * next.belowHpPercent / 100) return;
  enemy.phase += 1;
  enemy.pattern = next.pattern;
  if (next.rule !== void 0) {
    enemy.rule = next.rule;
    if (enemy.rotation && next.rule?.type !== "rotatingImmunity") {
      enemy.rotation = null;
      enemy.immune = null;
    }
  }
  enemy.patternIndex = 0;
  events.push({ type: "bossPhase", enemyUid: enemy.uid, phase: enemy.phase });
}
function asStep(task) {
  const solve = task.format === "solve";
  return {
    format: task.format,
    prompt: solve ? "task.solveStep" : task.prompt,
    promptParams: task.promptParams ?? null,
    display: solve ? `${task.prompt} = ?` : task.display ?? null,
    choices: task.choices,
    correctIndex: task.correctIndex,
    solutionText: task.solutionText,
    practiceKey: task.practiceKey,
    // Leiter und Stufe für die Zählung der Lernübersicht (Phase 10); für die Lernstufe zählt der Schritt nicht (markCounts, hiddenFind)
    ladder: task.ladder ?? null,
    stageId: task.stageId ?? null,
    line: task.line,
    marks: task.marks,
    // eigene Zeit des Schritts (A-7): Zeitklasse und Zusatzzeit der Stufe, aus der er stammt
    timeClass: task.timeClass ?? null,
    extraMs: task.extraMs ?? 0,
    // Hilfe nach einem Fehler auch im Schritt (Review 7b, B6): Fehlertypen der Antworten und Rechenweg
    choiceTypes: task.choiceTypes ?? null,
    way: task.way ?? null
  };
}
function setStep(task, i) {
  const st = task.steps[i];
  task.stepIndex = i;
  task.stepFormat = st.format ?? task.format;
  task.stepTimeClass = "timeClass" in st ? st.timeClass : task.timeClass ?? null;
  task.stepExtraMs = st.extraMs ?? task.extraMs ?? 0;
  if (st.line) {
    task.line = st.line;
    task.marks = st.marks;
  }
  task.prompt = st.prompt;
  task.promptParams = st.promptParams ?? null;
  task.display = st.display ?? null;
  task.choices = st.choices;
  task.correctIndex = st.correctIndex;
  task.solutionText = st.solutionText;
  task.practiceKey = st.practiceKey ?? task.practiceKey;
  task.choiceTypes = st.choiceTypes ?? null;
  task.way = st.way ?? null;
  task.wrongChoices = [];
  task.usedChoices = task.format === "match" ? task.steps.slice(0, i).map((x) => x.correctIndex) : [];
}
function hitChain(c, amount, preferredUid = null) {
  const targets = c.enemies.filter((e) => alive(e) && !isShielded(c, e));
  if (targets.length === 0) return [];
  const target = targets.find((e) => e.uid === preferredUid) ?? targets.reduce((low, e) => e.hp < low.hp ? e : low);
  const r = hit(target, amount);
  const events = [{ type: "damageDealt", targetUid: target.uid, amount: r.amount, blocked: r.blocked }];
  if (!alive(target)) events.push({ type: "enemyDefeated", enemyUid: target.uid });
  checkPhase(target, events);
  return events;
}
function finishCard(c, def, pending) {
  if (def.exhaust) {
    moveToExhausted(c.piles, pending.cardUid);
    return [{ type: "cardExhausted", cardUid: pending.cardUid }];
  }
  moveToDiscard(c.piles, pending.cardUid);
  return [];
}
function afterCorrect(c, events) {
  c.pending = null;
  if (c.enemies.every((e) => !alive(e))) {
    c.phase = "won";
    events.push({ type: "combatWon" });
  } else {
    c.phase = "player";
  }
  return events;
}
function answerStep(c, outcome, choiceIndex) {
  const pending = c.pending;
  const task = pending.task;
  const def = c.config.cards[pending.cardId];
  const st = task.steps[task.stepIndex];
  const events = [{ type: "stepJudged", stepIndex: task.stepIndex, outcome, ladder: st.ladder ?? null, stageId: st.stageId ?? null, counts: Boolean(st.counts && !st.tried), first: !st.tried }];
  st.tried = true;
  if (outcome === "correct") {
    if (def.effect.type === "damagePerStep") {
      const fx = effectOf(c, pending.cardId);
      events.push(...hitChain(c, fx.amount + c.hero.strength * c.config.game.stats.strengthDamagePerPoint + streakBonus(c), pending.targetUid));
      if (c.enemies.every((e) => !alive(e))) {
        events.push({ type: "answerJudged", outcome: "correct", tierId: "normal", solutionText: task.solutionText, cardId: pending.cardId });
        setStreak(c, c.streak + 1, events);
        events.push(...finishCard(c, def, pending));
        return afterCorrect(c, events);
      }
    }
    if (task.stepIndex + 1 < task.steps.length) {
      setStep(task, task.stepIndex + 1);
      if (!task.untimed) task.timeLimitMs = Math.round(timeLimitFor(task.stepFormat, c.hero.calm, c.moreTime, c.config.game, task.stepTimeClass, task.stepExtraMs) * (task.slow ?? 1));
      events.push({ type: "stepOpened", stepIndex: task.stepIndex, task: clone(task) });
      return events;
    }
    events.push({ type: "answerJudged", outcome: "correct", tierId: "normal", solutionText: task.solutionText, cardId: pending.cardId });
    events.push(...applyCorrect(c, def, pending, task.multiplier ?? 1));
    setStreak(c, c.streak + 1, events);
    return afterCorrect(c, events);
  }
  if (task.freeLeft > 0) {
    task.freeLeft -= 1;
    if (choiceIndex >= 0) task.wrongChoices.push(choiceIndex);
    events.push({ type: "freeMistakeUsed", left: task.freeLeft });
    return events;
  }
  return [...events, ...resolveTask(c, outcome, null, 0, choiceIndex)];
}
function planStages(c) {
  return Object.fromEntries(Object.entries(c.taskPlan.stageOf).map(([ladder3, n]) => [ladder3, stageAt(c.curriculum, ladder3, n)]));
}
function ladderTask(c, spec) {
  if (spec.format !== "solve" || !LADDERS[spec.operation]) return null;
  const op = spec.operation;
  const n = c.taskPlan.stageOf[op];
  if (!n) return null;
  const win = c.taskPlan.windows[op];
  const src = mixSource(c, op, n, (c.taskPlan.practice ?? []).filter((p) => fitsPractice(c, op, win, p)));
  let task;
  if (src.source === "practice") {
    c.usedPractice.add(src.entry.key);
    const [, a, b] = src.entry.key.split(":").map(Number);
    task = taskFromNumbers(op, stageById(c.curriculum, src.entry.stufe), { a, b }, c.area, c.rng.tasks);
    task.practice = true;
    task.review = true;
  } else {
    task = generateFromStage(op, stageAt(c.curriculum, op, src.stufe), c.area, c.rng.tasks, c.asked);
    if (src.source === "lower") task.review = true;
  }
  task.stageRank = rankOf(c, op, task.stageId, win);
  c.asked.add(taskKey(task.operation, task.a, task.b));
  return task;
}
function rankOf(c, ladder3, stageId, win) {
  const n = c.curriculum.ladders[ladder3].stages.findIndex((s) => s.id === stageId) + 1;
  const stage = n > 0 ? n : c.taskPlan.stageOf[ladder3];
  const base = c.taskPlan.rankBase?.[ladder3];
  return base === void 0 ? stage - win[0] : Math.max(0, stage - base);
}
function mixSource(c, ladder3, n, practice = []) {
  c.mixCount[ladder3] = (c.mixCount[ladder3] ?? 0) + 1;
  return chooseSource({ stufe: n, win: c.taskPlan.windows[ladder3], count: c.mixCount[ladder3], mixEvery: c.taskPlan.mixEvery ?? 0, practiceEvery: c.taskPlan.practiceEvery ?? 0, practice }, c.rng.tasks);
}
var CALC_KEY = /^(add|sub|mul|div):(\d+):(\d+)$/;
function repeatKey(key) {
  const m = CALC_KEY.exec(key ?? "");
  return m ? taskKey(m[1], Number(m[2]), Number(m[3])) : key;
}
function repeatKeys(task) {
  return [task.practiceKey, ...(task.steps ?? []).map((st) => st.practiceKey)].filter(Boolean).map(repeatKey);
}
var isRepeat = (c, task) => repeatKeys(task).some((k) => c.asked.has(k));
var REPEAT_TRIES = 20;
function freshTask(c, make) {
  let task = make();
  for (let i = 0; i < REPEAT_TRIES && isRepeat(c, task); i++) task = make();
  return task;
}
function fitsPractice(c, op, win, p) {
  if (!p.key.startsWith(`${op}:`) || c.usedPractice.has(p.key) || c.asked.has(repeatKey(p.key))) return false;
  const i = c.curriculum.ladders[op].stages.findIndex((s) => s.id === p.stufe);
  return i + 1 >= win[0] && i + 1 <= win[1];
}
var COUNTED_FORMATS = /* @__PURE__ */ new Set(["solve", ...Object.keys(FORMAT_LADDER), "match"]);
var SINGLE_HITS = /* @__PURE__ */ new Set(["damage", "damageBlock", "damageTwo", "poison"]);
var DAMAGE_EFFECTS = /* @__PURE__ */ new Set(["damage", "damageBlock", "damageTwo", "damageAll"]);
function markCounts(c, task) {
  const current2 = (ladder3) => c.taskPlan.stageOf[ladder3] ? stageAt(c.curriculum, ladder3, c.taskPlan.stageOf[ladder3]).id : null;
  const ok = (x) => Boolean(c.taskPlan.countable && !task.review && !task.hiddenFind && COUNTED_FORMATS.has(task.format) && x.ladder && x.stageId === current2(x.ladder));
  if (task.steps) for (const st of task.steps) st.counts = ok(st);
  else task.counts = ok(task);
}
function playCard(c, { cardUid, targetUid }) {
  if (c.phase !== "player") return reject("phase");
  const card = findHand(c, cardUid);
  if (!card) return reject("card");
  const def = c.config.cards[card.cardId];
  let target = null;
  if (def.target === "enemy") {
    target = c.enemies.find((e) => e.uid === targetUid && alive(e));
    if (!target) return reject("target");
  }
  let chainTarget = null;
  if (def.effect.type === "damagePerStep" && targetUid != null) {
    chainTarget = c.enemies.find((e) => e.uid === targetUid && alive(e));
    if (!chainTarget) return reject("target");
  }
  const reason = blockedReason(c, def, target);
  if (reason) return reject(reason);
  c.hero.energy -= def.cost;
  const events = [{ type: "cardPlayed", cardUid, cardId: card.cardId, targetUid: target?.uid ?? null }];
  if (def.effect.type === "slowTime") {
    moveToDiscard(c.piles, cardUid);
    c.slowNext = def.effect.factor;
    events.push({ type: "timeSlowed", factor: def.effect.factor });
    return events;
  }
  if (def.effect.type === "cycle") {
    moveToDiscard(c.piles, cardUid);
    c.cycle = { required: Math.min(def.effect.discard, c.piles.hand.length), draw: def.effect.draw };
    c.phase = "cycle";
    return events;
  }
  const spec = { format: def.task.format, operation: def.task.operation, level: c.level, stages: planStages(c) };
  const alt = def.task.ifLadder;
  if (alt && c.taskPlan.stageOf[alt]) spec.format = Object.keys(FORMAT_LADDER).find((f) => FORMAT_LADDER[f] === alt);
  const rule = target?.rule ?? (def.target === "enemies" ? c.enemies.find((e) => alive(e) && !isShielded(c, e) && !immuneTo(e, def) && e.rule?.type === "taskModifier")?.rule : void 0);
  if (rule?.type === "taskModifier" && spec.format === "solve") spec.format = rule.format;
  const ownLadder = FORMAT_LADDER[spec.format];
  let review = false;
  if (ownLadder && c.taskPlan.stageOf[ownLadder] && !(rule?.type === "taskModifier")) {
    const src = mixSource(c, ownLadder, c.taskPlan.stageOf[ownLadder]);
    if (src.source === "lower") {
      spec.stages = { ...spec.stages, [ownLadder]: stageAt(c.curriculum, ownLadder, src.stufe) };
      review = true;
    }
  }
  let task = ladderTask(c, spec) ?? freshTask(c, () => generateTask(spec, c.area, c.rng.tasks));
  if (review) task.review = true;
  if (task.ladder && task.stageRank === void 0 && c.taskPlan.windows[task.ladder]) task.stageRank = rankOf(c, task.ladder, task.stageId, c.taskPlan.windows[task.ladder]);
  if (rule?.type === "hidden" && target && SINGLE_HITS.has(def.effect.type)) {
    const find = freshTask(c, () => generateTask({ format: rule.find, stages: spec.stages }, c.area, c.rng.tasks));
    const rest = task.steps ? task.steps.map((st) => ({ format: task.format, timeClass: task.timeClass ?? null, extraMs: task.extraMs ?? 0, ...st })) : [asStep(task)];
    task = { ...task, steps: [asStep(find), ...rest], noTempo: true, multiplier: rule.multiplier, hiddenFind: true, stepOffset: 1 };
  }
  for (const k of repeatKeys(task)) c.asked.add(k);
  markCounts(c, task);
  if (task.steps) {
    task.freeMistakes = def.task.freeMistakes ?? 0;
    task.freeLeft = task.freeMistakes;
    setStep(task, 0);
  }
  if (c.untimedLeft > 0) {
    task.timeLimitMs = 0;
    task.untimed = true;
    c.untimedLeft -= 1;
  } else {
    task.timeLimitMs = task.steps ? timeLimitFor(task.stepFormat, c.hero.calm, c.moreTime, c.config.game, task.stepTimeClass, task.stepExtraMs) : timeLimitFor(task.format, c.hero.calm, c.moreTime, c.config.game, task.timeClass ?? null, task.extraMs ?? 0);
  }
  if (c.slowNext && task.timeLimitMs > 0) {
    task.slow = c.slowNext;
    task.timeLimitMs = Math.round(task.timeLimitMs * task.slow);
    c.slowNext = 0;
  }
  if (c.forgiving) task.forgiving = true;
  c.pending = { cardUid, cardId: card.cardId, targetUid: target?.uid ?? chainTarget?.uid ?? null, task };
  c.phase = "task";
  events.push({ type: "taskOpened", task: clone(task) });
  return events;
}
function applyCorrect(c, def, pending, multiplier) {
  const events = [];
  const fx = effectOf(c, pending.cardId);
  const amountFor = (base, kind = DAMAGE_EFFECTS.has(fx.type) ? "damage" : fx.type) => c.config.game.tempo.appliesTo.includes(kind) ? applyMultiplier(base, multiplier) : base;
  const damageNow = () => amountFor(fx.amount + (fx.perStreak ?? 0) * c.streak + c.hero.strength * c.config.game.stats.strengthDamagePerPoint + streakBonus(c));
  const strike = (target, dmg) => {
    const r = hit(target, dmg);
    events.push({ type: "damageDealt", targetUid: target.uid, amount: r.amount, blocked: r.blocked });
    if (!alive(target)) events.push({ type: "enemyDefeated", enemyUid: target.uid });
    checkPhase(target, events);
  };
  if (fx.type === "damage" || fx.type === "damageBlock" || fx.type === "damageTwo") {
    const target = c.enemies.find((e) => e.uid === pending.targetUid);
    const dmg = damageNow();
    strike(target, dmg);
    if (fx.type === "damageBlock") {
      const block = amountFor(fx.block, "block");
      c.hero.block += block;
      events.push({ type: "blockGained", amount: block });
    }
    if (fx.type === "damageTwo") {
      const second = c.enemies.find((e) => e !== target && alive(e) && !isShielded(c, e) && !immuneTo(e, def));
      if (second) strike(second, dmg);
    }
  } else if (fx.type === "damageAll") {
    const dmg = damageNow();
    for (const e of c.enemies.filter((x) => alive(x) && !isShielded(c, x) && !immuneTo(x, def))) strike(e, dmg);
  } else if (fx.type === "poison") {
    const target = c.enemies.find((e) => e.uid === pending.targetUid);
    const amount = pending.task?.hiddenFind ? applyMultiplier(fx.amount, multiplier) : fx.amount;
    target.poison = { amount, turns: fx.turns };
    events.push({ type: "poisoned", enemyUid: target.uid, amount, turns: fx.turns });
  } else if (fx.type === "thorns") {
    c.hero.thorns = { amount: fx.amount, turns: fx.turns };
    events.push({ type: "thornsGained", amount: fx.amount, turns: fx.turns });
  } else if (fx.type === "draw") {
    events.push(...drawCount(c.piles, fx.amount, c.rng.shuffle));
  } else if (fx.type === "weaken") {
    const target = c.enemies.find((e) => e.uid === pending.targetUid);
    target.weak = { amount: fx.amount, turns: fx.turns };
    events.push({ type: "weakened", enemyUid: target.uid, amount: fx.amount, turns: fx.turns });
  } else if (fx.type === "block") {
    const amount = amountFor(fx.amount);
    c.hero.block += amount;
    if (fx.keep) c.blockKeep = Math.max(c.blockKeep ?? 0, fx.keep);
    events.push({ type: "blockGained", amount });
  } else if (fx.type === "energy") {
    c.hero.energy += fx.amount;
    events.push({ type: "energyGained", amount: fx.amount });
  } else if (fx.type === "buff") {
    c.hero.strength += fx.amount;
    events.push({ type: "buffGained", stat: fx.stat, amount: fx.amount });
  } else if (fx.type === "breakImmunity") {
    const target = c.enemies.find((e) => e.uid === pending.targetUid);
    target.immuneBroken = fx.turns;
    events.push({ type: "immunityBroken", enemyUid: target.uid, turns: fx.turns });
  } else if (fx.type === "heal") {
    const before = c.hero.hp;
    c.hero.hp = Math.min(c.hero.maxHp, c.hero.hp + amountFor(fx.amount + c.hero.healBonus));
    events.push({ type: "healed", amount: c.hero.hp - before });
  }
  if (def.exhaust) {
    moveToExhausted(c.piles, pending.cardUid);
    events.push({ type: "cardExhausted", cardUid: pending.cardUid });
  } else {
    moveToDiscard(c.piles, pending.cardUid);
  }
  return events;
}
function judgedFields(t2) {
  const tally = t2.ladder ?? (t2.format === "twoStep" ? t2.operation : null);
  return { ladder: t2.ladder ?? null, stageId: t2.stageId ?? null, counts: Boolean(t2.counts && !t2.steps), practiceKey: t2.practiceKey ?? null, practice: Boolean(t2.practice), review: Boolean(t2.review), single: !t2.steps, tally };
}
function mistakeHelp(t2, chosen) {
  const mistakeType = (chosen !== null && chosen >= 0 ? t2.choiceTypes?.[chosen] : null) ?? null;
  let way = t2.way ?? null;
  if ((mistakeType === "F-MUL-a" || mistakeType === "F-MUL-d") && Number.isInteger(t2.a) && Number.isInteger(t2.b)) {
    const nw = neighborWay(t2.a, t2.b, Number(String(t2.choices[chosen]).replace(/\D/g, "")));
    if (nw) way = nw;
  }
  const plusMinusMistake = /^F-(ADD|SUB)-/.test(mistakeType ?? "");
  const hintPlace = plusMinusMistake && Number.isInteger(t2.a) && Number.isInteger(t2.b) ? crossPlace(t2.operation, t2.a, t2.b) : null;
  return { mistakeType, way, hintPlace };
}
function resolveTask(c, outcome, tierId, multiplier, chosen = null) {
  const pending = c.pending;
  const def = c.config.cards[pending.cardId];
  c.pending = null;
  const t2 = pending.task;
  const events = [{ type: "answerJudged", outcome, tierId, solutionText: t2.solutionText, cardId: pending.cardId, ...judgedFields(t2) }];
  if (outcome !== "correct") Object.assign(events[0], mistakeHelp(t2, chosen));
  if (outcome === "correct") {
    events.push(...applyCorrect(c, def, pending, multiplier));
    setStreak(c, c.streak + 1, events);
    if (c.enemies.every((e) => !alive(e))) {
      c.phase = "won";
      events.push({ type: "combatWon" });
    } else {
      c.phase = "player";
    }
    return events;
  }
  moveToDiscard(c.piles, pending.cardUid);
  c.phase = "feedback";
  if (pending.task.forgiving) {
    events.push({ type: "forgivenMistake" });
    return events;
  }
  setStreak(c, 0, events);
  const p = c.config.game.penalty;
  const r = hit(c.hero, outcome === "timeout" ? p.timeout : p.wrong, p.minHp);
  events.push({ type: "selfDamage", amount: r.amount, blocked: r.blocked });
  c.practiceLog.push(pending.task.practiceKey);
  return events;
}
function answer(c, { choiceIndex, elapsedMs }) {
  if (c.phase === "rescue") return rescueAnswer(c, choiceIndex);
  if (c.phase !== "task") return reject("phase");
  const task = c.pending.task;
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= task.choices.length) return reject("command");
  if (typeof elapsedMs !== "number" || !Number.isFinite(elapsedMs)) return reject("command");
  elapsedMs = Math.max(0, elapsedMs);
  const tempo = judgeTempo(elapsedMs, task.timeLimitMs, c.config.game.tempo);
  if (task.steps) {
    if ((task.usedChoices ?? []).includes(choiceIndex) || task.wrongChoices.includes(choiceIndex)) return reject("card");
    const outcome = tempo.result === "timeout" ? "timeout" : choiceIndex === task.correctIndex ? "correct" : "wrong";
    return answerStep(c, outcome, outcome === "timeout" ? -1 : choiceIndex);
  }
  if (tempo.result === "timeout") return resolveTask(c, "timeout", null, 0);
  if (choiceIndex !== task.correctIndex) return resolveTask(c, "wrong", null, 0, choiceIndex);
  return resolveTask(c, "correct", tempo.tierId, tempo.multiplier);
}
function timeout(c) {
  if (c.phase !== "task") return reject("phase");
  if (c.pending.task.steps) return answerStep(c, "timeout", -1);
  return resolveTask(c, "timeout", null, 0);
}
function acknowledgeFeedback(c) {
  if (c.phase === "rescue") {
    if (c.rescue.stage !== "feedback") return reject("phase");
    return rescueDecided(c) ? finishRescue(c) : openRescueTask(c);
  }
  if (c.phase !== "feedback") return reject("phase");
  c.phase = "player";
  return [{ type: "feedbackClosed" }];
}
function confirmCycle(c, { cardUids }) {
  if (c.phase !== "cycle") return reject("phase");
  const uids = Array.isArray(cardUids) ? cardUids : [];
  if (uids.length !== c.cycle.required || new Set(uids).size !== uids.length) return reject("cycleCount");
  if (!uids.every((u) => findHand(c, u))) return reject("card");
  const events = [];
  for (const uid of uids) {
    moveToDiscard(c.piles, uid);
    events.push({ type: "cardDiscarded", cardUid: uid });
  }
  events.push(...drawCount(c.piles, c.cycle.draw, c.rng.shuffle));
  c.cycle = null;
  c.phase = "player";
  return events;
}
function discard(c, { cardUid }) {
  if (c.phase !== "player") return reject("phase");
  if (c.discardsLeft <= 0) return reject("discards");
  if (!findHand(c, cardUid)) return reject("card");
  moveToDiscard(c.piles, cardUid);
  c.discardsLeft -= 1;
  return [{ type: "cardDiscarded", cardUid }];
}
function endTurn(c) {
  if (c.phase !== "player") return reject("phase");
  const events = [];
  for (const enemy of c.enemies) {
    if (!alive(enemy)) continue;
    enemy.block = 0;
    const intent = effectiveIntent(enemy);
    events.push({ type: "enemyActed", enemyUid: enemy.uid, intent });
    let thorned = false;
    if (intent.type === "attack") {
      const r = hit(c.hero, intent.amount);
      events.push({ type: "heroDamaged", amount: r.amount, blocked: r.blocked });
      if (c.hero.thorns && !isShielded(c, enemy)) {
        const t2 = hit(enemy, c.hero.thorns.amount);
        events.push({ type: "thornsHit", enemyUid: enemy.uid, amount: t2.amount });
        if (!alive(enemy)) events.push({ type: "enemyDefeated", enemyUid: enemy.uid });
        else thorned = true;
      }
    } else if (intent.type === "block") {
      enemy.block += intent.amount;
    }
    if (alive(enemy)) {
      advancePattern(enemy);
      if (thorned) checkPhase(enemy, events);
      if (enemy.elite) {
        enemy.elite.acts += 1;
        const { rule, cfg, acts } = enemy.elite;
        if (rule === "guard" && acts % cfg.every === 0) {
          enemy.block += cfg.block;
          events.push({ type: "eliteGuard", enemyUid: enemy.uid, block: cfg.block });
        }
        if (rule === "regen" && enemy.hp < enemy.maxHp) {
          const healed = Math.min(cfg.heal, enemy.maxHp - enemy.hp);
          enemy.hp += healed;
          events.push({ type: "eliteRegen", enemyUid: enemy.uid, healed });
        }
      }
      if (enemy.poison) {
        const lost = Math.min(enemy.hp, enemy.poison.amount);
        enemy.hp -= lost;
        events.push({ type: "poisonTick", enemyUid: enemy.uid, amount: lost });
        if (!alive(enemy)) events.push({ type: "enemyDefeated", enemyUid: enemy.uid });
        else checkPhase(enemy, events);
        if (enemy.poison && --enemy.poison.turns <= 0) enemy.poison = null;
      }
      if (enemy.weak && --enemy.weak.turns <= 0) {
        enemy.weak = null;
        events.push({ type: "weakEnded", enemyUid: enemy.uid });
      }
    }
    if (c.hero.hp <= 0 && c.secondWind > 0) {
      c.hero.hp = c.secondWind;
      c.secondWind = 0;
      events.push({ type: "secondWind", hp: c.hero.hp });
    }
    if (c.hero.hp <= 0 && c.rescueLeft > 0) {
      events.push(...startRescue(c));
      return events;
    }
    if (c.hero.hp <= 0) {
      c.phase = "lost";
      events.push({ type: "combatLost" });
      return events;
    }
  }
  if (c.enemies.every((e) => !alive(e))) {
    c.phase = "won";
    events.push({ type: "combatWon" });
    return events;
  }
  events.push(...startTurn(c));
  return events;
}
var RESCUE_OPS = ["add", "sub", "mul", "div"];
function startRescue(c) {
  const cfg = c.config.game.rescue;
  c.rescueLeft = 0;
  const pool = RESCUE_OPS.filter((op) => c.taskPlan.stageOf?.[op]);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = c.rng.tasks.nextInt(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const ops = Array.from({ length: cfg.tasks }, (_, i) => pool[i % pool.length]);
  c.rescue = { ops, index: -1, right: 0, wrong: 0, stage: "task", results: [], task: null };
  c.phase = "rescue";
  const opened = openRescueTask(c);
  return [{ type: "rescueStarted", task: opened[0].task, total: cfg.tasks, needed: cfg.needed }];
}
function openRescueTask(c) {
  const r = c.rescue;
  r.index += 1;
  const op = r.ops[r.index];
  const task = generateFromStage(op, stageAt(c.curriculum, op, c.taskPlan.stageOf[op]), c.area, c.rng.tasks, c.asked);
  c.asked.add(taskKey(task.operation, task.a, task.b));
  task.timeLimitMs = 0;
  task.untimed = true;
  task.rescue = true;
  if (c.taskPlan.windows?.[op]) task.stageRank = rankOf(c, op, task.stageId, c.taskPlan.windows[op]);
  r.task = task;
  r.stage = "task";
  return [{ type: "rescueTaskOpened", task: clone(task) }];
}
function rescueDecided(c) {
  const { right, wrong } = c.rescue;
  const cfg = c.config.game.rescue;
  return right >= cfg.needed || wrong > cfg.tasks - cfg.needed;
}
function rescueAnswer(c, choiceIndex) {
  const r = c.rescue;
  if (r.stage !== "task") return reject("phase");
  const t2 = r.task;
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= t2.choices.length) return reject("command");
  const correct = choiceIndex === t2.correctIndex;
  if (correct) r.right += 1;
  else r.wrong += 1;
  r.results.push(correct ? "right" : "wrong");
  const help = correct ? { mistakeType: null, way: null, hintPlace: null } : mistakeHelp(t2, choiceIndex);
  const events = [{
    type: "rescueJudged",
    outcome: correct ? "correct" : "wrong",
    solutionText: t2.solutionText,
    ...help,
    practiceKey: t2.practiceKey ?? null,
    stageId: t2.stageId ?? null,
    right: r.right,
    wrong: r.wrong
  }];
  if (!correct) {
    r.stage = "feedback";
    return events;
  }
  events.push(...rescueDecided(c) ? finishRescue(c) : openRescueTask(c));
  return events;
}
function finishRescue(c) {
  const cfg = c.config.game.rescue;
  const saved = c.rescue.right >= cfg.needed;
  c.rescue = null;
  if (!saved) {
    c.hero.hp = 0;
    c.phase = "lost";
    return [{ type: "rescueEnded", saved: false, outcome: "failed", hp: 0 }, { type: "combatLost" }];
  }
  c.hero.hp = Math.max(1, Math.ceil(c.hero.maxHp * cfg.hpShare));
  const events = [{ type: "rescueEnded", saved: true, outcome: "saved", hp: c.hero.hp }];
  if (c.enemies.every((e) => !alive(e))) {
    c.phase = "won";
    events.push({ type: "combatWon" });
    return events;
  }
  c.phase = "player";
  events.push(...startTurn(c));
  return events;
}
var HANDLERS = { playCard, answer, timeout, acknowledgeFeedback, confirmCycle, discard, endTurn };
function combatDispatch(combat, command) {
  if (combat.phase === "won" || combat.phase === "lost") return reject("phase");
  const handler = HANDLERS[command?.type];
  if (!handler) return reject("command");
  const events = handler(combat, command);
  if (combat.phase !== "won" && combat.phase !== "lost" && events.some((e) => e.type === "enemyDefeated")) events.push(...settleRotation(combat));
  return events;
}
function combatView(combat, { targetUid } = {}) {
  const c = combat;
  const target = c.enemies.find((e) => e.uid === targetUid && alive(e)) ?? null;
  const rotation = rotationPlan(c);
  return {
    phase: c.phase,
    turn: c.turn,
    hero: { ...c.hero, streak: c.streak },
    current: c.enemyPower,
    // Strömung (D33)
    discardsLeft: c.discardsLeft,
    enemies: c.enemies.map((e) => ({
      uid: e.uid,
      typeId: e.typeId,
      hp: e.hp,
      maxHp: e.maxHp,
      block: e.block,
      immune: e.immune,
      immuneBroken: e.immuneBroken,
      alive: alive(e),
      shielded: isShielded(c, e),
      intent: alive(e) ? effectiveIntent(e) : null,
      rule: e.rule?.type ?? null,
      phase: e.phase,
      weakTurns: e.weak?.turns ?? 0,
      nextImmune: nextImmune(c, e, rotation),
      // Tauschkrebs: Zeichen für die nächste Runde
      elite: e.elite?.rule ?? null,
      // Phase 9
      poisonTurns: e.poison?.turns ?? 0
    })),
    hand: c.piles.hand.map((k) => {
      const def = c.config.cards[k.cardId];
      const reason = c.phase === "player" ? blockedReason(c, def, def.target === "enemy" ? target : null) : "phase";
      return { uid: k.uid, cardId: k.cardId, cost: def.cost, level: levelOf(c, k.cardId), playable: reason === null, blockedReason: reason };
    }),
    piles: { draw: c.piles.draw.length, discard: c.piles.discard.length, exhausted: c.piles.exhausted.length },
    task: c.phase === "task" ? c.pending.task : null,
    // Rettungsaufgabe (Phase 10): offene Aufgabe, Stand und Ergebnis der beantworteten Aufgaben
    rescue: c.phase === "rescue" ? {
      task: c.rescue.task,
      index: c.rescue.index,
      total: c.config.game.rescue.tasks,
      needed: c.config.game.rescue.needed,
      right: c.rescue.right,
      wrong: c.rescue.wrong,
      stage: c.rescue.stage,
      results: c.rescue.results.slice()
    } : null,
    cycleRequired: c.phase === "cycle" ? c.cycle.required : null
  };
}

// src/engine/dungeon/riddle.js
function createRiddle({ config, save, curriculumId, areaId = curriculumId, runSeed, roomId, stufe: saved }) {
  const rng = createRng(deriveSeed(runSeed, `riddle:${roomId}`));
  const { format, ladder: ladder3 } = rng.pick(config.riddles.formats);
  const cur = curriculumOf(config, save.klasse);
  const win = cur.windows[curriculumId][ladder3];
  const stufe = saved ?? (config.game.learning.enabled ? stageFor(save.lernen, save.klasse, areaId, ladder3, win) : stageWithoutLearning(win, "normal"));
  const task = generateTask({ format, stages: { [ladder3]: stageAt(cur, ladder3, stufe) } }, resolveCurriculum(config, save.klasse, curriculumId), rng);
  return { roomId, format, ladder: ladder3, win, stufe, task, steps: task.steps ?? [task] };
}

// src/engine/progression/statistics.js
var LAST_ANSWERS = 10;
var pad = (n) => String(n).padStart(2, "0");
function dayKey(now, tzOffsetMinutes = 0) {
  const z = Math.floor((now - tzOffsetMinutes * 6e4) / 864e5) + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${y}-${pad(m)}-${pad(d)}`;
}
function stats(save) {
  if (!save.statistik) save.statistik = { tage: 0, lauf: {}, antwort: {}, letzte: {} };
  return save.statistik;
}
function noteDay(save, now, tzOffsetMinutes = 0) {
  if (!Number.isFinite(now) || !Number.isFinite(tzOffsetMinutes)) return;
  const st = stats(save);
  const day = dayKey(now, tzOffsetMinutes);
  if (st.tag !== day) {
    st.tage += 1;
    st.tag = day;
  }
}
function noteDive(save, areaId, now, tzOffsetMinutes = 0) {
  noteDay(save, now, tzOffsetMinutes);
  stats(save).gebiet = areaId;
}
function noteRun(save, areaId, depth, won) {
  const area = stats(save).lauf[areaId] ??= {};
  const rec = area[String(depth)] ??= [0, 0];
  rec[won ? 0 : 1] += 1;
}
function noteRescue(save, saved) {
  const st = stats(save);
  const rec = st.rettung ??= [0, 0];
  rec[saved ? 0 : 1] += 1;
}
var OUTCOME_SLOT = { correct: 0, wrong: 1, timeout: 2 };
function noteAnswer(save, ladder3, outcome) {
  const slot = OUTCOME_SLOT[outcome];
  if (slot === void 0 || !ladder3) return;
  const st = stats(save);
  const sums = st.antwort[ladder3] ??= [0, 0, 0];
  sums[slot] += 1;
  st.letzte[ladder3] = `${st.letzte[ladder3] ?? ""}${slot === 0 ? "1" : "0"}`.slice(-LAST_ANSWERS);
}
var isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
var isCount = (n) => Number.isInteger(n) && n >= 0;
var counts = (a, n) => Array.isArray(a) && a.length === n && a.every(isCount);
function validateStatistics(st, config, fail) {
  if (!isObj(st)) {
    fail("statistik", "Objekt");
    return;
  }
  const areas = new Set(config.areas.order);
  const ladders = /* @__PURE__ */ new Set([...Object.keys(config.class3?.ladders ?? {}), ...Object.keys(config.class4?.ladders ?? {})]);
  if (!isCount(st.tage)) fail("statistik.tage", "ganze Zahl \u2265 0");
  if (st.tag !== void 0 && !(typeof st.tag === "string" && /^\d{4}-\d{2}-\d{2}$/.test(st.tag))) fail("statistik.tag", "Datum JJJJ-MM-TT");
  if (st.gebiet !== void 0 && !areas.has(st.gebiet)) fail("statistik.gebiet", "bekanntes Gebiet");
  if (!isObj(st.lauf)) fail("statistik.lauf", "Objekt");
  else {
    for (const [areaId, depths] of Object.entries(st.lauf)) {
      if (!areas.has(areaId) || !isObj(depths)) {
        fail(`statistik.lauf.${areaId}`, "bekanntes Gebiet mit Tiefen");
        continue;
      }
      for (const [d, rec] of Object.entries(depths)) {
        if (!/^[1-9]\d*$/.test(d) || !counts(rec, 2)) fail(`statistik.lauf.${areaId}.${d}`, "Tiefe \u2265 1 mit [geschafft, verloren]");
      }
    }
  }
  if (st.rettung !== void 0 && !counts(st.rettung, 2)) fail("statistik.rettung", "[geschafft, nicht geschafft] als ganze Zahlen \u2265 0");
  for (const key of ["antwort", "letzte"]) {
    if (!isObj(st[key])) {
      fail(`statistik.${key}`, "Objekt");
      continue;
    }
    for (const [ladder3, v] of Object.entries(st[key])) {
      if (!ladders.has(ladder3)) fail(`statistik.${key}.${ladder3}`, "bekannte Leiter");
      else if (key === "antwort" && !counts(v, 3)) fail(`statistik.antwort.${ladder3}`, "[richtig, falsch, Zeit abgelaufen]");
      else if (key === "letzte" && !(typeof v === "string" && v.length <= LAST_ANSWERS && /^[01]*$/.test(v))) fail(`statistik.letzte.${ladder3}`, `h\xF6chstens ${LAST_ANSWERS} Zeichen aus 0 und 1`);
    }
  }
}

// src/engine/progression/mission.js
var OPS2 = ["add", "sub", "mul", "div"];
var ARTS = ["uebung", "rechenart", "serie"];
function solveOps(save, config) {
  return new Set(Object.keys(save.deck ?? {}).map((id) => config.cards[id]?.task).filter((t2) => t2?.format === "solve" && t2.operation).map((t2) => t2.operation));
}
function usablePractice(save, config) {
  const cur = curriculumOf(config, save.klasse);
  const ops = solveOps(save, config);
  const open = Object.keys(save.gebiete ?? {}).filter((id) => save.gebiete[id]?.offen && cur.windows?.[id]);
  return Object.entries(save.uebung ?? {}).filter(([key, e]) => {
    const op = key.split(":")[0];
    if (!e?.stufe || !OPS2.includes(op) || !ops.has(op)) return false;
    const n = (cur.ladders?.[op]?.stages ?? []).findIndex((s) => s.id === e.stufe) + 1;
    return n > 0 && open.some((id) => {
      const w = cur.windows[id][op];
      return w && n >= w[0] && n <= w[1];
    });
  }).length;
}
function chooseMission(save, config, day) {
  const cfg = config.game.mission;
  const base = { tag: day, stand: 0, geschafft: false, gemeldet: false };
  if (config.game.learning.enabled && usablePractice(save, config) >= cfg.goals.uebung) {
    return { tag: day, art: "uebung", ziel: cfg.goals.uebung, stand: 0, geschafft: false, gemeldet: false };
  }
  const ops = solveOps(save, config);
  let best = null;
  let most = 2;
  for (const op of OPS2) {
    if (!ops.has(op)) continue;
    const zeros = [...save.statistik?.letzte?.[op] ?? ""].filter((x) => x === "0").length;
    if (zeros > most) {
      best = op;
      most = zeros;
    }
  }
  if (best) return { tag: day, art: "rechenart", leiter: best, ziel: cfg.goals.rechenart, ...base };
  return { tag: day, art: "serie", ziel: cfg.goals.serie, ...base };
}
function ensureMission(save, config, now, tzOffsetMinutes = 0) {
  if (save && !config.game.mission?.enabled) {
    delete save.auftrag;
    return false;
  }
  if (!save || !Number.isFinite(now) || !Number.isFinite(tzOffsetMinutes)) return false;
  const day = dayKey(now, tzOffsetMinutes);
  if (save.auftrag?.tag === day) return false;
  save.auftrag = chooseMission(save, config, day);
  return true;
}
function noteMission(save, config, kind, { ladder: ladder3 = null, correct = false } = {}, day = null) {
  const m = save.auftrag;
  if (!m || m.geschafft || !config.game.mission?.enabled || day !== null && day !== m.tag) return [];
  if (m.art === "uebung" && kind === "practice" && correct) m.stand += 1;
  else if (m.art === "rechenart" && kind === "ladder" && correct && ladder3 === m.leiter) m.stand += 1;
  else if (m.art === "serie" && kind === "answer") m.stand = correct ? m.stand + 1 : 0;
  else return [];
  if (m.stand < m.ziel) return [];
  m.geschafft = true;
  const reward = config.game.mission.reward;
  save.perlen += reward;
  return [{ type: "missionDone", reward }];
}
function missionPracticeEvery(save, config) {
  const m = save.auftrag;
  return m && config.game.mission?.enabled && m.art === "uebung" && !m.geschafft ? config.game.mission.practiceEvery : 0;
}
var isCount2 = (n) => Number.isInteger(n) && n >= 0;
function validateMission(m, config, fail) {
  if (m === null || typeof m !== "object" || Array.isArray(m)) {
    fail("auftrag", "Objekt");
    return;
  }
  if (!(typeof m.tag === "string" && /^\d{4}-\d{2}-\d{2}$/.test(m.tag))) fail("auftrag.tag", "Datum JJJJ-MM-TT");
  if (!ARTS.includes(m.art)) fail("auftrag.art", ARTS.join(", "));
  if (m.art === "rechenart" ? !OPS2.includes(m.leiter) : m.leiter !== void 0) fail("auftrag.leiter", "Rechenart nur beim Auftrag rechenart");
  if (!(Number.isInteger(m.ziel) && m.ziel >= 1)) fail("auftrag.ziel", "ganze Zahl \u2265 1");
  if (!isCount2(m.stand)) fail("auftrag.stand", "ganze Zahl \u2265 0");
  for (const k of ["geschafft", "gemeldet"]) if (typeof m[k] !== "boolean") fail(`auftrag.${k}`, "true oder false");
}

// src/engine/save/save.js
var SAVE_VERSION = 14;
var MIX_COUNT_MAX = 100;
var SLOTS = ["kopf", "koerper", "hand"];
var STATS = ["kraft", "ruhe", "leben"];
function createSave(now, grade, config, hero = null) {
  const deck = {};
  for (const id of config.decks.starter) deck[id] = (deck[id] ?? 0) + 1;
  const areaIds = config.areas.order;
  const gebiete = Object.fromEntries(areaIds.map((id, i) => [id, { offen: i === 0, geschafft: false, tiefe: 0 }]));
  return {
    version: SAVE_VERSION,
    angelegt: now,
    geaendert: now,
    klasse: grade,
    held: hero ? { figur: hero.figur, nameA: hero.nameA, nameB: hero.nameB } : { figur: Object.keys(config.heroes.figures)[0], nameA: 0, nameB: 0 },
    stufe: 1,
    ep: 0,
    punkte: { kraft: 0, ruhe: 0, leben: 0 },
    deck,
    perlen: 0,
    gebiete,
    lauf: null,
    uebung: {},
    erklaert: {},
    einstellung: { mehrZeit: "off", ton: true, musik: true, wenigBewegung: false, lautstaerke: config.sounds.defaultVolume },
    ausruestung: { besitz: [], angelegt: { kopf: null, koerper: null, hand: null } },
    karten: {},
    stroemung: 1,
    // Strömung (D33/D34)
    antworten: [],
    // letzte Antworten: s schnell richtig, r richtig, f falsch
    lernen: {},
    // Lernstufen (Phase 6b, Regelwerk 7)
    talente: { 5: null, 10: null, 15: null, 20: null },
    // Talente (Phase 9)
    gefunden: [...new Set(config.decks.starter)],
    // Kartenalbum (Phase 9)
    besiegt: {},
    // Meeresbuch: Gegner-Id oder <Id>.elite → Anzahl (Phase 9)
    entdeckt: [],
    // neue Karten, deren Meldung gezeigt wurde (Phase 9, Etappe 5)
    station: []
    // gekaufte Stücke der Station (Phase 9, Etappe 8)
  };
}
var isObj2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var isCount3 = (v) => Number.isInteger(v) && v >= 0;
function validateSave(s, config) {
  const errors = [];
  const fail = (field, problem) => errors.push(`${field}: ${problem}`);
  if (!isObj2(s)) return ["(Stand): kein Objekt"];
  if (s.version !== SAVE_VERSION) fail("version", `erwartet ${SAVE_VERSION}`);
  for (const f of ["angelegt", "geaendert", "ep", "perlen"]) if (!isCount3(s[f])) fail(f, "fehlt oder ist keine ganze Zahl \u2265 0");
  if (s.klasse !== 3 && s.klasse !== 4) fail("klasse", "muss 3 oder 4 sein");
  if (!Number.isInteger(s.stufe) || s.stufe < 1 || s.stufe > config.levels.xpThresholds.length) fail("stufe", "au\xDFerhalb der Stufen");
  if (!isObj2(s.held)) fail("held", "fehlt");
  else {
    if (!config.heroes.figures[s.held.figur]) fail("held.figur", "unbekannte Figur");
    if (!isCount3(s.held.nameA) || !isCount3(s.held.nameB)) fail("held.name", "muss aus zwei Nummern bestehen");
    else if (s.held.nameA >= config.heroes.nameA.length || s.held.nameB >= config.heroes.nameB.length) fail("held.name", "Nummer au\xDFerhalb der Namenslisten");
  }
  if (!isObj2(s.punkte) || !STATS.every((k) => isCount3(s.punkte[k]))) fail("punkte", "kraft, ruhe, leben als ganze Zahlen \u2265 0");
  else if (STATS.some((k) => s.punkte[k] > config.levels.maxPointsPerStat)) fail("punkte", `h\xF6chstens ${config.levels.maxPointsPerStat} je Wert`);
  if (!isObj2(s.deck)) fail("deck", "fehlt");
  else for (const [id, n] of Object.entries(s.deck)) {
    if (!config.cards[id]) fail(`deck.${id}`, "unbekannte Karte");
    if (!isCount3(n)) fail(`deck.${id}`, "Anzahl muss eine ganze Zahl \u2265 0 sein");
  }
  if (!isObj2(s.gebiete)) fail("gebiete", "fehlt");
  else for (const [id, g] of Object.entries(s.gebiete)) {
    if (!isObj2(g) || typeof g.offen !== "boolean" || typeof g.geschafft !== "boolean") fail(`gebiete.${id}`, "offen und geschafft als true/false");
    else if (!isCount3(g.tiefe)) fail(`gebiete.${id}.tiefe`, "ganze Zahl \u2265 0 (h\xF6chste geschaffte Tiefe)");
  }
  const cur = config.game.current;
  if (!(typeof s.stroemung === "number" && s.stroemung >= cur.min && s.stroemung <= cur.max)) fail("stroemung", `Zahl von ${cur.min} bis ${cur.max}`);
  if (!(Array.isArray(s.antworten) && s.antworten.length <= cur.recentAnswers && s.antworten.every((a2) => ["s", "r", "f"].includes(a2)))) {
    fail("antworten", `Liste aus s, r, f, h\xF6chstens ${cur.recentAnswers}`);
  }
  if (s.lauf !== null && !isObj2(s.lauf)) fail("lauf", "muss null oder ein Objekt sein");
  else if (s.lauf) validateRun(s.lauf, config, fail, s);
  if (s.statistik !== void 0) validateStatistics(s.statistik, config, fail);
  if (s.auftrag !== void 0) validateMission(s.auftrag, config, fail);
  if (!isObj2(s.uebung)) fail("uebung", "fehlt");
  else {
    const entries = Object.values(s.uebung);
    if (entries.length > config.game.practiceListMax) fail("uebung", `h\xF6chstens ${config.game.practiceListMax} Eintr\xE4ge`);
    if (!entries.every((e2) => isObj2(e2) && typeof e2.text === "string" && isCount3(e2.t))) fail("uebung", "Eintr\xE4ge brauchen text und t");
    if (!entries.every((e2) => e2.stufe === void 0 || typeof e2.stufe === "string" && [3, 4].some((g) => stageById(curriculumOf(config, g), e2.stufe)))) fail("uebung", "stufe muss eine bekannte Kennung sein");
    if (!entries.every((e2) => e2.richtig === void 0 || isCount3(e2.richtig))) fail("uebung", "richtig als ganze Zahl \u2265 0");
  }
  if (!isObj2(s.erklaert) || !Object.values(s.erklaert).every((v) => v === true)) fail("erklaert", "nur true-Werte");
  const a = s.ausruestung;
  if (!isObj2(a) || !Array.isArray(a.besitz) || !isObj2(a.angelegt)) fail("ausruestung", "besitz (Liste) und angelegt (Pl\xE4tze)");
  else {
    if (!a.besitz.every((id) => config.items?.[id]) || new Set(a.besitz).size !== a.besitz.length) fail("ausruestung.besitz", "bekannte Gegenst\xE4nde, jeder einmal");
    for (const slot of SLOTS) {
      const id = a.angelegt[slot];
      if (id === null) continue;
      if (!a.besitz.includes(id)) fail(`ausruestung.angelegt.${slot}`, "nicht im Besitz");
      else if (config.items[id].slot !== slot) fail(`ausruestung.angelegt.${slot}`, "Gegenstand geh\xF6rt in einen anderen Platz");
    }
    if (Object.keys(a.angelegt).some((k) => !SLOTS.includes(k))) fail("ausruestung.angelegt", `nur ${SLOTS.join(", ")}`);
  }
  if (!isObj2(s.karten)) fail("karten", "fehlt");
  else for (const [id, k] of Object.entries(s.karten)) {
    if (!config.cards[id]) fail(`karten.${id}`, "unbekannte Karte");
    else if (!isObj2(k) || !isCount3(k.richtig)) fail(`karten.${id}`, "richtig als ganze Zahl \u2265 0");
  }
  validateLearning(s.lernen, config, fail);
  if (!Array.isArray(s.gefunden) || !s.gefunden.every((id) => config.cards[id]) || new Set(s.gefunden).size !== s.gefunden.length) fail("gefunden", "Liste bekannter Karten, jede einmal");
  if (!isObj2(s.besiegt)) fail("besiegt", "fehlt");
  else for (const [key, n] of Object.entries(s.besiegt)) {
    const id = key.endsWith(".elite") ? key.slice(0, -6) : key;
    if (!config.enemies[id] && !config.bosses.bosses[id]) fail(`besiegt.${key}`, "unbekannter Gegner");
    else if (!(Number.isInteger(n) && n >= 1)) fail(`besiegt.${key}`, "ganze Zahl \u2265 1");
  }
  if (!Array.isArray(s.station) || !s.station.every((id) => config.station?.[id]) || new Set(s.station).size !== s.station.length) fail("station", "Liste gekaufter St\xFCcke, jedes einmal");
  if (!Array.isArray(s.entdeckt) || !s.entdeckt.every((id) => config.cards[id]) || new Set(s.entdeckt).size !== s.entdeckt.length) fail("entdeckt", "Liste bekannter Karten, jede einmal");
  const levels = Object.keys(config.talents ?? {});
  if (!isObj2(s.talente) || Object.keys(s.talente).sort().join() !== [...levels].sort().join()) fail("talente", `genau die Stufen ${levels.join(", ")}`);
  else for (const [lv, id] of Object.entries(s.talente)) {
    if (id !== null && !config.talents[lv].some((x) => x.id === id)) fail(`talente.${lv}`, "unbekanntes Talent");
  }
  const e = s.einstellung;
  if (!isObj2(e)) fail("einstellung", "fehlt");
  else {
    if (!(e.mehrZeit in config.game.moreTime)) fail("einstellung.mehrZeit", "unbekannter Wert");
    for (const k of ["ton", "musik", "wenigBewegung"]) if (typeof e[k] !== "boolean") fail(`einstellung.${k}`, "true oder false");
    if (typeof e.lautstaerke !== "number" || e.lautstaerke < 0 || e.lautstaerke > 1) fail("einstellung.lautstaerke", "Zahl von 0 bis 1");
  }
  return errors;
}
function validateLearning(lernen, config, fail) {
  if (!isObj2(lernen)) {
    fail("lernen", "fehlt");
    return;
  }
  const max = config.game.learning.listSize;
  for (const [grade, g] of Object.entries(lernen)) {
    const p = `lernen.${grade}`;
    const cur = grade === "3" || grade === "4" ? curriculumOf(config, Number(grade)) : null;
    if (!cur) {
      fail(p, "unbekannte Klasse");
      continue;
    }
    if (!isObj2(g) || !isObj2(g.gebiete) || !isObj2(g.hoechste) || !Array.isArray(g.eingefuehrt)) {
      fail(p, "gebiete, hoechste, eingefuehrt");
      continue;
    }
    const size = (ladder3) => cur.ladders[ladder3]?.stages?.length ?? 0;
    for (const [areaId, area] of Object.entries(g.gebiete)) {
      const win = cur.windows[areaId];
      if (!win || !isObj2(area)) {
        fail(`${p}.gebiete.${areaId}`, "unbekanntes Gebiet");
        continue;
      }
      for (const [ladder3, e] of Object.entries(area)) {
        const q = `${p}.gebiete.${areaId}.${ladder3}`;
        if (!win[ladder3]) {
          fail(q, "Leiter nicht im Gebiet");
          continue;
        }
        if (!isObj2(e) || !Number.isInteger(e.stufe) || e.stufe < 1 || e.stufe > size(ladder3)) fail(q, "stufe au\xDFerhalb der Leiter");
        if (typeof e?.liste !== "string" || !/^[01]*$/.test(e.liste) || e.liste.length > max) fail(q, `liste aus 0 und 1, h\xF6chstens ${max}`);
        if (isObj2(e) && e.misch !== void 0 && !(isCount3(e.misch) && e.misch < MIX_COUNT_MAX)) fail(q, `misch als ganze Zahl von 0 bis ${MIX_COUNT_MAX - 1}`);
      }
    }
    for (const [ladder3, n] of Object.entries(g.hoechste)) if (!(Number.isInteger(n) && n >= 1 && n <= size(ladder3))) fail(`${p}.hoechste.${ladder3}`, "Stufe der Leiter");
    if (!g.eingefuehrt.every((id) => cur.windows[id])) fail(`${p}.eingefuehrt`, "nur bekannte Gebiete");
  }
}
function validateRun(l, config, fail, save) {
  const area = config.areas.areas[l.gebiet];
  if (!area || area.comingSoon) {
    fail("lauf.gebiet", "unbekanntes oder noch nicht spielbares Gebiet");
    return;
  }
  if (!Number.isInteger(l.seed) || l.seed < 0 || l.seed > 4294967295) {
    fail("lauf.seed", "ganze Zahl 0 bis 2^32\u22121");
    return;
  }
  if (!Number.isInteger(l.leben) || l.leben < 1) fail("lauf.leben", "ganze Zahl \u2265 1");
  if (!Number.isInteger(l.tiefe) || l.tiefe < 1) fail("lauf.tiefe", "ganze Zahl \u2265 1");
  if (l.zweiteLuft !== void 0 && typeof l.zweiteLuft !== "boolean") fail("lauf.zweiteLuft", "true oder false");
  if (l.rettung !== void 0 && typeof l.rettung !== "boolean") fail("lauf.rettung", "true oder false");
  for (const k of ["vorrat", "werkstatt"]) if (l[k] !== void 0 && l[k] !== true) fail(`lauf.${k}`, "true oder nicht vorhanden");
  const map = generateMap(area, l.seed, config, Number.isInteger(l.tiefe) ? l.tiefe : 1);
  const ids = new Set(map.rooms.map((r) => r.id));
  if (!Array.isArray(l.erledigt) || !l.erledigt.every((id) => ids.has(id))) fail("lauf.erledigt", "Liste vorhandener R\xE4ume");
  if (l.beute !== void 0 && (!ids.has(l.beute) || !l.erledigt?.includes?.(l.beute))) fail("lauf.beute", "erledigter Raum mit offener Kartenauswahl");
  if (l.position !== null && !ids.has(l.position)) fail("lauf.position", "null oder ein vorhandener Raum");
  if (l.raetsel !== void 0) {
    const r = l.raetsel;
    if (!isObj2(r) || !ids.has(r.raum) || l.erledigt?.includes?.(r.raum) || !Number.isInteger(r.stufe) || r.stufe < 1 || !isCount3(r.schritt) || !isCount3(r.frei) || !Array.isArray(r.versucht) || !r.versucht.every((x) => x === 0 || x === 1)) fail("lauf.raetsel", "offener Raum, stufe, schritt, frei, versucht als Liste aus 0 und 1");
    else if (map.rooms.find((x) => x.id === r.raum)?.type !== "riddle") fail("lauf.raetsel.raum", "muss ein R\xE4tselraum sein");
    else if (r.frei > config.riddles.freeMistakes) fail("lauf.raetsel.frei", `h\xF6chstens ${config.riddles.freeMistakes}`);
    else {
      let riddle = null;
      try {
        riddle = createRiddle({ config, save, curriculumId: area.curriculum, runSeed: l.seed, roomId: r.raum, stufe: r.stufe });
      } catch {
      }
      if (!riddle || r.stufe < riddle.win[0] || r.stufe > riddle.win[1]) fail("lauf.raetsel.stufe", "Stufe im Fenster des Gebiets");
      else if (r.schritt >= riddle.steps.length || r.versucht.length > riddle.steps.length) fail("lauf.raetsel.schritt", `schritt und versucht passend zu ${riddle.steps.length} Steinen`);
      else {
        const st = riddle.steps[r.schritt];
        if (r.falsch !== void 0 && !(Array.isArray(r.falsch) && r.falsch.length <= config.riddles.freeMistakes && new Set(r.falsch).size === r.falsch.length && r.falsch.every((i) => Number.isInteger(i) && i >= 0 && i < st.choices.length && i !== st.correctIndex))) {
          fail("lauf.raetsel.falsch", "Liste falscher Antworten des aktuellen Steins");
        }
        if (r.gewechselt !== void 0 && r.gewechselt !== true) fail("lauf.raetsel.gewechselt", "true oder nicht vorhanden");
      }
    }
  }
  if (!isObj2(l.versuche) || !Object.entries(l.versuche).every(([id, n]) => ids.has(id) && isCount3(n))) fail("lauf.versuche", "Raum \u2192 Anzahl");
  if (!isObj2(l.laden)) fail("lauf.laden", "fehlt");
  else for (const [id, rec] of Object.entries(l.laden)) {
    if (!ids.has(id)) fail(`lauf.laden.${id}`, "unbekannter Raum");
    else if (!isObj2(rec) || typeof rec.abgegeben !== "boolean" || !Array.isArray(rec.gekauft) || !rec.gekauft.every((c) => config.cards[c]) || rec.gegenstand !== void 0 && rec.gegenstand !== null && !config.items?.[rec.gegenstand]) {
      fail(`lauf.laden.${id}`, "gekauft als Liste bekannter Karten, abgegeben als true/false");
    }
  }
}
function repairSave(save, config) {
  const notes = [];
  if (!isObj2(save)) return notes;
  if (save.statistik !== void 0 && validateSave(save, config).some((e) => e.startsWith("statistik"))) {
    delete save.statistik;
    notes.push("statistik: besch\xE4digt, neu begonnen");
  }
  if (save.auftrag !== void 0 && validateSave(save, config).some((e) => e.startsWith("auftrag"))) {
    delete save.auftrag;
    notes.push("auftrag: besch\xE4digt, verworfen");
  }
  if (!isObj2(save.lauf)) return notes;
  const l = save.lauf;
  if (Number.isInteger(l.leben) && l.leben < 1) {
    l.leben = 1;
    notes.push("lauf.leben: auf 1 gehoben");
  }
  if (l.raetsel !== void 0 && validateSave(save, config).some((e) => e.startsWith("lauf.raetsel"))) {
    delete l.raetsel;
    notes.push("lauf.raetsel: passte nicht mehr, das R\xE4tsel beginnt neu");
  }
  return notes;
}
function migrateSave(raw, config) {
  const notes = [];
  if (!isObj2(raw) || !Number.isInteger(raw.version)) return { save: raw, notes };
  const s = raw;
  if (s.version === 1) {
    if (s.lauf) notes.push("lauf: laufender Tauchgang abgebrochen (neue Seekarte)");
    s.lauf = null;
    s.version = 2;
    notes.push("version: 1 \u2192 2");
  }
  if (s.version === 2) {
    s.ausruestung = { besitz: [], angelegt: { kopf: null, koerper: null, hand: null } };
    s.version = 3;
    notes.push("version: 2 \u2192 3 (Ausr\xFCstung)");
  }
  if (s.version === 3) {
    s.karten = {};
    s.version = 4;
    notes.push("version: 3 \u2192 4 (Kartenstufen)");
  }
  if (s.version === 4) {
    if (isObj2(s.einstellung)) s.einstellung.lautstaerke = config.sounds.defaultVolume;
    s.version = 5;
    notes.push("version: 4 \u2192 5 (Lautst\xE4rke)");
  }
  if (s.version === 5) {
    s.stroemung = typeof s.lauf?.stroemung === "number" ? s.lauf.stroemung : 1;
    s.antworten = Array.isArray(s.lauf?.antworten) ? s.lauf.antworten.slice() : [];
    if (s.lauf) {
      delete s.lauf.stroemung;
      delete s.lauf.antworten;
    }
    s.version = 6;
    notes.push("version: 5 \u2192 6 (Str\xF6mung)");
  }
  if (s.version === 6) {
    const open = Object.entries(isObj2(s.gebiete) ? s.gebiete : {}).filter(([, g]) => g?.offen).map(([id]) => id);
    s.lernen = s.klasse === 3 || s.klasse === 4 ? { [s.klasse]: { gebiete: {}, hoechste: {}, eingefuehrt: open } } : {};
    s.version = 7;
    notes.push("version: 6 \u2192 7 (Lernstufen)");
  }
  if (s.version === 7) {
    for (const g of Object.values(isObj2(s.gebiete) ? s.gebiete : {})) if (isObj2(g)) g.tiefe = g.geschafft ? 1 : 0;
    if (isObj2(s.lauf)) s.lauf.tiefe = 1;
    s.version = 8;
    notes.push("version: 7 \u2192 8 (Tiefen)");
  }
  if (s.version === 8) {
    if (s.lauf) notes.push("lauf: laufender Tauchgang beendet (neue Seekarten)");
    s.lauf = null;
    s.version = 9;
    notes.push("version: 8 \u2192 9 (Seekarten)");
  }
  if (s.version === 9) {
    s.talente = { 5: null, 10: null, 15: null, 20: null };
    s.version = 10;
    notes.push("version: 9 \u2192 10 (Talente)");
  }
  if (s.version === 10) {
    const known = (id) => Boolean(config.cards[id]);
    s.gefunden = [.../* @__PURE__ */ new Set([...config.decks.starter, ...Object.keys(isObj2(s.deck) ? s.deck : {}), ...Object.keys(isObj2(s.karten) ? s.karten : {})])].filter(known);
    s.besiegt = {};
    s.version = 11;
    notes.push("version: 10 \u2192 11 (Album und Meeresbuch)");
  }
  if (s.version === 11) {
    if (typeof s.stroemung === "number") s.stroemung = Math.min(s.stroemung, config.game.current.max);
    s.version = 12;
    notes.push("version: 11 \u2192 12 (Str\xF6mung h\xF6chstens 1,2)");
  }
  if (s.version === 12) {
    s.entdeckt = [];
    s.version = 13;
    notes.push("version: 12 \u2192 13 (neue Karten)");
  }
  if (s.version === 13) {
    s.station = [];
    s.version = 14;
    notes.push("version: 13 \u2192 14 (Station)");
  }
  return { save: s, notes };
}

// src/platform/storage.js
var STORAGE_KEY = "abyss-of-numbers-v1";
var BROKEN_KEY = `${STORAGE_KEY}.defekt`;
function loadVerdict(status, hasAccount) {
  if (status === "newer") return "reload";
  if (status === "corrupt" && hasAccount) return "blocked";
  return "play";
}
function createStorage(backend, config) {
  function keepBroken(raw) {
    try {
      backend.setItem(BROKEN_KEY, raw);
    } catch {
    }
  }
  return {
    load() {
      let raw;
      try {
        raw = backend.getItem(STORAGE_KEY);
      } catch {
        return { save: null, status: "unavailable" };
      }
      if (raw === null || raw === void 0) return { save: null, status: "empty" };
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        keepBroken(raw);
        return { save: null, status: "corrupt" };
      }
      if (Number.isInteger(parsed?.version) && parsed.version > SAVE_VERSION) return { save: null, status: "newer" };
      let save;
      let notes;
      try {
        ({ save, notes } = migrateSave(parsed, config));
        notes = [...notes, ...repairSave(save, config)];
        if (validateSave(save, config).length > 0) throw new Error("ung\xFCltig");
      } catch {
        keepBroken(raw);
        return { save: null, status: "corrupt" };
      }
      return { save, status: "ok", notes };
    },
    // Schreibt nie einen Stand, den das Spiel beim nächsten Laden ablehnen würde (zweite Durchsicht, 20.11.2026):
    // Ein Fehler im Spiel soll höchstens den Fortschritt seit dem letzten gültigen Stand kosten, nicht den Stand.
    write(save) {
      try {
        let raw = JSON.stringify(save);
        const copy = JSON.parse(raw);
        let errors = validateSave(copy, config);
        if (errors.length > 0 && errors.every((e) => e.startsWith("statistik"))) {
          delete copy.statistik;
          raw = JSON.stringify(copy);
          errors = validateSave(copy, config);
        }
        if (errors.length > 0) return false;
        backend.setItem(STORAGE_KEY, raw);
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      try {
        backend.removeItem(STORAGE_KEY);
      } catch {
      }
    }
  };
}

// src/platform/account.js
var COLLECTION = "an_stand";
var MAX_SAVE_CHARS = 2e4;
var LOCAL_KEY = "abyss-of-numbers-v2";
var text = (x) => typeof x === "string" && x.length > 0 && x.length <= MAX_SAVE_CHARS ? x : "";
function accountRules(A) {
  const normalisiere = (roh) => ({ spielstand: text(A.karte(roh).spielstand) });
  function mische(basis, lokal, fern) {
    const b = A.karte(basis), l = A.karte(lokal), f = A.karte(fern);
    const aus = {
      spielstand: A.hierGeaendert(text(b.spielstand), text(l.spielstand), text(f.spielstand), (x) => x !== "") || "",
      geaendert: A.spaeter(l.geaendert, f.geaendert)
    };
    const angelegt = A.frueher(l.angelegt, f.angelegt);
    if (angelegt) aus.angelegt = angelegt;
    return aus;
  }
  const neuanfang = (lokal, jetzt) => ({ spielstand: "", angelegt: jetzt, geaendert: jetzt });
  const gueltig = (d) => A.istObjekt(d) && Object.keys(d).every((k) => ["spielstand", "angelegt", "geaendert"].includes(k)) && ["spielstand", "angelegt", "geaendert"].every((k) => k in d) && typeof d.geaendert === "number" && d.geaendert >= 0 && typeof d.angelegt === "number" && typeof d.spielstand === "string" && d.spielstand.length <= MAX_SAVE_CHARS;
  return { normalisiere, mische, neuanfang, gueltig };
}
function accountBackend(S2, storageKey, local) {
  return {
    getItem(key) {
      if (key !== storageKey) return local.getItem(key);
      const k = S2.aktiv();
      if (!k) throw new Error("nicht angemeldet");
      return k.spielstand || null;
    },
    setItem(key, value) {
      if (key !== storageKey) {
        local.setItem(key, value);
        return;
      }
      const k = S2.aktiv();
      if (!k) throw new Error("nicht angemeldet");
      if (String(value).length > MAX_SAVE_CHARS) throw new Error("Spielstand zu gro\xDF");
      k.spielstand = String(value);
      if (!S2.speichern()) throw new Error("Speichern auf dem Ger\xE4t fehlgeschlagen");
    },
    removeItem(key) {
      if (key !== storageKey) {
        local.removeItem(key);
        return;
      }
      const k = S2.aktiv();
      if (k) {
        k.spielstand = "";
        S2.speichern();
      }
    }
  };
}
function createAccount(LK, firebase2) {
  const rules = accountRules(LK.abgleich);
  const S2 = LK.speicher({
    schluessel: LOCAL_KEY,
    leer: () => ({ spielstand: "" }),
    normalisiere: rules.normalisiere,
    mische: rules.mische
  });
  const cloud = LK.cloud({
    firebase: firebase2,
    sammlung: COLLECTION,
    speicher: S2,
    mische: rules.mische,
    neuanfang: rules.neuanfang
  });
  return { S: S2, cloud, rules };
}

// src/platform/firebase-config.js
var FIREBASE = {
  apiKey: "AIzaSyBX3MUJq69uFyejbEiJimGeAtHMER3OCdE",
  authDomain: "lernplattform-44aa1.firebaseapp.com",
  projectId: "lernplattform-44aa1",
  storageBucket: "lernplattform-44aa1.firebasestorage.app",
  messagingSenderId: "213839225177",
  appId: "1:213839225177:web:4cf676269e50c708466c48"
};

// src/platform/audio.js
var clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
function soundKeyFor(event, map) {
  if (!event || !map) return null;
  const detail = event.outcome ?? event.roomType;
  if (detail !== void 0 && `${event.type}:${detail}` in map) return map[`${event.type}:${detail}`];
  if (detail !== void 0 && Object.keys(map).some((k) => k.startsWith(`${event.type}:`))) return null;
  return map[event.type] ?? null;
}
var FADE_IN = 1.2;
var FADE_OUT = 0.6;
function musicStart(buffer, threshold = 3e-3) {
  const n = buffer.numberOfChannels ?? 1;
  let first = buffer.length;
  for (let c = 0; c < n; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < Math.min(first, d.length); i++) if (Math.abs(d[i]) > threshold) {
      first = i;
      break;
    }
  }
  return first >= buffer.length ? 0 : first / buffer.sampleRate;
}
function createAudio({ sounds, enabled = true, music = false, volume = 1, context = null, timers = globalThis, random = Math.random, loadTrack = null } = {}) {
  let on = Boolean(enabled);
  let musicOn = Boolean(music);
  let vol = clamp01(volume);
  let ctx = null;
  let master = null;
  let musicNodes = null;
  let noiseBuffer = null;
  let scene = "base";
  const sceneOf = (id) => sounds?.ambience?.[id] || sounds?.tracks?.[id] ? id : "base";
  const trackCache = /* @__PURE__ */ new Map();
  function loadBuffer(id) {
    if (!trackCache.has(id)) {
      const tr = sounds.tracks[id];
      trackCache.set(id, Promise.resolve().then(() => loadTrack(tr.file)).then((data) => ctx.decodeAudioData(data)).catch(() => null));
    }
    return trackCache.get(id);
  }
  function startTrack(id) {
    const tr = sounds.tracks[id];
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, ctx.currentTime);
    bus.connect(master);
    const nodes = { bus, oscillators: [], sources: [], timer: null, track: id };
    musicNodes = nodes;
    loadBuffer(id).then((buffer) => {
      if (musicNodes !== nodes) return;
      if (!buffer) {
        musicNodes = null;
        bus.disconnect?.();
        startSynth();
        return;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const start = musicStart(buffer);
      src.loopStart = start;
      src.loopEnd = Math.min(buffer.duration, start + tr.loopSeconds);
      src.connect(bus);
      src.start(0, start);
      nodes.sources.push(src);
      bus.gain.setValueAtTime(0, ctx.currentTime);
      bus.gain.linearRampToValueAtTime(tr.gain ?? 0.45, ctx.currentTime + FADE_IN);
    });
  }
  const between = ([a, b]) => a + (b - a) * random();
  function getNoise() {
    if (noiseBuffer) return noiseBuffer;
    const length = Math.floor(ctx.sampleRate * 4);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    return noiseBuffer;
  }
  function wave(param, hz, depth, nodes) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = depth;
    lfo.connect(g);
    g.connect(param);
    lfo.start();
    nodes.push(lfo);
  }
  function bubble(amb, nodes) {
    const b = amb.bubbles;
    const n = Math.round(between(b.count));
    let t2 = ctx.currentTime;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const dur = b.ms / 1e3;
      const from = b.fromHz * (0.8 + 0.4 * random());
      o.type = "sine";
      o.frequency.setValueAtTime(from, t2);
      o.frequency.exponentialRampToValueAtTime(from * (b.toHz / b.fromHz), t2 + dur);
      g.gain.setValueAtTime(0, t2);
      g.gain.linearRampToValueAtTime(b.gain, t2 + 0.01);
      g.gain.exponentialRampToValueAtTime(1e-4, t2 + dur);
      o.connect(g);
      g.connect(nodes.bus);
      o.start(t2);
      o.stop(t2 + dur + 0.02);
      t2 += dur * 0.8;
    }
  }
  function scheduleBubble(amb, nodes) {
    nodes.timer = timers.setTimeout(() => {
      if (musicNodes !== nodes) return;
      bubble(amb, nodes);
      scheduleBubble(amb, nodes);
    }, between(amb.bubbles.everyMs));
  }
  function startMusic() {
    if (!ctx || musicNodes) return;
    if (loadTrack && sounds?.tracks?.[scene] && ctx.decodeAudioData) {
      startTrack(scene);
      return;
    }
    startSynth();
  }
  function startSynth() {
    if (!ctx || musicNodes || !sounds?.music) return;
    const m = sounds.music;
    const amb = sounds.ambience?.[scene] ?? sounds.ambience?.base ?? null;
    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(master);
    const nodes = { bus, oscillators: [], sources: [], timer: null };
    const droneBus = ctx.createGain();
    droneBus.gain.value = m.gain;
    droneBus.connect(bus);
    for (const hz of amb?.drone ?? m.notes) {
      const o = ctx.createOscillator();
      o.type = m.wave;
      o.frequency.value = hz;
      o.connect(droneBus);
      o.start();
      nodes.oscillators.push(o);
    }
    wave(droneBus.gain, m.lfoHz, m.lfoDepth, nodes.oscillators);
    if (amb) {
      const src = ctx.createBufferSource();
      src.buffer = getNoise();
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = amb.cutoffHz;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = amb.noiseGain;
      src.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(bus);
      src.start();
      nodes.sources.push(src);
      wave(filter.frequency, amb.swellHz, amb.swingHz, nodes.oscillators);
      wave(noiseGain.gain, amb.swellHz, amb.noiseGain * 0.5, nodes.oscillators);
      musicNodes = nodes;
      scheduleBubble(amb, nodes);
      return;
    }
    musicNodes = nodes;
  }
  function stopMusic() {
    if (!musicNodes) return;
    const nodes = musicNodes;
    musicNodes = null;
    timers.clearTimeout(nodes.timer);
    for (const o of nodes.oscillators) o.stop();
    if (nodes.track) {
      const t2 = ctx.currentTime;
      nodes.bus.gain.cancelScheduledValues?.(t2);
      nodes.bus.gain.setValueAtTime(nodes.bus.gain.value, t2);
      nodes.bus.gain.linearRampToValueAtTime(0, t2 + FADE_OUT);
      for (const src of nodes.sources) src.stop(t2 + FADE_OUT);
      return;
    }
    for (const src of nodes.sources) src.stop();
    nodes.bus.disconnect?.();
  }
  function play(key) {
    if (!on || !ctx || !key) return false;
    const s = sounds?.sounds?.[key];
    if (!s) return false;
    const step = s.noteMs / 1e3;
    let t2 = ctx.currentTime;
    for (const hz of s.notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = s.wave;
      o.frequency.setValueAtTime(hz, t2);
      g.gain.setValueAtTime(0, t2);
      g.gain.linearRampToValueAtTime(s.gain, t2 + 0.01);
      g.gain.exponentialRampToValueAtTime(1e-4, t2 + step);
      o.connect(g);
      g.connect(master);
      o.start(t2);
      o.stop(t2 + step + 0.02);
      t2 += step;
    }
    return true;
  }
  return {
    // beim ersten Tipp aufrufen; danach ohne Wirkung
    unlock() {
      if (!ctx && context) {
        try {
          ctx = context();
          master = ctx.createGain();
          master.gain.value = vol;
          master.connect(ctx.destination);
        } catch {
          ctx = null;
          return;
        }
      }
      if (ctx?.state === "suspended") ctx.resume?.();
      if (musicOn) startMusic();
    },
    play,
    event(e) {
      return play(soundKeyFor(e, sounds?.events));
    },
    events(list) {
      for (const e of list ?? []) play(soundKeyFor(e, sounds?.events));
    },
    ui(name) {
      return play(sounds?.ui?.[name]);
    },
    setEnabled(value) {
      on = Boolean(value);
    },
    setMusic(value) {
      musicOn = Boolean(value);
      if (musicOn) startMusic();
      else stopMusic();
    },
    setVolume(value) {
      vol = clamp01(value);
      if (master) master.gain.value = vol;
    },
    get volume() {
      return vol;
    },
    get musicPlaying() {
      return Boolean(musicNodes);
    },
    // Ort wechseln: Station ('base') oder Gebiet; unbekannt → Station
    setScene(id) {
      const next = sceneOf(id);
      if (next === scene) return;
      scene = next;
      if (musicNodes) {
        stopMusic();
        startMusic();
      }
    },
    get scene() {
      return scene;
    }
  };
}

// src/engine/config/validate.js
function at(obj, path) {
  return path.split(".").reduce((o, k) => o == null ? void 0 : o[k], obj);
}
function checker(file, data, errors) {
  const fail = (path, problem) => errors.push(`${file}: ${path}: ${problem}`);
  return {
    fail,
    object(path) {
      const v = at(data, path);
      if (v === null || typeof v !== "object" || Array.isArray(v)) {
        fail(path, "fehlt oder ist kein Objekt");
        return false;
      }
      return true;
    },
    number(path, { min = -Infinity, max = Infinity, integer = false } = {}) {
      const v = at(data, path);
      if (typeof v !== "number" || !Number.isFinite(v)) return fail(path, "fehlt oder ist keine Zahl");
      if (integer && !Number.isInteger(v)) return fail(path, "muss eine ganze Zahl sein");
      if (v < min || v > max) fail(path, `muss zwischen ${min} und ${max} liegen, ist ${v}`);
    },
    string(path) {
      const v = at(data, path);
      if (typeof v !== "string" || v.trim() === "") fail(path, "fehlt oder ist leer");
    }
  };
}
function validateGame(file, g, errors) {
  const c = checker(file, g, errors);
  if (c.object("hero")) {
    c.number("hero.maxHp", { min: 1, integer: true });
    c.number("hero.energy", { min: 1, integer: true });
    c.number("hero.handSize", { min: 1, integer: true });
    c.number("hero.discardsPerTurn", { min: 0, integer: true });
  }
  if (c.object("stats")) {
    c.number("stats.strengthDamagePerPoint", { min: 0 });
    c.number("stats.calmMsPerPoint", { min: 0 });
    c.number("stats.hpPerPoint", { min: 0 });
  }
  if (c.object("tempo")) {
    const cur = g.current;
    if (!cur || typeof cur !== "object") c.fail("current", "fehlt");
    else {
      c.number("current.recentAnswers", { min: 1, integer: true });
      c.number("current.minAnswers", { min: 1, integer: true });
      for (const k of ["step", "upAccuracy", "upFastShare", "downAccuracy"]) c.number(`current.${k}`, { min: 0, max: 1 });
      c.number("current.min", { min: 0.1, max: 1 });
      c.number("current.max", { min: 1, max: 3 });
      if (cur.minAnswers > cur.recentAnswers) c.fail("current.minAnswers", "h\xF6chstens recentAnswers");
    }
    const tiers = g.tempo.tiers;
    if (!Array.isArray(tiers) || tiers.length === 0) c.fail("tempo.tiers", "fehlt oder ist leer");
    else tiers.forEach((t2, i) => {
      const p = `tempo.tiers[${i}]`;
      if (!t2 || typeof t2.id !== "string") c.fail(`${p}.id`, "fehlt");
      if (!(Number.isInteger(t2?.num) && Number.isInteger(t2?.den) && t2.den > 0 && t2.num > 0 && t2.num < t2.den)) c.fail(p, "num/den muss ein Bruch zwischen 0 und 1 sein");
      if (!(typeof t2?.multiplier === "number" && t2.multiplier >= 1)) c.fail(`${p}.multiplier`, "muss mindestens 1 sein");
    });
    if (!Array.isArray(g.tempo.appliesTo)) c.fail("tempo.appliesTo", "fehlt oder ist keine Liste");
  }
  if (c.object("penalty")) {
    c.number("penalty.wrong", { min: 0, integer: true });
    c.number("penalty.timeout", { min: 0, integer: true });
    c.number("penalty.minHp", { min: 1, integer: true });
  }
  if (c.object("mission")) {
    if (typeof g.mission.enabled !== "boolean") c.fail("mission.enabled", "true oder false");
    c.number("mission.reward", { min: 0, integer: true });
    c.number("mission.practiceEvery", { min: 0, integer: true });
    if (!g.mission.goals || typeof g.mission.goals !== "object") c.fail("mission.goals", "fehlt");
    else for (const k of ["uebung", "rechenart", "serie"]) c.number(`mission.goals.${k}`, { min: 1, integer: true });
  }
  if (c.object("rescue")) {
    const r = g.rescue;
    if (typeof r.enabled !== "boolean") c.fail("rescue.enabled", "true oder false");
    c.number("rescue.tasks", { min: 1, integer: true });
    c.number("rescue.needed", { min: 1, integer: true });
    if (Number.isInteger(r.needed) && Number.isInteger(r.tasks) && r.needed > r.tasks) c.fail("rescue.needed", "h\xF6chstens tasks");
    if (!(typeof r.hpShare === "number" && r.hpShare > 0 && r.hpShare <= 1)) c.fail("rescue.hpShare", "Zahl \xFCber 0 bis 1");
  }
  if (c.object("baseTimeMs")) {
    for (const k of ["solve", "pickTrue", "pickFalse"]) c.number(`baseTimeMs.${k}`, { min: 1e3, integer: true });
  }
  if (c.object("learning")) {
    const l = g.learning;
    if (typeof l.enabled !== "boolean") c.fail("learning.enabled", "true oder false");
    for (const k of ["listSize", "upCorrect", "downMin", "downWrong", "practiceDoneAfter"]) c.number(`learning.${k}`, { min: 1, integer: true });
    for (const k of ["mixEvery", "newStagePearls"]) c.number(`learning.${k}`, { min: 0, integer: true });
    if (l.upCorrect > l.listSize) c.fail("learning.upCorrect", "h\xF6chstens listSize");
    if (l.downMin > l.listSize || l.downWrong > l.downMin) c.fail("learning.downMin", "downWrong \u2264 downMin \u2264 listSize");
  }
  if (c.object("timeClassMs")) for (const k of TIME_CLASSES) c.number(`timeClassMs.${k}`, { min: 1e3, integer: true });
  if (c.object("moreTime")) {
    for (const k of ["off", "plus50", "plus100", "noTimer"]) c.number(`moreTime.${k}`, { min: 0 });
  }
  c.number("practiceListMax", { min: 1, integer: true });
  c.number("practiceShownAfterCombat", { min: 0, integer: true });
  if (c.object("streak")) {
    c.number("streak.from", { min: 1, integer: true });
    c.number("streak.bonusPerStep", { min: 0, integer: true });
    c.number("streak.maxBonus", { min: 0, integer: true });
  }
  const cl = g.cardLevels;
  if (!Array.isArray(cl) || cl.length === 0 || !cl.every((n, i) => Number.isInteger(n) && n > 0 && (i === 0 || n > cl[i - 1]))) c.fail("cardLevels", "aufsteigende ganze Zahlen ab 1");
}
function validateTexts(file, t2, errors, config) {
  const c = checker(file, t2, errors);
  for (const id of Object.keys(config.cards ?? {})) c.string(`cards.${id}.name`);
  for (const id of Object.keys(config.enemies ?? {})) c.string(`enemies.${id}.name`);
  for (const id of Object.keys(config.bosses?.bosses ?? {})) c.string(`enemies.${id}.name`);
  for (const id of Object.keys(config.heroes?.figures ?? {})) c.string(`figures.${id}.name`);
  for (const id of Object.keys(config.cards ?? {})) c.string(`hint.card.${id}`);
  for (const k of ["step1", "step2", "step3", "step4"]) c.string(`tutorial.${k}`);
  for (const k of Object.keys(config.game?.moreTime ?? {})) c.string(`adult.moreTimeOpt.${k}`);
  for (const id of Object.keys(config.areas?.areas ?? {})) c.string(`areas.${id}.name`);
  for (const [id, a] of Object.entries(config.areas?.areas ?? {})) if (!a.comingSoon) c.string(`areas.${id}.bossDefeated`);
  for (const reason of REJECT_REASONS) c.string(`reject.${reason}`);
  c.string("title.name");
  c.string("boot.loading");
  c.string("boot.configError");
  c.string("task.pickTrue");
  c.string("task.pickFalse");
}
function validateArea(c, base) {
  c.number(`${base}.maxNumber`, { min: 10, integer: true });
}
function validateCurriculum(file, cur, errors) {
  const c = checker(file, cur, errors);
  c.number("grade", { min: 1, max: 4, integer: true });
  if ("sameAs" in cur) {
    c.number("sameAs", { min: 1, max: 4, integer: true });
    return;
  }
  if (c.object("areas")) {
    if (!cur.areas.reef) c.fail("areas.reef", "fehlt (Gebiet 1)");
    for (const id of Object.keys(cur.areas)) validateArea(c, `areas.${id}`);
  }
  validateLadders(c, cur);
}
var TIME_CLASSES = ["short", "medium", "long"];
function validateLadders(c, cur) {
  if (!c.object("ladders")) return;
  const ids = /* @__PURE__ */ new Set();
  for (const [name, ladder3] of Object.entries(cur.ladders)) {
    const base = `ladders.${name}`;
    const kinds5 = LADDERS[name]?.kinds ?? FORMAT_KINDS[name];
    if (!kinds5) {
      c.fail(base, "unbekannte Leiter");
      continue;
    }
    if (!Array.isArray(ladder3?.stages) || ladder3.stages.length === 0) {
      c.fail(`${base}.stages`, "fehlt oder ist leer");
      continue;
    }
    ladder3.stages.forEach((st, i) => {
      const p = `${base}.stages[${i}]`;
      if (typeof st?.id !== "string" || st.id === "") c.fail(`${p}.id`, "Kennung aus dem Regelwerk fehlt");
      else if (ids.has(st.id)) c.fail(`${p}.id`, `Kennung ${st.id} doppelt`);
      else ids.add(st.id);
      if (!kinds5.includes(st?.kind)) c.fail(`${p}.kind`, `unbekannte Zugart ${st?.kind}`);
      if (LADDERS[name] ? !TIME_CLASSES.includes(st?.time) : st?.time !== void 0 && !TIME_CLASSES.includes(st.time)) c.fail(`${p}.time`, `eine von ${TIME_CLASSES.join(", ")}`);
    });
  }
  if (!c.object("windows")) return;
  for (const [areaId, win] of Object.entries(cur.windows)) {
    if (!cur.areas?.[areaId]) {
      c.fail(`windows.${areaId}`, "unbekanntes Gebiet");
      continue;
    }
    for (const [name, range] of Object.entries(win ?? {})) {
      const p = `windows.${areaId}.${name}`;
      const n = cur.ladders[name]?.stages?.length;
      if (!n) {
        c.fail(p, "unbekannte Leiter");
        continue;
      }
      const ok = Array.isArray(range) && range.length === 2 && range.every((x) => Number.isInteger(x) && x >= 1 && x <= n) && range[0] <= range[1];
      if (!ok) c.fail(p, `[von, bis] mit 1 \u2264 von \u2264 bis \u2264 ${n}`);
    }
  }
}
var OPERATIONS2 = ["add", "sub", "mul", "div"];
var EFFECT_TYPES = [
  "damage",
  "block",
  "heal",
  "cycle",
  "buff",
  "breakImmunity",
  "damagePerStep",
  "energy",
  "weaken",
  "damageBlock",
  "damageAll",
  "damageTwo",
  "poison",
  "draw",
  "slowTime",
  "thorns"
];
var BUFF_STATS = ["strength"];
var TASK_FORMATS = ["solve", "pickTrue", "pickFalse", "numberLine", "sequence", "complement", "chain", "wall", "match", "compareTerms"];
var RULE_FORMATS = ["twoStep", "pointBeforeLine", "chain"];
var MULTI_STEP = ["chain", "wall", "match"];
var TARGETS = ["enemy", "hero", "enemies"];
var INTENT_TYPES = ["attack", "block"];
function validateCards(file, cards, errors, config) {
  const c = checker(file, cards, errors);
  for (const [id, card] of Object.entries(cards)) {
    c.number(`${id}.cost`, { min: 0, integer: true });
    c.number(`${id}.price`, { min: 0, integer: true });
    if (!["common", "rare"].includes(card.rarity)) c.fail(`${id}.rarity`, "common oder rare");
    c.number(`${id}.unlockStars`, { min: 0, integer: true });
    if (card.rarity === "rare" && card.unlockStars === 0) c.fail(`${id}.unlockStars`, "seltene Karten brauchen eine Sternzahl");
    if (!TARGETS.includes(card.target)) c.fail(`${id}.target`, `muss ${TARGETS.join(" oder ")} sein`);
    const type = card.effect?.type;
    if (!EFFECT_TYPES.includes(type)) {
      c.fail(`${id}.effect.type`, `unbekannt: ${type}`);
      continue;
    }
    if (type === "slowTime") {
      c.number(`${id}.effect.factor`, { min: 1, max: 4 });
      if (card.task !== null) c.fail(`${id}.task`, "slowTime hat keine Aufgabe (null)");
      continue;
    }
    if (type === "cycle") {
      c.number(`${id}.effect.discard`, { min: 0, integer: true });
      c.number(`${id}.effect.draw`, { min: 0, integer: true });
      if (card.task !== null) c.fail(`${id}.task`, "Strudel-Karten haben keine Aufgabe (null)");
      continue;
    }
    if (type === "breakImmunity" || type === "weaken" || type === "poison" || type === "thorns") c.number(`${id}.effect.turns`, { min: 1, integer: true });
    if (type === "damageBlock") c.number(`${id}.effect.block`, { min: 1, integer: true });
    if (card.effect.keep !== void 0) c.number(`${id}.effect.keep`, { min: 1, integer: true });
    if (card.effect.perStreak !== void 0) c.number(`${id}.effect.perStreak`, { min: 1, integer: true });
    if (type !== "breakImmunity") c.number(`${id}.effect.amount`, { min: 1, integer: true });
    if (type === "buff" && !BUFF_STATS.includes(card.effect.stat)) c.fail(`${id}.effect.stat`, `muss ${BUFF_STATS.join(", ")} sein`);
    const format = card.task?.format;
    if (!TASK_FORMATS.includes(format)) {
      c.fail(`${id}.task.format`, `unbekannt: ${format}`);
      continue;
    }
    if (format === "solve" && !OPERATIONS2.includes(card.task.operation)) c.fail(`${id}.task.operation`, `muss ${OPERATIONS2.join(", ")} sein`);
    if (card.task.ifLadder !== void 0 && !FORMAT_KINDS[card.task.ifLadder]) c.fail(`${id}.task.ifLadder`, "unbekannte Leiter");
    const wanted = ["damage", "breakImmunity", "weaken", "damageBlock", "damageTwo", "poison"].includes(type) ? "enemy" : ["damagePerStep", "damageAll"].includes(type) ? "enemies" : "hero";
    if (card.target !== wanted) c.fail(`${id}.target`, `muss ${wanted} sein (Wirkung ${type})`);
    if (type === "damagePerStep" && !MULTI_STEP.includes(format)) c.fail(`${id}.task.format`, "Schaden je Schritt braucht ein mehrschrittiges Format");
    if (card.task.freeMistakes !== void 0) c.number(`${id}.task.freeMistakes`, { min: 0, integer: true });
    if (card.upgrades !== void 0) {
      if (!Array.isArray(card.upgrades)) {
        c.fail(`${id}.upgrades`, "Liste");
        continue;
      }
      if (Array.isArray(config.game?.cardLevels) && card.upgrades.length !== config.game.cardLevels.length) c.fail(`${id}.upgrades`, `genau ${config.game.cardLevels.length} Stufen (wie cardLevels)`);
      card.upgrades.forEach((u, i) => {
        const keys = Object.keys(u ?? {});
        if (keys.length === 0 || keys.some((k) => k === "type" || !(k in card.effect))) c.fail(`${id}.upgrades[${i}]`, "nur vorhandene Werte der Wirkung, ohne type");
        else for (const k of keys) if (!(Number.isInteger(u[k]) && u[k] >= card.effect[k])) c.fail(`${id}.upgrades[${i}].${k}`, "ganze Zahl, nicht kleiner als Stufe 1");
      });
    }
  }
}
function validateDecks(file, decks, errors, config) {
  const c = checker(file, decks, errors);
  const unknownIn = (list) => [...new Set(list.filter((id) => !config.cards?.[id]))];
  if (!Array.isArray(decks.starter) || decks.starter.length === 0) c.fail("starter", "fehlt oder ist leer");
  else if (unknownIn(decks.starter).length) c.fail("starter", `unbekannte Karten: ${unknownIn(decks.starter).join(", ")}`);
  if (c.object("rewardPools")) {
    for (const [area, list] of Object.entries(decks.rewardPools)) {
      if (!Array.isArray(list) || list.length < Math.max(config.rewards?.cardChoices ?? 3, config.rewards?.shopCards ?? 3)) c.fail(`rewardPools.${area}`, "braucht mindestens so viele Karten wie zur Wahl oder beim H\xE4ndler stehen");
      else if (unknownIn(list).length) c.fail(`rewardPools.${area}`, `unbekannte Karten: ${unknownIn(list).join(", ")}`);
    }
  }
  if (!config.cards?.[decks.firstRewardIncludes]) c.fail("firstRewardIncludes", "muss eine vorhandene Karte sein");
}
function validateLevels(file, levels, errors) {
  const c = checker(file, levels, errors);
  const th = levels.xpThresholds;
  if (!Array.isArray(th) || th.length < 2 || th[0] !== 0 || th.some((v, i) => !Number.isInteger(v) || i > 0 && v <= th[i - 1])) {
    c.fail("xpThresholds", "muss mit 0 beginnen und streng steigen");
  }
  c.number("pointsPerLevel", { min: 1, integer: true });
  c.number("maxPointsPerStat", { min: 1, integer: true });
}
function validateDepths(file, d, errors) {
  const c = checker(file, d, errors);
  c.number("enemyPerDepth", { min: 0, max: 1 });
  c.number("rewardPerDepth", { min: 0, max: 1 });
  c.number("bossDeepPhaseFrom", { min: 2, integer: true });
  c.number("repeatBossPearlsFactor", { min: 0, max: 1 });
}
function validateElites(file, e, errors) {
  const c = checker(file, e, errors);
  c.number("fromDepth", { min: 2, integer: true });
  c.number("hpFactor", { min: 1, max: 3 });
  c.number("rewardPearls", { min: 0, integer: true });
  if (!c.object("rules")) return;
  const known = { guard: ["block", "every"], regen: ["heal"], rage: ["plus", "max"] };
  for (const [rule, cfg] of Object.entries(e.rules)) {
    if (!known[rule]) {
      c.fail(`rules.${rule}`, `unbekannt, erlaubt: ${Object.keys(known).join(", ")}`);
      continue;
    }
    for (const k of known[rule]) c.number(`rules.${rule}.${k}`, { min: 1, integer: true });
  }
}
var EVENT_EFFECTS = ["hp", "heal", "pearls", "card", "item", "fight"];
function validateEvents(file, ev, errors, config) {
  const c = checker(file, ev, errors);
  if (!Object.values(ev).some((e) => Array.isArray(e?.options) && e.options.every((o) => !(o?.effects ?? []).some((f) => f?.type === "fight")))) c.fail("(Ereignisse)", "mindestens ein Ereignis ohne Kampf");
  for (const [id, e] of Object.entries(ev)) {
    if (!Array.isArray(e?.options) || e.options.length < 2 || e.options.length > 3) {
      c.fail(`${id}.options`, "2 bis 3 Optionen");
      continue;
    }
    if (e.areas !== void 0 && (!Array.isArray(e.areas) || !e.areas.every((a) => config.areas?.areas?.[a]))) c.fail(`${id}.areas`, "Liste bekannter Gebiete");
    if (typeof config.texts?.events?.[id]?.text !== "string") c.fail(id, `Text events.${id}.text fehlt`);
    e.options.forEach((o, oi) => {
      const p = `${id}.options[${oi}]`;
      if (typeof o?.id !== "string" || !o.id) {
        c.fail(`${p}.id`, "fehlt");
        return;
      }
      if (typeof config.texts?.events?.[id]?.[o.id] !== "string") c.fail(p, `Text events.${id}.${o.id} fehlt`);
      if (!Array.isArray(o.effects)) {
        c.fail(`${p}.effects`, "Liste");
        return;
      }
      let big = 0;
      o.effects.forEach((f, fi) => {
        const q = `${p}.effects[${fi}]`;
        if (!EVENT_EFFECTS.includes(f?.type)) {
          c.fail(q, `unbekannte Wirkung ${f?.type}, erlaubt: ${EVENT_EFFECTS.join(", ")}`);
          return;
        }
        if (f.type === "hp" || f.type === "pearls") {
          if (!(Number.isInteger(f.amount) && f.amount !== 0)) c.fail(`${q}.amount`, "ganze Zahl ungleich 0");
        }
        if (f.type === "heal" && !(typeof f.share === "number" && f.share > 0 && f.share <= 1)) c.fail(`${q}.share`, "Zahl \xFCber 0 bis 1");
        if (f.type === "fight" && !(Number.isInteger(f.bonusPearls) && f.bonusPearls >= 0)) c.fail(`${q}.bonusPearls`, "ganze Zahl \u2265 0");
        if (f.type === "card" || f.type === "fight") big += 1;
      });
      if (big > 1) c.fail(p, "h\xF6chstens eine Karte oder ein Kampf je Option");
    });
    if (!e.options.some((o) => !(o?.effects ?? []).some((f) => f?.type === "pearls" && f.amount < 0))) c.fail(`${id}.options`, "mindestens eine Option ohne Perlenpreis");
  }
}
function validateTalents(file, tal, errors, config) {
  const c = checker(file, tal, errors);
  const keys = Object.keys(tal);
  if (keys.join() !== "5,10,15,20") c.fail("(Stufen)", "genau 5, 10, 15 und 20");
  const seen = /* @__PURE__ */ new Set();
  for (const [lv, list] of Object.entries(tal)) {
    if (!Array.isArray(list) || list.length !== 2) {
      c.fail(lv, "genau zwei Talente");
      continue;
    }
    list.forEach((x, i) => {
      if (typeof x?.id !== "string" || seen.has(x.id)) c.fail(`${lv}[${i}].id`, "fehlt oder doppelt");
      seen.add(x?.id);
      checkEffect(c, `${lv}[${i}].effect`, x?.effect);
      if (!config.texts?.talents?.[x?.id]?.name || !config.texts?.talents?.[x?.id]?.text) c.fail(`${lv}[${i}]`, `Text talents.${x?.id} fehlt`);
    });
  }
}
function validateRewards(file, r, errors) {
  const c = checker(file, r, errors);
  for (const k of ["xpPerEnemy", "xpBoss", "pearlsBoss"]) c.number(k, { min: 0, integer: true });
  c.number("cardChoices", { min: 1, integer: true });
  c.number("shopCards", { min: 1, integer: true });
  c.number("removePrice", { min: 0, integer: true });
  c.number("minDeckSize", { min: 1, integer: true });
  c.number("restHealShare", { min: 0, max: 1 });
  const tp = r.treasurePearls;
  if (!Array.isArray(tp) || tp.length !== 2 || !tp.every((n) => Number.isInteger(n) && n >= 0) || tp[0] > tp[1]) c.fail("treasurePearls", "zwei ganze Zahlen [von, bis]");
  const p = r.pearlsPerEnemy;
  if (!Array.isArray(p) || p.length !== 2 || !p.every((n) => Number.isInteger(n) && n >= 0) || p[0] > p[1]) c.fail("pearlsPerEnemy", "zwei ganze Zahlen [von, bis]");
}
var HERO_EFFECTS = [
  "maxHp",
  "strength",
  "calmMs",
  "startBlock",
  "healBonus",
  "discards",
  "extraPearls",
  "firstTurnEnergy",
  "healAfterWin",
  "streakMaxBonus",
  "restHealShare",
  "secondWind",
  "handSize"
];
function checkEffect(c, path, effect) {
  if (!effect || typeof effect !== "object" || Object.keys(effect).length === 0) {
    c.fail(path, "Wirkung fehlt");
    return;
  }
  for (const [k, v] of Object.entries(effect)) {
    if (!HERO_EFFECTS.includes(k)) c.fail(`${path}.${k}`, `unbekannt, erlaubt: ${HERO_EFFECTS.join(", ")}`);
    else if (!(Number.isInteger(v) && v > 0)) c.fail(`${path}.${k}`, "ganze Zahl ab 1");
  }
}
function validateItems(file, items, errors) {
  const c = checker(file, items, errors);
  for (const [id, it] of Object.entries(items)) {
    if (!["kopf", "koerper", "hand"].includes(it.slot)) c.fail(`${id}.slot`, "kopf, koerper oder hand");
    c.number(`${id}.price`, { min: 0, integer: true });
    checkEffect(c, `${id}.effect`, it.effect);
  }
}
function validateHeroes(file, h, errors) {
  const c = checker(file, h, errors);
  if (!h.figures || typeof h.figures !== "object" || Object.keys(h.figures).length === 0) c.fail("figures", "mindestens eine Figur");
  else for (const [id, f] of Object.entries(h.figures)) {
    if (typeof f?.asset !== "string") c.fail(`figures.${id}.asset`, "fehlt");
    if (f.perk !== void 0) checkEffect(c, `figures.${id}.perk`, f.perk);
    if (f.poseAnchor !== void 0 && !(typeof f.poseAnchor === "number" && f.poseAnchor >= 0 && f.poseAnchor <= 1)) c.fail(`figures.${id}.poseAnchor`, "Zahl von 0 bis 1");
  }
  for (const list of ["nameA", "nameB"]) {
    const l = h[list];
    if (!Array.isArray(l) || l.length === 0 || l.some((w) => typeof w !== "string" || w.trim() === "")) c.fail(list, "Liste nicht leerer W\xF6rter");
    else if (new Set(l).size !== l.length) c.fail(list, "W\xF6rter doppelt");
  }
}
function validateEnemies(file, enemies, errors) {
  checkEnemyList(checker(file, enemies, errors), enemies, "");
}
function checkEnemyList(c, enemies, prefix) {
  for (const [key, e] of Object.entries(enemies)) {
    const id = prefix + key;
    c.number(`${id}.hp`, { min: 1, integer: true });
    if (e.immune !== null && e.immune !== void 0 && !OPERATIONS2.includes(e.immune)) c.fail(`${id}.immune`, `muss ${OPERATIONS2.join(", ")} oder null sein`);
    if (!Array.isArray(e.pattern) || e.pattern.length === 0) c.fail(`${id}.pattern`, "fehlt oder ist leer");
    else e.pattern.forEach((step, i) => {
      if (!INTENT_TYPES.includes(step?.type) || !(Number.isInteger(step.amount) && step.amount >= 0)) c.fail(`${id}.pattern[${i}]`, "braucht type attack/block und amount \u2265 0");
    });
    if (e.rule !== void 0 && e.rule !== null) checkRule(c, `${id}.rule`, e.rule);
    for (const key2 of ["phases", "deepPhases"]) {
      if (e[key2] === void 0) continue;
      if (!Array.isArray(e[key2])) c.fail(`${id}.${key2}`, "Liste");
      else e[key2].forEach((ph, i) => {
        if (!(Number.isInteger(ph?.belowHpPercent) && ph.belowHpPercent > 0 && ph.belowHpPercent < 100)) c.fail(`${id}.${key2}[${i}].belowHpPercent`, "1 bis 99");
        if (!Array.isArray(ph?.pattern) || ph.pattern.length === 0 || ph.pattern.some((st) => !INTENT_TYPES.includes(st?.type) || !(Number.isInteger(st.amount) && st.amount >= 0))) c.fail(`${id}.${key2}[${i}].pattern`, "Muster aus attack/block");
        if (ph?.rule !== void 0 && ph.rule !== null) checkRule(c, `${id}.${key2}[${i}].rule`, ph.rule);
      });
    }
    if (e.shieldedBy !== void 0) {
      if (!Array.isArray(e.shieldedBy) || e.shieldedBy.some((o) => !enemies[o])) c.fail(`${id}.shieldedBy`, "muss vorhandene Gegner nennen");
    }
  }
}
function checkRule(c, path, r) {
  if (r.type === "hidden") {
    if (r.find !== "numberLine") c.fail(`${path}.find`, "nur numberLine");
    if (!(Number.isInteger(r.multiplier) && r.multiplier >= 1)) c.fail(`${path}.multiplier`, "ganze Zahl ab 1");
  } else if (r.type === "taskModifier") {
    if (!RULE_FORMATS.includes(r.format)) c.fail(`${path}.format`, `muss ${RULE_FORMATS.join(", ")} sein`);
  } else if (r.type === "rotatingImmunity") {
    if (!Array.isArray(r.order) || r.order.length < 2 || r.order.some((op) => !OPERATIONS2.includes(op)) || new Set(r.order).size !== r.order.length) {
      c.fail(`${path}.order`, `mindestens zwei verschiedene aus ${OPERATIONS2.join(", ")}`);
    }
  } else c.fail(`${path}.type`, "hidden, taskModifier oder rotatingImmunity");
}
function validateRiddles(file, r, errors) {
  const c = checker(file, r, errors);
  const LADDERS2 = { wall: "wall", sequence: "seq" };
  if (!Array.isArray(r.formats) || r.formats.length === 0 || r.formats.some((f) => LADDERS2[f?.format] !== f?.ladder)) c.fail("formats", "Liste aus { format: wall, ladder: wall } und { format: sequence, ladder: seq }");
  c.number("freeMistakes", { min: 0, max: 5, integer: true });
  if (!Array.isArray(r.pearls) || r.pearls.length !== 2 || !r.pearls.every((n) => Number.isInteger(n) && n >= 0) || r.pearls[0] > r.pearls[1]) c.fail("pearls", "[von, bis] als ganze Zahlen");
}
var STATION_EFFECTS = { diveStartBlock: [1, 10], extraRest: [1, 1] };
function validateStation(file, st, errors, config) {
  const c = checker(file, st, errors);
  let last = 0;
  for (const [id, it] of Object.entries(st)) {
    c.number(`${id}.price`, { min: 1, integer: true });
    if (Number.isInteger(it?.price) && it.price <= last) c.fail(`${id}.price`, "Preise steigen in der Reihenfolge der Datei");
    if (Number.isInteger(it?.price)) last = it.price;
    for (const k of ["x", "y", "w"]) c.number(`${id}.slot.${k}`, { min: 0, max: 1 });
    if (it?.slotPortrait !== void 0) for (const k of ["x", "y", "w"]) c.number(`${id}.slotPortrait.${k}`, { min: 0, max: 1 });
    if (it?.effect !== void 0) {
      const entries = Object.entries(it.effect ?? {});
      if (entries.length !== 1 || !STATION_EFFECTS[entries[0][0]]) c.fail(`${id}.effect`, `genau ein Vorteil aus ${Object.keys(STATION_EFFECTS).join(", ")}`);
      else {
        const [k, v] = entries[0];
        c.number(`${id}.effect.${k}`, { min: STATION_EFFECTS[k][0], max: STATION_EFFECTS[k][1], integer: true });
      }
    }
    if (config?.texts && typeof config.texts.station?.items?.[id]?.name !== "string") c.fail(id, "Name fehlt in texts station.items");
  }
}
function validateBosses(file, b, errors) {
  const c = checker(file, b, errors);
  if (!c.object("bosses") || !c.object("encounters")) return;
  checkEnemyList(c, b.bosses, "bosses.");
  for (const [id, list] of Object.entries(b.encounters)) {
    if (!Array.isArray(list) || list.length === 0) {
      c.fail(`encounters.${id}`, "fehlt oder ist leer");
      continue;
    }
    const unknown = list.filter((typeId) => !b.bosses[typeId]);
    if (unknown.length) c.fail(`encounters.${id}`, `unbekannte Bosse: ${unknown.join(", ")}`);
  }
}
function checkGroup(c, path, group, config) {
  const types = group.map((id) => config.enemies?.[id] ?? config.bosses?.bosses?.[id]);
  const unknown = group.filter((id, i) => !types[i]);
  if (unknown.length) {
    c.fail(path, `unbekannte Gegner: ${unknown.join(", ")}`);
    return;
  }
  const shielded = types.some((t2) => (t2.shieldedBy ?? []).length > 0);
  const immunities = types.map((t2) => t2.immune ?? null);
  if (!shielded && group.length > 1 && immunities[0] !== null && immunities.every((im) => im === immunities[0])) {
    c.fail(path, `alle Gegner haben dieselbe Immunit\xE4t (${immunities[0]})`);
  }
}
function validateStarterCoverage(c, config) {
  const ops = new Set((config.decks?.starter ?? []).map((id) => config.cards?.[id]).filter((card) => card?.effect?.type === "damage" && card.task?.operation).map((card) => card.task.operation));
  const all = { ...config.enemies ?? {}, ...config.bosses?.bosses ?? {} };
  for (const [id, e] of Object.entries(all)) {
    if (![...ops].some((op) => op !== e.immune)) c.fail(id, "keine passende Schadenskarte im Startdeck");
  }
}
var ROOM_TYPES = ["combat", "rest", "boss", "treasure", "shop", "elite", "event", "riddle"];
var FIGHT_TYPES = ["combat", "elite"];
var CHOICE_TYPES = ["combat", "rest", "treasure", "shop", "event", "riddle"];
function validateLayers(c, lp, dp, layers, config) {
  if (!Array.isArray(layers) || layers.length === 0) {
    c.fail(lp, "fehlt oder ist leer");
    return;
  }
  if (layers.at(-1)?.rooms?.length !== 1 || layers.at(-1).rooms[0].type !== "boss") c.fail(lp, "letzte Schicht muss genau ein Boss-Raum sein");
  const sizes = layers.map((l) => Array.isArray(l?.rooms) ? l.rooms.length : 0);
  if (sizes.some((n) => n < 1 || n > 3)) c.fail(lp, "jede Schicht braucht 1 bis 3 R\xE4ume");
  if (sizes.some((n, i) => i > 0 && Math.abs(n - sizes[i - 1]) > 1)) c.fail(lp, "benachbarte Schichten d\xFCrfen sich um h\xF6chstens einen Raum unterscheiden");
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total < 7 || total > 9) c.fail(lp, `7 bis 9 R\xE4ume, gefunden ${total}`);
  if (layers.slice(0, -1).some((l) => l?.rooms?.some((r) => r.type === "boss"))) c.fail(lp, "Boss nur in der letzten Schicht");
  layers.forEach((layer, li) => {
    if (!Array.isArray(layer?.rooms) || layer.rooms.length === 0) {
      c.fail(`${lp}[${li}].rooms`, "fehlt oder ist leer");
      return;
    }
    layer.rooms.forEach((room, ri) => {
      const p = `${lp}[${li}].rooms[${ri}]`;
      let types;
      if (room.choices !== void 0) {
        if (room.type !== void 0) {
          c.fail(p, "entweder type oder choices");
          return;
        }
        if (!Array.isArray(room.choices) || room.choices.length < 2 || !room.choices.every((x) => CHOICE_TYPES.includes(x))) {
          c.fail(`${p}.choices`, `mindestens zwei aus ${CHOICE_TYPES.join(", ")}`);
          return;
        }
        types = room.choices;
      } else {
        if (!ROOM_TYPES.includes(room.type)) {
          c.fail(`${p}.type`, `muss ${ROOM_TYPES.join(", ")} sein`);
          return;
        }
        types = [room.type];
      }
      if (room.fromDepth !== void 0) {
        if (!(Number.isInteger(room.fromDepth) && room.fromDepth >= 2)) c.fail(`${p}.fromDepth`, "ganze Zahl ab 2");
        const fb = room.fallback;
        if (!fb || !["combat", "rest", "treasure", "shop"].includes(fb.type)) c.fail(`${p}.fallback`, "Ersatzraum mit type combat, rest, treasure oder shop");
        else if (fb.type === "combat" && (!Array.isArray(fb.pool) || fb.pool.length === 0)) c.fail(`${p}.fallback.pool`, "fehlt oder ist leer");
      }
      if (room.type === "elite" && !(Number.isInteger(room.fromDepth) && room.fromDepth >= (config.elites?.fromDepth ?? 1))) c.fail(`${p}.fromDepth`, `Eliteraum braucht fromDepth ab ${config.elites?.fromDepth}`);
      if (types.includes("combat") || types.includes("elite") || room.type === "event" && room.pool) {
        if (!Array.isArray(room.pool) || room.pool.length === 0) c.fail(`${p}.pool`, "fehlt oder ist leer");
        else room.pool.forEach((group, gi) => {
          if (!Array.isArray(group) || group.length < 1 || group.length > 3) c.fail(`${p}.pool[${gi}]`, "1 bis 3 Gegner");
          else checkGroup(c, `${p}.pool[${gi}]`, group, config);
        });
      }
      if (room.deepPools !== void 0) {
        if (!Array.isArray(room.deepPools)) c.fail(`${p}.deepPools`, "Liste");
        else room.deepPools.forEach((dpool, di) => {
          if (!(Number.isInteger(dpool?.fromDepth) && dpool.fromDepth >= 2)) c.fail(`${p}.deepPools[${di}].fromDepth`, "ganze Zahl ab 2");
          if (!Array.isArray(dpool?.groups) || dpool.groups.length === 0) {
            c.fail(`${p}.deepPools[${di}].groups`, "fehlt oder ist leer");
            return;
          }
          dpool.groups.forEach((group, gi) => {
            if (!Array.isArray(group) || group.length < 1 || group.length > 3) c.fail(`${p}.deepPools[${di}].groups[${gi}]`, "1 bis 3 Gegner");
            else checkGroup(c, `${p}.deepPools[${di}].groups[${gi}]`, group, config);
          });
        });
      }
      if (types.includes("boss")) {
        const enc = config.bosses?.encounters?.[room.encounter];
        if (!enc) c.fail(`${p}.encounter`, `unbekannte Begegnung: ${room.encounter}`);
        else checkGroup(c, `${p}.encounter`, enc, config);
      }
      if (types.includes("combat") || types.includes("boss") || types.includes("elite")) c.number(`${dp}.${li}.rooms.${ri}.level`, { min: 1, integer: true });
    });
  });
  layers.forEach((layer, li) => {
    if (Array.isArray(layer?.rooms) && layer.rooms.length === 1 && (layer.rooms[0].type === "elite" || layer.rooms[0].choices?.includes("elite"))) c.fail(`${lp}[${li}]`, "Eliteraum nie allein in einer Schicht");
  });
  if (layers.length >= 2 && layers.every((l) => Array.isArray(l?.rooms) && l.rooms.length)) {
    const fight = (spec) => Boolean(spec) && (FIGHT_TYPES.includes(spec.type) && (spec.fallback === void 0 || fight(spec.fallback)) || Array.isArray(spec.choices) && spec.choices.every((x) => FIGHT_TYPES.includes(x)));
    const walk = (li, si, n) => {
      const here = n + (fight(layers[li].rooms[si]) ? 1 : 0);
      if (li >= layers.length - 2) return here >= 2;
      return nextSlots(si, layers[li + 1].rooms.length, layers[li].rooms.length).every((x) => walk(li + 1, x, here));
    };
    if (!layers[0].rooms.every((_, si) => walk(0, si, 0))) c.fail(lp, "jeder Weg braucht mindestens zwei K\xE4mpfe vor dem Boss");
  }
}
function validateAreas(file, a, errors, config) {
  const c = checker(file, a, errors);
  if (!c.object("areas")) return;
  if (!Array.isArray(a.order) || a.order.length === 0) c.fail("order", "fehlt oder ist leer");
  else {
    const missing = a.order.filter((id) => !a.areas[id]);
    if (missing.length) c.fail("order", `unbekannte Gebiete: ${missing.join(", ")}`);
  }
  for (const [areaId, area] of Object.entries(a.areas)) {
    const base = `areas.${areaId}`;
    c.number(`${base}.price`, { min: 0, integer: true });
    if (a.order?.[0] === areaId && area.price !== 0) c.fail(`${base}.price`, "das erste Gebiet kostet 0");
    if (area.comingSoon === true) continue;
    if (area.rankFrom !== void 0 && (area.rankFrom === areaId || !a.areas[area.rankFrom])) c.fail(`${base}.rankFrom`, "anderes vorhandenes Gebiet");
    if (!config.decks?.rewardPools?.[areaId]) c.fail(base, "kein Beutepool in decks.json");
    for (const grade of ["class3", "class4"]) {
      if (!config[grade]?.windows) continue;
      const win = config[grade].windows[area.curriculum] ?? {};
      for (const cardId of /* @__PURE__ */ new Set([...config.decks?.rewardPools?.[areaId] ?? [], ...config.decks?.starter ?? []])) {
        const task = config.cards?.[cardId]?.task;
        const ladder3 = task?.format === "solve" ? task.operation : FORMAT_LADDER[task?.format];
        if (ladder3 && !win[ladder3]) c.fail(base, `Karte ${cardId} braucht die Leiter ${ladder3} im Fenster (${grade}.windows.${area.curriculum})`);
      }
    }
    if (area.moreLayouts !== void 0 && !Array.isArray(area.moreLayouts)) c.fail(`${base}.moreLayouts`, "Liste von Vorlagen");
    validateLayers(c, `${base}.layers`, `${base}.layers`, area.layers, config);
    (Array.isArray(area.moreLayouts) ? area.moreLayouts : []).forEach((l, i) => validateLayers(c, `${base}.moreLayouts[${i}].layers`, `${base}.moreLayouts.${i}.layers`, l?.layers, config));
  }
  validateStarterCoverage(checker("decks/startdeck", {}, errors), config);
}
var WAVES = ["sine", "triangle", "square", "sawtooth"];
function validateSounds(file, s, errors) {
  const c = checker(file, s, errors);
  const steps = s.volumeSteps;
  if (!Array.isArray(steps) || steps.length === 0 || !steps.every((v) => typeof v === "number" && v >= 0 && v <= 1)) c.fail("volumeSteps", "Liste von Zahlen 0 bis 1");
  else if (!steps.includes(s.defaultVolume)) c.fail("defaultVolume", "muss in volumeSteps stehen");
  if (!c.object("sounds")) return;
  for (const [key, snd] of Object.entries(s.sounds)) {
    const p = `sounds.${key}`;
    if (!WAVES.includes(snd?.wave)) c.fail(`${p}.wave`, `muss ${WAVES.join(", ")} sein`);
    if (!Array.isArray(snd?.notes) || snd.notes.length === 0 || !snd.notes.every((hz) => typeof hz === "number" && hz >= 20 && hz <= 5e3)) c.fail(`${p}.notes`, "Liste von Tonh\xF6hen 20 bis 5000 Hz");
    c.number(`${p}.noteMs`, { min: 10, max: 2e3 });
    c.number(`${p}.gain`, { min: 0, max: 1 });
  }
  for (const group of ["events", "ui"]) {
    if (!c.object(group)) continue;
    for (const [k, v] of Object.entries(s[group])) if (!s.sounds[v]) c.fail(`${group}.${k}`, `unbekannter Klang: ${v}`);
  }
  if (c.object("music")) {
    if (!WAVES.includes(s.music.wave)) c.fail("music.wave", `muss ${WAVES.join(", ")} sein`);
    if (!Array.isArray(s.music.notes) || s.music.notes.length === 0) c.fail("music.notes", "fehlt");
    c.number("music.gain", { min: 0, max: 0.2 });
    c.number("music.lfoHz", { min: 0, max: 5 });
    c.number("music.lfoDepth", { min: 0, max: 0.2 });
  }
  if (s.tracks !== void 0 && c.object("tracks")) {
    for (const [id, tr] of Object.entries(s.tracks)) {
      if (typeof tr?.file !== "string" || !tr.file.startsWith("assets/audio/")) c.fail(`tracks.${id}.file`, "Pfad unter assets/audio/");
      c.number(`tracks.${id}.loopSeconds`, { min: 5, max: 600 });
      c.number(`tracks.${id}.gain`, { min: 0, max: 1 });
    }
  }
  if (s.ambience !== void 0 && c.object("ambience")) {
    if (!s.ambience.base) c.fail("ambience.base", "fehlt (Station)");
    for (const [id, a] of Object.entries(s.ambience)) {
      const p = `ambience.${id}`;
      c.number(`${p}.noiseGain`, { min: 0, max: 0.2 });
      c.number(`${p}.cutoffHz`, { min: 50, max: 5e3 });
      c.number(`${p}.swingHz`, { min: 0, max: 2e3 });
      c.number(`${p}.swellHz`, { min: 0, max: 2 });
      if (!Array.isArray(a?.drone) || a.drone.length === 0 || !a.drone.every((hz) => typeof hz === "number" && hz >= 20 && hz <= 500)) c.fail(`${p}.drone`, "Liste von Tonh\xF6hen 20 bis 500 Hz");
      const b = a?.bubbles;
      const range = (v, min, max) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === "number" && x >= min && x <= max) && v[0] <= v[1];
      if (!b || typeof b !== "object") {
        c.fail(`${p}.bubbles`, "fehlt");
        continue;
      }
      if (!range(b.everyMs, 200, 6e4)) c.fail(`${p}.bubbles.everyMs`, "[von, bis] in ms, 200 bis 60000");
      if (!range(b.count, 1, 6)) c.fail(`${p}.bubbles.count`, "[von, bis], 1 bis 6");
      c.number(`${p}.bubbles.gain`, { min: 0, max: 0.3 });
      c.number(`${p}.bubbles.fromHz`, { min: 20, max: 5e3 });
      c.number(`${p}.bubbles.toHz`, { min: 20, max: 5e3 });
      c.number(`${p}.bubbles.ms`, { min: 20, max: 2e3 });
    }
  }
}
var VALIDATORS = {
  game: validateGame,
  texts: validateTexts,
  class3: validateCurriculum,
  class4: validateCurriculum,
  cards: validateCards,
  decks: validateDecks,
  enemies: validateEnemies,
  bosses: validateBosses,
  areas: validateAreas,
  levels: validateLevels,
  rewards: validateRewards,
  depths: validateDepths,
  elites: validateElites,
  events: validateEvents,
  riddles: validateRiddles,
  station: validateStation,
  talents: validateTalents,
  heroes: validateHeroes,
  items: validateItems,
  sounds: validateSounds
};
function validateConfig(config) {
  const errors = [];
  for (const [key, file] of Object.entries(CONFIG_FILES)) {
    const data = config?.[key];
    if (data === null || typeof data !== "object") {
      errors.push(`${file}: (Datei): fehlt oder ist kein JSON-Objekt`);
      continue;
    }
    VALIDATORS[key]?.(file, data, errors, config);
  }
  return errors;
}

// src/engine/combat/current.js
function answerCode({ outcome, tierId }) {
  if (outcome !== "correct") return "f";
  return tierId === "lightning" || tierId === "fast" ? "s" : "r";
}
var round2 = (x) => Math.round(x * 100) / 100;
function nextCurrent(level, answers, cfg, { allowUp = true } = {}) {
  const recent = answers.slice(-cfg.recentAnswers);
  if (recent.length < cfg.minAnswers) return level;
  const correct = recent.filter((a) => a !== "f").length / recent.length;
  const fast = recent.filter((a) => a === "s").length / recent.length;
  if (correct >= cfg.upAccuracy && fast > cfg.upFastShare) return allowUp ? round2(Math.min(cfg.max, level + cfg.step)) : level;
  if (correct < cfg.downAccuracy) return round2(Math.max(cfg.min, level - cfg.step));
  return level;
}

// src/engine/hero/hero.js
var STATS2 = ["kraft", "ruhe", "leben"];
var SLOTS2 = ["kopf", "koerper", "hand"];
var EFFECT_KEYS = [
  "maxHp",
  "strength",
  "calmMs",
  "startBlock",
  "healBonus",
  "discards",
  "extraPearls",
  // Talente (Phase 9, Etappe 3)
  "firstTurnEnergy",
  "healAfterWin",
  "streakMaxBonus",
  "restHealShare",
  "secondWind",
  "handSize"
];
var TALENT_LEVELS = ["5", "10", "15", "20"];
function talentEffect(level, id, config) {
  return config.talents?.[level]?.find((x) => x.id === id)?.effect ?? null;
}
function heroStats(save, config) {
  const g = config.game;
  const bonus = Object.fromEntries(EFFECT_KEYS.map((k) => [k, 0]));
  const add = (effect) => {
    for (const [k, v] of Object.entries(effect ?? {})) bonus[k] += v;
  };
  add(config.heroes.figures[save.held.figur]?.perk);
  for (const id of Object.values(save.ausruestung?.angelegt ?? {})) if (id) add(config.items?.[id]?.effect);
  for (const [level, id] of Object.entries(save.talente ?? {})) if (id && save.stufe >= Number(level)) add(talentEffect(level, id, config));
  return {
    maxHp: g.hero.maxHp + save.punkte.leben * g.stats.hpPerPoint + bonus.maxHp,
    strength: save.punkte.kraft + bonus.strength,
    // Ruhe in Punkten: jeder Punkt eine Sekunde (stats.calmMsPerPoint)
    calm: save.punkte.ruhe + bonus.calmMs / g.stats.calmMsPerPoint,
    startBlock: bonus.startBlock,
    healBonus: bonus.healBonus,
    discards: g.hero.discardsPerTurn + bonus.discards,
    extraPearls: bonus.extraPearls,
    firstTurnEnergy: bonus.firstTurnEnergy,
    healAfterWin: bonus.healAfterWin,
    streakMaxBonus: bonus.streakMaxBonus,
    restHealShare: Math.min(1, bonus.restHealShare),
    secondWind: bonus.secondWind,
    handSize: g.hero.handSize + bonus.handSize
  };
}
function maxHp(save, config) {
  return heroStats(save, config).maxHp;
}
function freePoints(save, config) {
  const earned = (save.stufe - 1) * config.levels.pointsPerLevel;
  const spent = STATS2.reduce((sum, k) => sum + save.punkte[k], 0);
  return Math.max(0, earned - spent);
}
function spendPoint(save, stat, config) {
  if (!STATS2.includes(stat) || freePoints(save, config) <= 0) return false;
  if (save.punkte[stat] >= (config.levels.maxPointsPerStat ?? Infinity)) return false;
  save.punkte[stat] += 1;
  return true;
}
function resetPoints(save) {
  for (const k of STATS2) save.punkte[k] = 0;
}
function heroName(save, config) {
  const { nameA, nameB } = config.heroes;
  return `${nameA[save.held.nameA]} ${nameB[save.held.nameB]}`;
}

// src/engine/progression/depth.js
var round22 = (x) => Math.round(x * 100) / 100;
function depthPower(depth, depths) {
  return round22(1 + depths.enemyPerDepth * (depth - 1));
}
function rewardFactor(depth, depths) {
  return round22(1 + depths.rewardPerDepth * (depth - 1));
}
function starCount(save) {
  return Object.values(save.gebiete ?? {}).reduce((sum, g) => sum + (Number.isInteger(g?.tiefe) ? g.tiefe : 0), 0);
}
function openDepths(save, areaId) {
  return (save.gebiete?.[areaId]?.tiefe ?? 0) + 1;
}
function areasToOpen(save, config) {
  const stars = starCount(save);
  return config.areas.order.filter((id) => {
    const area = config.areas.areas[id];
    return !save.gebiete?.[id]?.offen && !area.comingSoon && area.price <= stars;
  });
}

// src/engine/progression/progression.js
function unlockedCards(save, config) {
  const stars = starCount(save);
  return Object.keys(config.cards).filter((id) => (config.cards[id].unlockStars ?? 0) <= stars);
}
function offerable(save, cardId, config, { depth = 1, elite = false } = {}) {
  const def = config.cards[cardId];
  if ((def.unlockStars ?? 0) > starCount(save)) return false;
  return def.rarity !== "rare" || depth >= config.elites.fromDepth || elite;
}
function grantXp(save, amount, config) {
  const before = save.stufe;
  save.ep += amount;
  const th = config.levels.xpThresholds;
  let stufe = 1;
  for (let i = 1; i < th.length; i++) if (save.ep >= th[i]) stufe = i + 1;
  save.stufe = Math.max(before, stufe);
  return { levelUps: save.stufe - before };
}
function rollRewardCards(save, areaId, rng, config, { depth = 1, elite = false } = {}) {
  const full = config.decks.rewardPools[areaId];
  if (!full) throw new Error(`kein Beutepool f\xFCr ${areaId}`);
  const pool = full.filter((id) => offerable(save, id, config, { depth, elite }));
  const count = config.rewards.cardChoices;
  const must = config.decks.firstRewardIncludes;
  const chosen = [];
  if (must && pool.includes(must) && !(save.deck[must] > 0)) chosen.push(must);
  if (elite) {
    const rare = rng.shuffle(pool.filter((id) => config.cards[id].rarity === "rare"))[0];
    if (rare && !chosen.includes(rare)) chosen.push(rare);
  }
  for (const id of rng.shuffle(pool)) {
    if (chosen.length >= count) break;
    if (!chosen.includes(id)) chosen.push(id);
  }
  return rng.shuffle(chosen);
}
function addCardToDeck(save, cardId) {
  save.deck[cardId] = (save.deck[cardId] ?? 0) + 1;
  if (Array.isArray(save.gefunden) && !save.gefunden.includes(cardId)) save.gefunden.push(cardId);
}
function deckList(save) {
  return Object.entries(save.deck).flatMap(([id, n]) => Array(n).fill(id));
}
function addPractice(save, entries, now, config) {
  for (const { key, text: text2, stufe: given } of entries) {
    const stufe = given ?? save.uebung[key]?.stufe;
    delete save.uebung[key];
    save.uebung[key] = stufe ? { text: text2, t: now, stufe, richtig: 0 } : { text: text2, t: now };
  }
  const keys = Object.keys(save.uebung);
  const max = config.game.practiceListMax;
  if (keys.length <= max) return;
  const ordered = keys.map((k, i) => ({ k, t: save.uebung[k].t, i })).sort((a, b) => b.t - a.t || b.i - a.i);
  const keep = new Set(ordered.slice(0, max).map((x) => x.k));
  for (const k of keys) if (!keep.has(k)) delete save.uebung[k];
}
var upgradable = (cardId, config) => (config.cards[cardId]?.upgrades?.length ?? 0) > 0;
function cardLevel(save, cardId, config) {
  if (!upgradable(cardId, config)) return 1;
  const n = save.karten?.[cardId]?.richtig ?? 0;
  const max = 1 + config.cards[cardId].upgrades.length;
  const reached = config.game.cardLevels.filter((need) => n >= need).length;
  return Math.min(max, 1 + reached);
}
function countCorrect(save, cardId, config) {
  if (!upgradable(cardId, config)) return null;
  const before = cardLevel(save, cardId, config);
  save.karten[cardId] = { richtig: (save.karten[cardId]?.richtig ?? 0) + 1 };
  const after = cardLevel(save, cardId, config);
  return after > before ? after : null;
}
function cardLevels(save, config) {
  const out = {};
  for (const cardId of Object.keys(save.karten ?? {})) {
    const level = cardLevel(save, cardId, config);
    if (level > 1) out[cardId] = level;
  }
  return out;
}
function toNextLevel(save, cardId, config) {
  if (!upgradable(cardId, config)) return null;
  const level = cardLevel(save, cardId, config);
  if (level >= 1 + config.cards[cardId].upgrades.length) return null;
  const need = config.game.cardLevels[level - 1];
  return need - (save.karten?.[cardId]?.richtig ?? 0);
}

// src/engine/shop/shop.js
function createShopOffer(save, areaId, rng, config, { depth = 1 } = {}) {
  const full = config.decks.rewardPools[areaId];
  if (!full) throw new Error(`kein Beutepool f\xFCr ${areaId}`);
  const pool = full.filter((id) => offerable(save, id, config, { depth }));
  const ids = [...new Set(rng.shuffle(pool))].slice(0, config.rewards.shopCards);
  return {
    cards: ids.map((cardId) => ({ cardId, price: config.cards[cardId].price })),
    removePrice: config.rewards.removePrice
  };
}
function attackOperations(deck, config) {
  const ops = /* @__PURE__ */ new Set();
  for (const [id, n] of Object.entries(deck)) {
    const def = config.cards[id];
    if (n > 0 && def?.effect.type === "damage" && def.task?.operation) ops.add(def.task.operation);
  }
  return ops;
}
function removalBlockedReason(save, cardId, config) {
  if (!(save.deck[cardId] > 0)) return "card";
  const size = Object.values(save.deck).reduce((a, b) => a + b, 0);
  if (size - 1 < config.rewards.minDeckSize) return "deckTooSmall";
  const after = { ...save.deck, [cardId]: save.deck[cardId] - 1 };
  if (attackOperations(after, config).size < 2) return "lastAttackTypes";
  return null;
}

// src/engine/dungeon/events.js
var hasFight = (ev) => ev.options.some((o) => o.effects.some((f) => f.type === "fight"));
function rollEvent(roomId, seed, config, areaId, withEnemies) {
  const ids = Object.keys(config.events).filter((id) => {
    const ev = config.events[id];
    return (!ev.areas || ev.areas.includes(areaId)) && (withEnemies || !hasFight(ev));
  });
  return createRng(deriveSeed(seed, `event:${roomId}`)).pick(ids);
}
function optionCost(option) {
  return option.effects.filter((f) => f.type === "pearls" && f.amount < 0).reduce((s, f) => s - f.amount, 0);
}

// src/engine/game.js
var reject2 = (reason) => [{ type: "rejected", reason }];
var clone2 = (o) => JSON.parse(JSON.stringify(o));
function createGame({ config, save, seed }) {
  const DEFAULT_SETTINGS = { mehrZeit: "off", ton: true, musik: true, wenigBewegung: false, lautstaerke: config.sounds.defaultVolume };
  const state = {
    save: save ? clone2(save) : null,
    screen: "title",
    // Neuladen landet immer hier; „Weiter“ führt zur Station (auch bei laufendem Tauchgang)
    grade: null,
    // gewählte Klassenstufe vor createHero
    logbookPage: null,
    pendingSettings: {},
    // Einstellungen vom Startbildschirm, solange es noch keinen Stand gibt
    combat: null,
    combatInfo: null,
    // { areaId, roomId, boss, enemyTypeIds, openTask, mistakes[], lightningHits }
    reward: null,
    // { cards, xp, pearls, levelUps, practice[], lightningHits }
    afterReward: null,
    // Bildschirm nach der Beute
    cleared: null,
    // { areaId, unlocked } nach dem Boss
    shop: null,
    // { roomId, offer } im Laden (Angebot aus dem Seed des Raums)
    event: null,
    // { roomId, eventId } im Ereignisraum (Phase 9)
    hp: save ? maxHp(save, config) : config.game.hero.maxHp,
    // nur Testkampf ohne Tauchgang
    combatCount: 0,
    loot: createRng(deriveSeed(seed, "loot")),
    runs: createRng(deriveSeed(seed, "runs")),
    map: null,
    // { seed, data } zwischengespeicherte Seekarte
    now: save?.geaendert ?? 0,
    tzOffset: 0,
    // Versatz der Zeitzone des Geräts in Minuten (wie getTimezoneOffset), für den Spieltag
    clockSet: false
    // Uhr von der Plattform gestellt (setNow); erst dann gibt es einen Tagesauftrag (Phase 10, Etappe 5)
  };
  if (state.save?.gebiete) for (const id of areasToOpen(state.save, config)) state.save.gebiete[id] = { geschafft: false, tiefe: 0, ...state.save.gebiete[id], offen: true };
  const SHIELD_PARTS = new Set(Object.values(config.bosses.bosses).flatMap((b) => b.shieldedBy ?? []));
  const BOOK = config.areas.order.flatMap((areaId) => {
    const area = config.areas.areas[areaId];
    const rooms = [area.layers, ...(area.moreLayouts ?? []).map((l) => l.layers)].flatMap((ls) => ls.flatMap((l) => l.rooms.flatMap((r) => [r, ...r.fallback ? [r.fallback] : []])));
    const own = [.../* @__PURE__ */ new Set([...rooms.flatMap((r) => (r.pool ?? []).flat()), ...rooms.flatMap((r) => (r.deepPools ?? []).flatMap((x) => x.groups.flat()))])];
    const boss = area.layers.at(-1).rooms[0].encounter;
    const bosses = (config.bosses.encounters[boss] ?? []).filter((id) => !SHIELD_PARTS.has(id));
    return [...own.map((typeId) => ({ typeId, areaId, boss: false })), ...bosses.map((typeId) => ({ typeId, areaId, boss: true }))];
  }).filter((x, i, all) => all.findIndex((y) => y.typeId === x.typeId) === i);
  const lauf = () => state.save?.lauf ?? null;
  function currentMap() {
    const l = lauf();
    if (!l) return null;
    if (state.map?.seed !== l.seed || state.map?.areaId !== l.gebiet) {
      const map = generateMap(config.areas.areas[l.gebiet], l.seed, config, l.tiefe ?? 1);
      state.map = { seed: l.seed, areaId: l.gebiet, data: l.vorrat ? addExtraRest(map) : map };
    }
    return state.map.data;
  }
  function reachable() {
    const map = currentMap();
    const l = lauf();
    const byId = Object.fromEntries(map.rooms.map((r) => [r.id, r]));
    const ids = l.position === null ? map.start : byId[l.position].next;
    return ids.filter((id) => !l.erledigt.includes(id));
  }
  function beginCombat({ enemyTypeIds, level, areaId, hp, combatSeed, roomId = null, boss = false, untimedTasks = 0, enemyPower = 1, depth = 1, elite = null, rescue = null }) {
    const s = state.save;
    let workshopBlock = 0;
    if (roomId !== null && lauf()?.werkstatt) workshopBlock = stationEffect("diveStartBlock");
    state.workshopUsed = workshopBlock > 0;
    const taskPlan = planFor({ areaId, level, boss, inDive: roomId !== null });
    const tutorial = untimedTasks > 0 && roomId !== null;
    const canRescue = rescue ?? (roomId !== null && !tutorial && config.game.rescue.enabled && !lauf()?.rettung);
    state.combat = createCombat({
      config,
      enemyTypeIds,
      // Stärke der Figur, Ausrüstung (Etappe 7) und Talente (Phase 9); zweite Luft nur einmal je Tauchgang
      hero: { ...heroStats(s, config), startBlock: heroStats(s, config).startBlock + workshopBlock, hp: Math.min(hp, maxHp(s, config)), secondWind: roomId !== null && !lauf()?.zweiteLuft ? heroStats(s, config).secondWind : 0 },
      deck: deckList(s),
      moreTime: s.einstellung.mehrZeit,
      areaId,
      level,
      seed: combatSeed,
      untimedTasks,
      grade: s.klasse,
      forgiving: tutorial,
      // D24: Fehler in der Erklärung kosten nichts
      cardLevels: cardLevels(s, config),
      // Kartenstufen (Etappe 8); Aufstieg gilt ab dem nächsten Kampf
      enemyPower,
      // Strömung (D33)
      depthPower: depthPower(depth, config.depths),
      // Tiefe des Tauchgangs (Phase 9)
      deep: depth >= config.depths.bossDeepPhaseFrom,
      elite,
      // Elitegegner (Phase 9, Etappe 2)
      taskPlan,
      rescue: Boolean(canRescue)
    });
    state.combatInfo = { areaId, roomId, boss, depth, elite: Boolean(elite), enemyTypeIds, openTask: null, mistakes: [], lightningHits: 0, tutorial, cardLevelUps: [], stageUps: [], stageChanged: [] };
    state.reward = null;
    state.screen = "combat";
    return state.combat.startEvents;
  }
  function planFor({ areaId, level, boss, inDive }) {
    const s = state.save;
    const cfg = config.game.learning;
    const cur = curriculumOf(config, s.klasse);
    const noIntro = Boolean(config.areas.areas[areaId]?.noIntro);
    const kind = boss ? "boss" : level === 1 && !noIntro ? "intro" : "normal";
    const rankFrom = config.areas.areas[areaId]?.rankFrom;
    const rankBase = rankFrom ? Object.fromEntries(Object.entries(cur.windows[rankFrom] ?? {}).map(([l, w]) => [l, w[0]])) : void 0;
    const extra = rankBase ? { rankBase } : {};
    if (!inDive || !cfg.enabled) return { ...planWithoutLearning(cur, areaId, kind, s.klasse), countable: false, ...extra };
    if (!noIntro && !isIntroduced(s.lernen, s.klasse, areaId)) {
      markIntroduced(s.lernen, s.klasse, areaId);
      return { ...planWithoutLearning(cur, areaId, "intro", s.klasse), countable: false, ...extra };
    }
    const windows = { ...cur.windows[areaId] };
    const stageOf = Object.fromEntries(Object.entries(windows).map(([ladder3, win]) => [ladder3, stageFor(s.lernen, s.klasse, areaId, ladder3, win)]));
    const practice = Object.entries(s.uebung).filter(([, e]) => e.stufe).sort((x, y) => x[1].t - y[1].t).map(([key, e]) => ({ key, stufe: e.stufe }));
    return { grade: s.klasse, stageOf, windows, countable: true, mixEvery: cfg.mixEvery, practiceEvery: missionPracticeEvery(s, config), practice, mixCount: mixCounts(s.lernen, s.klasse, areaId), ...extra };
  }
  function countAnswer(ladder3, correct, ctx = null) {
    const s = state.save;
    const info = ctx?.info ?? state.combatInfo;
    const cfg = config.game.learning;
    const win = ctx?.win ?? state.combat.taskPlan.windows[ladder3];
    const areaId = ctx?.areaId ?? info.areaId;
    const from = stageFor(s.lernen, s.klasse, areaId, ladder3, win);
    const { stufe, change } = recordAnswer(s.lernen, s.klasse, areaId, ladder3, correct, win, cfg);
    if (!change) return [];
    info.stageChanged.push(ladder3);
    const events = [{ type: "stageChanged", ladder: ladder3, from, to: stufe }];
    if (change === "up" && noteHighest(s.lernen, s.klasse, ladder3, stufe)) {
      s.perlen += cfg.newStagePearls;
      info.stageUps.push({ ladder: ladder3, pearls: cfg.newStagePearls });
      events.push({ type: "stageReached", ladder: ladder3, stufe, pearls: cfg.newStagePearls });
    }
    return events;
  }
  function practiceSolved(key) {
    const e = state.save.uebung[key];
    if (!e) return;
    e.richtig = (e.richtig ?? 0) + 1;
    if (e.richtig >= config.game.learning.practiceDoneAfter) delete state.save.uebung[key];
  }
  function startCombat(enemyTypeIds, level, options = {}) {
    state.combatCount += 1;
    state.afterReward = null;
    return beginCombat({
      enemyTypeIds,
      level,
      areaId: options.areaId ?? "reef",
      hp: options.hp ?? state.hp,
      // hp: Entwicklerzugang (Phase 10)
      combatSeed: deriveSeed(seed, `combat${state.combatCount}`),
      untimedTasks: options.untimedTasks ?? 0,
      enemyPower: options.enemyPower ?? 1,
      elite: options.elite ?? null,
      // Testkampf mit Elitegegner (Phase 9)
      rescue: Boolean(options.rescue)
      // Entwicklerzugang: Rettung im Testkampf (Phase 10)
    });
  }
  function dive({ areaId, depth, abandon = false }) {
    if (state.screen !== "base") return reject2("screen");
    const area = config.areas.areas[areaId];
    if (!area) return reject2("unknownArea");
    if (!state.save.gebiete[areaId]?.offen) return reject2("locked");
    if (area.comingSoon) return reject2("comingSoon");
    const maxDepth = openDepths(state.save, areaId);
    if (depth !== void 0 && !(Number.isInteger(depth) && depth >= 1 && depth <= maxDepth)) return reject2("depth");
    let l = lauf();
    if (l && l.gebiet === areaId && depth !== void 0 && depth !== l.tiefe && !abandon) return reject2("otherDepth");
    const events = [];
    if (l && (l.gebiet !== areaId || depth !== void 0 && depth !== l.tiefe)) {
      if (!abandon) return reject2("otherRun");
      events.push({ type: "runAbandoned", areaId: l.gebiet });
      state.save.lauf = null;
      l = null;
    }
    if (!l) {
      state.save.lauf = {
        gebiet: areaId,
        seed: state.runs.nextUint32(),
        erledigt: [],
        position: null,
        leben: maxHp(state.save, config),
        versuche: {},
        laden: {},
        tiefe: depth ?? maxDepth
        // Tiefe des Tauchgangs (Phase 9)
      };
      if (stationEffect("extraRest")) state.save.lauf.vorrat = true;
      if (stationEffect("diveStartBlock")) state.save.lauf.werkstatt = true;
    }
    noteDive(state.save, areaId, state.now, state.tzOffset);
    state.screen = "map";
    if (l && l.beute) offerEventCards(l.beute, currentMap().rooms.find((r) => r.id === l.beute)?.type === "riddle" ? { riddle: true, event: false } : {});
    if (l && l.raetsel) openRiddle(l.raetsel.raum, l.raetsel);
    return [...events, { type: "diveStarted", areaId, seed: lauf().seed, depth: lauf().tiefe, resumed: Boolean(l) }];
  }
  function enterRoom({ roomId }) {
    const l = lauf();
    if (!reachable().includes(roomId)) return reject2("notReachable");
    const room = currentMap().rooms.find((r) => r.id === roomId);
    noteDay(state.save, state.now, state.tzOffset);
    const events = [{ type: "roomEntered", roomId, roomType: room.type }];
    if (room.type === "rest") {
      const full = maxHp(state.save, config);
      const share = Math.max(config.rewards.restHealShare, heroStats(state.save, config).restHealShare);
      const healed = Math.max(0, Math.min(Math.round(full * share), full - l.leben));
      l.leben += healed;
      events.push({ type: "restUsed", healed }, markCleared(roomId));
      return events;
    }
    if (room.type === "treasure") return [...events, ...openTreasure(roomId)];
    if (room.type === "event") return [...events, ...openEvent(room)];
    if (room.type === "riddle") return [...events, ...openRiddle(roomId)];
    if (room.type === "shop") return [...events, ...openShop(roomId)];
    l.versuche[roomId] = (l.versuche[roomId] ?? 0) + 1;
    const area = config.areas.areas[l.gebiet];
    events.push(...beginCombat({
      enemyTypeIds: room.enemies,
      level: room.level,
      areaId: area.curriculum,
      hp: l.leben,
      combatSeed: deriveSeed(l.seed, `room:${roomId}:${l.versuche[roomId]}`),
      roomId,
      boss: room.type === "boss",
      // Erklärung im ersten Kampf (Konzept 11): erste Aufgabe ohne Zeitleiste
      untimedTasks: room.tutorial && !state.save.erklaert.firstCombat ? 1 : 0,
      enemyPower: state.save.stroemung,
      // Strömung (D33/D34), nur im Tauchgang
      depth: l.tiefe,
      // Eliteraum (Phase 9): Regel aus dem Seed des Raums, gleich auch nach dem Neuladen
      elite: room.type === "elite" ? createRng(deriveSeed(l.seed, `elite:${roomId}`)).pick(Object.keys(config.elites.rules)) : null
    }));
    return events;
  }
  function rollItem(rng) {
    const own = new Set(state.save.ausruestung.besitz);
    const free = Object.keys(config.items).filter((id) => !own.has(id));
    return free.length ? rng.pick(free) : null;
  }
  function giveItem(itemId) {
    state.save.ausruestung.besitz.push(itemId);
    return { type: "itemFound", itemId };
  }
  function markCleared(roomId) {
    const l = lauf();
    l.erledigt.push(roomId);
    l.position = roomId;
    return { type: "roomCleared", roomId };
  }
  function openTreasure(roomId) {
    const s = state.save;
    const l = lauf();
    const rng = createRng(deriveSeed(l.seed, `treasure:${roomId}`));
    const [lo, hi] = config.rewards.treasurePearls;
    const pearls = rng.nextInt(lo, hi);
    s.perlen += pearls;
    const cards = rollRewardCards(s, l.gebiet, rng, config, { depth: l.tiefe });
    const item = rng.nextUint32() / 4294967296 < config.rewards.itemChance ? rollItem(rng) : null;
    state.reward = { cards, xp: 0, pearls, levelUps: 0, practice: [], lightningHits: 0, treasure: true, item, cardLevelUps: [] };
    state.afterReward = "map";
    state.screen = "reward";
    const events = [{ type: "treasureOpened", pearls }, markCleared(roomId)];
    if (item) events.push(giveItem(item));
    return [...events, { type: "rewardOffered", cards }];
  }
  function openEvent(room) {
    const l = lauf();
    const area = config.areas.areas[l.gebiet];
    const eventId = rollEvent(room.id, l.seed, config, l.gebiet, Boolean(room.enemies?.length));
    state.event = { roomId: room.id, eventId, enemies: room.enemies ?? null, level: room.level ?? 2, curriculum: area.curriculum };
    state.screen = "event";
    return [{ type: "eventOpened", roomId: room.id, eventId }];
  }
  function chooseEventOption({ optionId }) {
    const s = state.save;
    const l = lauf();
    const ev = state.event;
    const option = config.events[ev.eventId].options.find((o) => o.id === optionId);
    if (!option) return reject2("option");
    if (optionCost(option) > s.perlen) return reject2("pearls");
    const rng = createRng(deriveSeed(l.seed, `event:${ev.roomId}:effects`));
    const events = [{ type: "eventResolved", eventId: ev.eventId, optionId }];
    const full = maxHp(s, config);
    let next = null;
    for (const f of option.effects) {
      if (f.type === "hp") {
        const before = l.leben;
        l.leben = Math.min(full, Math.max(1, l.leben + f.amount));
        events.push({ type: "eventHp", amount: l.leben - before });
      } else if (f.type === "heal") {
        const healed = Math.max(0, Math.min(Math.round(full * f.share), full - l.leben));
        l.leben += healed;
        events.push({ type: "restUsed", healed });
      } else if (f.type === "pearls") {
        const before = s.perlen;
        s.perlen = Math.max(0, s.perlen + f.amount);
        events.push({ type: f.amount > 0 ? "pearlsGained" : "pearlsSpent", amount: Math.abs(s.perlen - before), event: true });
      } else if (f.type === "item") {
        const item = rollItem(rng);
        if (item) events.push(giveItem(item));
        else {
          s.perlen += config.elites.rewardPearls;
          events.push({ type: "pearlsGained", amount: config.elites.rewardPearls, event: true });
        }
      } else next = f;
    }
    state.event = null;
    if (next?.type === "fight" && ev.enemies) {
      l.versuche[ev.roomId] = (l.versuche[ev.roomId] ?? 0) + 1;
      events.push(...beginCombat({
        enemyTypeIds: ev.enemies,
        level: ev.level,
        areaId: ev.curriculum,
        hp: l.leben,
        combatSeed: deriveSeed(l.seed, `room:${ev.roomId}:${l.versuche[ev.roomId]}`),
        roomId: ev.roomId,
        enemyPower: s.stroemung,
        depth: l.tiefe
      }));
      state.combatInfo.bonusPearls = next.bonusPearls;
      return events;
    }
    events.push(markCleared(ev.roomId));
    if (next?.type === "card") {
      l.beute = ev.roomId;
      events.push({ type: "rewardOffered", cards: offerEventCards(ev.roomId) });
      return events;
    }
    state.screen = "map";
    return events;
  }
  function offerEventCards(roomId, extra = {}) {
    const l = lauf();
    const cards = rollRewardCards(state.save, l.gebiet, createRng(deriveSeed(l.seed, `event:${roomId}:cards`)), config, { depth: l.tiefe });
    state.reward = { cards, xp: 0, pearls: 0, levelUps: 0, practice: [], lightningHits: 0, event: true, item: null, cardLevelUps: [], ...extra };
    state.afterReward = "map";
    state.screen = "reward";
    return cards;
  }
  function openRiddle(roomId, saved = null) {
    const l = lauf();
    const curriculumId = config.areas.areas[l.gebiet].curriculum;
    const r = createRiddle({ config, save: state.save, curriculumId, areaId: l.gebiet, runSeed: l.seed, roomId, stufe: saved?.stufe });
    l.raetsel = saved ?? { raum: roomId, stufe: r.stufe, schritt: 0, frei: config.riddles.freeMistakes, versucht: [] };
    state.riddle = {
      ...r,
      curriculumId,
      areaId: l.gebiet,
      wrongChoices: (saved?.falsch ?? []).slice(),
      mistake: null,
      result: null,
      info: { stageChanged: saved?.gewechselt ? [r.ladder] : [], stageUps: [] }
    };
    state.screen = "riddle";
    return [{ type: "riddleOpened", roomId, format: r.format }];
  }
  function answerRiddle({ choiceIndex }) {
    const r = state.riddle;
    const rec = lauf().raetsel;
    if (r.result) return reject2("phase");
    const st = r.steps[rec.schritt];
    if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= st.choices.length || r.wrongChoices.includes(choiceIndex)) return reject2("command");
    const correct = choiceIndex === st.correctIndex;
    const events = [{ type: "riddleAnswered", stepIndex: rec.schritt, correct }];
    const first = !rec.versucht[rec.schritt];
    rec.versucht[rec.schritt] = 1;
    if (first) noteAnswer(state.save, r.ladder, correct ? "correct" : "wrong");
    if (first && config.game.learning.enabled && !r.info.stageChanged.includes(r.ladder) && stageFor(state.save.lernen, state.save.klasse, r.areaId, r.ladder, r.win) === rec.stufe) {
      events.push(...countAnswer(r.ladder, correct, { areaId: r.areaId, win: r.win, info: r.info }));
      if (r.info.stageChanged.includes(r.ladder)) rec.gewechselt = true;
    }
    if (correct) {
      r.wrongChoices = [];
      delete rec.falsch;
      r.mistake = null;
      if (rec.schritt + 1 < r.steps.length) {
        rec.schritt += 1;
        return events;
      }
      return [...events, ...riddleSolved()];
    }
    if (rec.frei > 0) {
      rec.frei -= 1;
      r.wrongChoices.push(choiceIndex);
      rec.falsch = r.wrongChoices.slice();
      r.mistake = st.choiceTypes?.[choiceIndex] ?? null;
      return [...events, { type: "riddleMistake", left: rec.frei, mistake: r.mistake }];
    }
    return [...events, ...riddleFailed(st)];
  }
  function riddleSolved() {
    const l = lauf();
    const r = state.riddle;
    const [lo, hi] = config.riddles.pearls;
    const pearls = createRng(deriveSeed(l.seed, `riddle:${r.roomId}:pearls`)).nextInt(lo, hi);
    state.save.perlen += pearls;
    delete l.raetsel;
    state.riddle = null;
    const events = [{ type: "riddleSolved", roomId: r.roomId, pearls }, markCleared(r.roomId)];
    l.beute = r.roomId;
    const cards = offerEventCards(r.roomId, { riddle: true, event: false, pearls });
    return [...events, { type: "rewardOffered", cards }];
  }
  function riddleFailed(st) {
    const l = lauf();
    const r = state.riddle;
    r.result = "failed";
    r.failedStep = l.raetsel.schritt;
    r.mistake = null;
    addPractice(state.save, [{ key: r.task.practiceKey, text: st.solutionText }], state.now, config);
    delete l.raetsel;
    return [{ type: "riddleFailed", roomId: r.roomId, solutionText: st.solutionText }, markCleared(r.roomId)];
  }
  function leaveRiddle() {
    if (!state.riddle?.result) return reject2("phase");
    state.riddle = null;
    state.screen = "map";
    return [{ type: "riddleLeft" }];
  }
  function riddleView() {
    const r = state.riddle;
    if (!r) return null;
    const failed = r.result === "failed";
    const i = failed ? r.failedStep : lauf().raetsel.schritt;
    const st = r.steps[i];
    return {
      roomId: r.roomId,
      format: r.format,
      ladder: r.ladder,
      stageId: r.task.stageId,
      practiceKey: r.task.practiceKey,
      timeLimitMs: 0,
      freeMistakes: config.riddles.freeMistakes,
      freeLeft: failed ? 0 : lauf().raetsel.frei,
      stepIndex: i,
      steps: r.steps.length,
      wall: r.task.wall ? clone2(r.task.wall) : null,
      shown: r.task.shown?.slice() ?? null,
      step: { prompt: st.prompt, display: st.display ?? null, cell: st.cell ?? null, choices: st.choices.slice(), correctIndex: st.correctIndex },
      wrongChoices: r.wrongChoices.slice(),
      mistake: r.mistake,
      result: r.result,
      solutionText: failed ? st.solutionText : null,
      way: failed ? st.way ?? null : null
    };
  }
  function eventView() {
    const ev = state.event;
    if (!ev) return null;
    return {
      eventId: ev.eventId,
      roomId: ev.roomId,
      options: config.events[ev.eventId].options.map((o) => ({ id: o.id, cost: optionCost(o), available: optionCost(o) <= state.save.perlen }))
    };
  }
  function openShop(roomId) {
    const l = lauf();
    const rng = createRng(deriveSeed(l.seed, `shop:${roomId}`));
    const offer = createShopOffer(state.save, l.gebiet, rng, config, { depth: l.tiefe });
    l.laden[roomId] ??= { gekauft: [], abgegeben: false, gegenstand: rollItem(rng), gegenstandGekauft: false };
    state.shop = { roomId, offer };
    state.screen = "shop";
    return [{ type: "shopOpened", roomId }];
  }
  const shopRecord = () => lauf().laden[state.shop.roomId];
  function buyCard({ cardId }) {
    const item = state.shop.offer.cards.find((c) => c.cardId === cardId);
    if (!item) return reject2("notOffered");
    if (shopRecord().gekauft.includes(cardId)) return reject2("soldOut");
    if (state.save.perlen < item.price) return reject2("pearls");
    state.save.perlen -= item.price;
    addCardToDeck(state.save, cardId);
    shopRecord().gekauft.push(cardId);
    return [{ type: "cardBought", cardId, price: item.price }];
  }
  function buyItem() {
    const rec = shopRecord();
    if (!rec.gegenstand) return reject2("notOffered");
    if (rec.gegenstandGekauft) return reject2("soldOut");
    const price = config.items[rec.gegenstand].price;
    if (state.save.perlen < price) return reject2("pearls");
    state.save.perlen -= price;
    rec.gegenstandGekauft = true;
    if (!state.save.ausruestung.besitz.includes(rec.gegenstand)) state.save.ausruestung.besitz.push(rec.gegenstand);
    return [{ type: "itemBought", itemId: rec.gegenstand, price }];
  }
  function stationEffect(key) {
    return (state.save?.station ?? []).reduce((sum, id) => sum + (config.station[id]?.effect?.[key] ?? 0), 0);
  }
  function buyUpgrade({ upgradeId }) {
    const s = state.save;
    const item = config.station[upgradeId];
    if (!item) return reject2("unknownUpgrade");
    if (s.station.includes(upgradeId)) return reject2("owned");
    if (s.perlen < item.price) return reject2("pearls");
    s.perlen -= item.price;
    s.station.push(upgradeId);
    const complete = Object.keys(config.station).every((id) => s.station.includes(id));
    return [{ type: "upgradeBought", upgradeId, price: item.price, ...complete ? { outcome: "complete" } : {} }];
  }
  function stationView() {
    const s = state.save;
    return {
      items: Object.entries(config.station).map(([id, it]) => ({
        id,
        price: it.price,
        owned: s.station.includes(id),
        affordable: !s.station.includes(id) && s.perlen >= it.price,
        effect: it.effect ?? null
      }))
    };
  }
  function removeCard({ cardId }) {
    const s = state.save;
    if (shopRecord().abgegeben) return reject2("removedAlready");
    if (typeof cardId !== "string" || !(s.deck[cardId] > 0)) return reject2("card");
    const price = state.shop.offer.removePrice;
    if (s.perlen < price) return reject2("pearls");
    const why = removalBlockedReason(s, cardId, config);
    if (why) return reject2(why);
    s.perlen -= price;
    s.deck[cardId] -= 1;
    if (s.deck[cardId] === 0) delete s.deck[cardId];
    shopRecord().abgegeben = true;
    return [{ type: "cardRemoved", cardId, price }];
  }
  function leaveShop() {
    const roomId = state.shop.roomId;
    state.shop = null;
    state.screen = "map";
    return [{ type: "shopLeft" }, markCleared(roomId)];
  }
  function shopView() {
    const rec = lauf().laden[state.shop.roomId];
    return {
      roomId: state.shop.roomId,
      cards: state.shop.offer.cards.map((c) => ({ ...c, soldOut: rec.gekauft.includes(c.cardId) })),
      removePrice: state.shop.offer.removePrice,
      removed: rec.abgegeben,
      item: rec.gegenstand ? { itemId: rec.gegenstand, price: config.items[rec.gegenstand].price, soldOut: rec.gegenstandGekauft } : null
    };
  }
  function adjustCurrent() {
    const s = state.save;
    if (!lauf() || state.combatInfo.roomId === null) return [];
    const from = s.stroemung;
    const info = state.combatInfo;
    const allowUp = !config.game.learning.enabled || atTopEverywhere(s.lernen, s.klasse, info.areaId, curriculumOf(config, s.klasse).windows[info.areaId]);
    const to = nextCurrent(from, s.antworten, config.game.current, { allowUp });
    s.stroemung = to;
    if (to !== from) state.combatInfo.currentChange = { from, to };
    return to === from ? [] : [{ type: "currentChanged", from, to }];
  }
  function onCombatWon() {
    const s = state.save;
    const info = state.combatInfo;
    const r = config.rewards;
    let xp = 0;
    let pearls = 0;
    const factor = rewardFactor(info.depth ?? 1, config.depths);
    if (info.boss) {
      xp = Math.round(r.xpBoss * factor);
      const again = Boolean(lauf() && (s.gebiete[lauf().gebiet]?.tiefe ?? 0) >= lauf().tiefe);
      pearls = Math.round(r.pearlsBoss * factor * (again ? config.depths.repeatBossPearlsFactor : 1));
    } else {
      for (let i = 0; i < info.enemyTypeIds.length; i++) {
        xp += r.xpPerEnemy;
        pearls += state.loot.nextInt(r.pearlsPerEnemy[0], r.pearlsPerEnemy[1]) + heroStats(s, config).extraPearls;
      }
      xp = Math.round(xp * factor);
      pearls = Math.round(pearls * factor);
    }
    for (const e of state.combat.enemies) {
      if (SHIELD_PARTS.has(e.typeId)) continue;
      const key = e.elite ? `${e.typeId}.elite` : e.typeId;
      s.besiegt[key] = (s.besiegt[key] ?? 0) + 1;
    }
    const { levelUps } = grantXp(s, xp, config);
    s.perlen += pearls;
    addPractice(s, info.mistakes, state.now, config);
    const rewardArea = lauf()?.gebiet ?? info.areaId;
    const cards = rollRewardCards(s, rewardArea, state.loot, config, { depth: info.depth ?? 1, elite: Boolean(info.elite) });
    const shown = info.mistakes.slice(-config.game.practiceShownAfterCombat);
    const practice = shown.map((m) => m.text);
    const practiceWays = shown.map((m) => wayForKey(m.key));
    const item = info.boss || info.elite ? rollItem(state.loot) : null;
    const elitePearls = info.elite && !item ? config.elites.rewardPearls : 0;
    const eventPearls = info.bonusPearls ?? 0;
    s.perlen += elitePearls + eventPearls;
    state.reward = { cards, xp, pearls: pearls + elitePearls + eventPearls, levelUps, practice, lightningHits: info.lightningHits, item, cardLevelUps: info.cardLevelUps.slice(), current: info.currentChange ?? null, stageUps: info.stageUps.slice(), practiceWays };
    state.screen = "reward";
    const events = [{ type: "xpGained", amount: xp }];
    if (levelUps > 0) events.push({ type: "levelUp", levels: levelUps, stufe: s.stufe });
    events.push({ type: "pearlsGained", amount: pearls });
    if (elitePearls) events.push({ type: "pearlsGained", amount: elitePearls, elite: true });
    if (eventPearls) events.push({ type: "pearlsGained", amount: eventPearls, event: true });
    if (item) events.push(giveItem(item));
    events.push({ type: "rewardOffered", cards });
    const l = lauf();
    if (!l || info.roomId === null) {
      state.hp = state.combat.hero.hp;
      state.afterReward = null;
      return events;
    }
    l.leben = Math.max(1, Math.min(maxHp(s, config), state.combat.hero.hp + heroStats(s, config).healAfterWin));
    events.push(markCleared(info.roomId));
    state.afterReward = "map";
    if (info.boss) {
      const areaId = l.gebiet;
      const depth = l.tiefe;
      const g = s.gebiete[areaId] ?? { offen: true, geschafft: false, tiefe: 0 };
      const star = depth > g.tiefe;
      s.gebiete[areaId] = { ...g, geschafft: true, tiefe: Math.max(g.tiefe, depth) };
      const stars = starCount(s);
      if (star) events.push({ type: "starGained", areaId, depth, stars });
      const unlocked = areasToOpen(s, config);
      for (const id of unlocked) {
        s.gebiete[id] = { geschafft: false, tiefe: 0, ...s.gebiete[id] ?? {}, offen: true };
        events.push({ type: "areaUnlocked", areaId: id });
      }
      noteRun(s, areaId, depth, true);
      s.lauf = null;
      state.cleared = { areaId, depth, star, stars, unlocked };
      state.afterReward = "areaCleared";
      events.push({ type: "areaCleared", areaId, depth, star, unlocked });
    }
    return events;
  }
  function combatCommand(command) {
    const events = combatDispatch(state.combat, command);
    const info = state.combatInfo;
    const extra = [];
    for (const e of events) {
      if (e.type === "secondWind" && lauf()) lauf().zweiteLuft = true;
      if (e.type === "rescueStarted" && lauf()) lauf().rettung = true;
      if (e.type === "rescueJudged" && e.outcome !== "correct") info.mistakes.push({ key: e.practiceKey, text: e.solutionText, stufe: e.stageId ?? void 0 });
      if (e.type === "rescueEnded" && lauf() && info.roomId !== null) noteRescue(state.save, e.saved);
      if (e.type === "taskOpened" || e.type === "stepOpened") info.openTask = e.task;
      if (e.type === "taskOpened" && lauf() && info.roomId !== null && state.combat.taskPlan.mixEvery) {
        saveMixCounts(state.save.lernen, state.save.klasse, info.areaId, state.combat.mixCount, state.combat.taskPlan.mixEvery);
      }
      const counting = lauf() && info.roomId !== null && !info.tutorial;
      if ((e.type === "answerJudged" || e.type === "stepJudged") && e.counts && counting && !info.stageChanged.includes(e.ladder)) extra.push(...countAnswer(e.ladder, e.outcome === "correct"));
      if (e.type === "answerJudged" && e.practice && e.outcome === "correct" && counting) practiceSolved(e.practiceKey);
      if (counting && e.type === "answerJudged" && e.single && e.tally) noteAnswer(state.save, e.tally, e.outcome);
      if (counting && e.type === "stepJudged" && e.first && e.ladder) noteAnswer(state.save, e.ladder, e.outcome);
      if (counting) {
        const right = e.outcome === "correct";
        const today = state.clockSet ? dayKey(state.now, state.tzOffset) : null;
        const done = [];
        if (e.type === "answerJudged" && e.single && e.tally) done.push(...noteMission(state.save, config, "ladder", { ladder: e.tally, correct: right }, today));
        if (e.type === "stepJudged" && e.first && e.ladder) done.push(...noteMission(state.save, config, "ladder", { ladder: e.ladder, correct: right }, today));
        if (e.type === "answerJudged" && e.practice) done.push(...noteMission(state.save, config, "practice", { correct: right }, today));
        if (e.type === "answerJudged") done.push(...noteMission(state.save, config, "answer", { correct: right }, today));
        if (done.length) {
          state.combat.taskPlan.practiceEvery = 0;
          extra.push(...done);
        }
      }
      if (e.type === "answerJudged") {
        if (e.outcome === "correct" && e.tierId === "lightning") info.lightningHits += 1;
        if (lauf() && info.roomId !== null && !info.tutorial) {
          const s = state.save;
          s.antworten = [...s.antworten, answerCode(e)].slice(-config.game.current.recentAnswers);
        }
        if (e.outcome === "correct" && e.cardId) {
          const level = countCorrect(state.save, e.cardId, config);
          if (level) {
            info.cardLevelUps.push({ cardId: e.cardId, level });
            extra.push({ type: "cardLevelUp", cardId: e.cardId, level });
          }
        }
        if (e.outcome !== "correct" && info.openTask && !info.openTask.forgiving) {
          info.mistakes.push({ key: info.openTask.practiceKey, text: e.solutionText, stufe: info.openTask.format === "solve" ? info.openTask.stageId : void 0 });
        }
      }
      if (e.type === "combatWon") {
        if (state.workshopUsed && lauf()) delete lauf().werkstatt;
        state.workshopUsed = false;
        extra.push(...adjustCurrent(), ...onCombatWon());
      }
      if (e.type === "combatLost") {
        addPractice(state.save, info.mistakes, state.now, config);
        state.hp = maxHp(state.save, config);
        if (lauf() && info.roomId !== null) {
          extra.push({ type: "runLost", areaId: lauf().gebiet });
          noteRun(state.save, lauf().gebiet, lauf().tiefe, false);
          state.save.lauf = null;
          state.screen = "base";
        } else {
          state.screen = "defeat";
        }
      }
    }
    return [...events, ...extra];
  }
  function pickReward({ cardId }) {
    if (cardId !== null && !state.reward.cards.includes(cardId)) return reject2("notOffered");
    if (cardId !== null) addCardToDeck(state.save, cardId);
    if (lauf()?.beute) delete lauf().beute;
    state.screen = state.afterReward;
    return [{ type: "rewardTaken", cardId }];
  }
  function surface() {
    state.screen = "base";
    state.cleared = null;
    return [{ type: "surfaced" }];
  }
  const LOGBOOK_PAGES = ["hero", "talents", "deck", "collection", "gear", "rules", "practice"];
  function start() {
    state.screen = state.save ? "base" : "grade";
    return [{ type: "started", hasSave: Boolean(state.save) }];
  }
  function chooseGrade({ grade }) {
    if (grade !== 3 && grade !== 4) return reject2("grade");
    state.grade = grade;
    state.screen = "heroCreate";
    const events = [{ type: "gradeChosen", grade }];
    return events;
  }
  function createHero({ figureId, nameA, nameB }) {
    const h = config.heroes;
    if (!h.figures[figureId]) return reject2("figure");
    const okIndex = (i, list) => Number.isInteger(i) && i >= 0 && i < list.length;
    if (!okIndex(nameA, h.nameA) || !okIndex(nameB, h.nameB)) return reject2("name");
    state.save = createSave(state.now, state.grade ?? 3, config, { figur: figureId, nameA, nameB });
    Object.assign(state.save.einstellung, state.pendingSettings);
    state.pendingSettings = {};
    state.hp = maxHp(state.save, config);
    state.screen = "base";
    return [{ type: "heroCreated", figureId, name: heroName(state.save, config) }];
  }
  function openLogbook({ page }) {
    if (!LOGBOOK_PAGES.includes(page)) return reject2("page");
    state.logbookPage = page;
    state.screen = "logbook";
    return [{ type: "logbookOpened", page }];
  }
  function closeLogbook() {
    state.screen = "base";
    state.logbookPage = null;
    return [{ type: "logbookClosed" }];
  }
  function capRunLife() {
    const l = lauf();
    if (l) l.leben = Math.min(l.leben, maxHp(state.save, config));
  }
  function editHero() {
    state.screen = "heroEdit";
    return [{ type: "heroEditOpened" }];
  }
  function cancelHeroEdit() {
    state.screen = "logbook";
    state.logbookPage = "hero";
    return [{ type: "heroEditClosed" }];
  }
  function changeHero({ figureId, nameA, nameB }) {
    const h = config.heroes;
    if (!h.figures[figureId]) return reject2("figure");
    const okIndex = (i, list) => Number.isInteger(i) && i >= 0 && i < list.length;
    if (!okIndex(nameA, h.nameA) || !okIndex(nameB, h.nameB)) return reject2("name");
    state.save.held = { figur: figureId, nameA, nameB };
    capRunLife();
    state.screen = "logbook";
    state.logbookPage = "hero";
    return [{ type: "heroChanged", figureId, name: heroName(state.save, config) }];
  }
  function spendPoint2({ stat }) {
    if (!STATS2.includes(stat)) return reject2("stat");
    if (!spendPoint(state.save, stat, config)) return reject2("noPoints");
    return [{ type: "pointSpent", stat, free: freePoints(state.save, config) }];
  }
  function equipItem({ itemId }) {
    if (!state.save.ausruestung.besitz.includes(itemId)) return reject2("item");
    const slot = config.items[itemId].slot;
    state.save.ausruestung.angelegt[slot] = itemId;
    capRunLife();
    return [{ type: "itemEquipped", itemId, slot }];
  }
  function unequipItem({ slot }) {
    if (!SLOTS2.includes(slot)) return reject2("slot");
    state.save.ausruestung.angelegt[slot] = null;
    capRunLife();
    return [{ type: "itemUnequipped", slot }];
  }
  function newCards() {
    const s = state.save;
    return unlockedCards(s, config).filter((id) => config.cards[id].unlockStars > 0 && !s.entdeckt.includes(id));
  }
  function ackMission() {
    const m = state.save.auftrag;
    if (!m?.geschafft) return reject2("mission");
    m.gemeldet = true;
    return [{ type: "missionSeen" }];
  }
  function ackNewCards() {
    const cards = newCards();
    state.save.entdeckt.push(...cards);
    return [{ type: "newCardsSeen", cards }];
  }
  function chooseTalent({ level, talentId }) {
    const key = String(level);
    if (!TALENT_LEVELS.includes(key)) return reject2("level");
    if (state.save.stufe < Number(key)) return reject2("level");
    if (!config.talents[key].some((x) => x.id === talentId)) return reject2("talent");
    state.save.talente[key] = talentId;
    return [{ type: "talentChosen", level: Number(key), talentId }];
  }
  function resetPoints2() {
    resetPoints(state.save);
    capRunLife();
    return [{ type: "pointsReset", free: freePoints(state.save, config) }];
  }
  function profileView() {
    const s = state.save;
    if (!s) return null;
    const ordered = Object.entries(s.uebung).sort((a, b) => b[1].t - a[1].t);
    const practice = ordered.map(([, e]) => e.text);
    const practiceWays = ordered.map(([key]) => wayForKey(key));
    return {
      name: heroName(s, config),
      figure: s.held.figur,
      asset: config.heroes.figures[s.held.figur].asset,
      held: { ...s.held },
      // Figur und Namensnummern, für „Held ändern“
      poseAnchor: config.heroes.figures[s.held.figur].poseAnchor ?? null,
      // Kampfposen (D36, Weg 2)
      klasse: s.klasse,
      stufe: s.stufe,
      ep: s.ep,
      perlen: s.perlen,
      punkte: { ...s.punkte },
      freePoints: freePoints(s, config),
      maxHp: maxHp(s, config),
      gear: { besitz: s.ausruestung.besitz.slice(), angelegt: { ...s.ausruestung.angelegt } },
      perk: config.heroes.figures[s.held.figur].perk ? s.held.figur : null,
      // Kartenalbum und Meeresbuch (Phase 9, Etappe 4)
      album: Object.keys(config.cards).map((cardId) => ({ cardId, found: (s.gefunden ?? []).includes(cardId), level: cardLevel(s, cardId, config), toNext: toNextLevel(s, cardId, config), unlockStars: config.cards[cardId].unlockStars ?? 0, locked: !unlockedCards(s, config).includes(cardId), rare: config.cards[cardId].rarity === "rare" })),
      newCards: newCards(),
      book: BOOK.map((b) => ({ ...b, count: s.besiegt?.[b.typeId] ?? 0, eliteCount: s.besiegt?.[`${b.typeId}.elite`] ?? 0 })).map(({ typeId, areaId, count, eliteCount, boss }) => ({ typeId, areaId, count, eliteCount, boss })),
      talents: TALENT_LEVELS.map((level) => ({ level: Number(level), options: config.talents[level].map((x) => x.id), chosen: s.talente?.[level] ?? null, available: s.stufe >= Number(level) })),
      talentOpen: TALENT_LEVELS.some((level) => s.stufe >= Number(level) && !s.talente?.[level]),
      deck: Object.entries(s.deck).filter(([, n]) => n > 0).map(([cardId, n]) => ({ cardId, n, level: cardLevel(s, cardId, config), toNext: toNextLevel(s, cardId, config) })),
      practice,
      practiceWays,
      stars: starCount(s),
      // Seesterne (Phase 9)
      areas: config.areas.order.map((id) => {
        const open = Boolean(s.gebiete[id]?.offen);
        return {
          id,
          open,
          cleared: Boolean(s.gebiete[id]?.geschafft),
          comingSoon: Boolean(config.areas.areas[id].comingSoon),
          price: config.areas.areas[id].price,
          depth: s.gebiete[id]?.tiefe ?? 0,
          // geschaffte Tiefe
          maxDepth: openDepths(s, id),
          // höchste wählbare Tiefe
          missing: open ? 0 : Math.max(0, config.areas.areas[id].price - starCount(s))
        };
      })
    };
  }
  const SETTING_CHECK = {
    mehrZeit: (v) => typeof v === "string" && v in config.game.moreTime,
    ton: (v) => typeof v === "boolean",
    musik: (v) => typeof v === "boolean",
    wenigBewegung: (v) => typeof v === "boolean",
    lautstaerke: (v) => config.sounds.volumeSteps.includes(v)
    // Etappe 9
  };
  function setSetting({ key, value }) {
    if (!SETTING_CHECK[key]) return reject2("setting");
    if (!SETTING_CHECK[key](value)) return reject2("value");
    if (state.save) state.save.einstellung[key] = value;
    else state.pendingSettings[key] = value;
    return [{ type: "settingChanged", key, value }];
  }
  function markExplained({ key }) {
    const ok = key === "firstCombat" || typeof key === "string" && key.startsWith("card.") && config.cards[key.slice(5)] || typeof key === "string" && key.startsWith("area.") && config.areas.areas[key.slice(5)]?.intro || typeof key === "string" && key.startsWith("boss.") && config.bosses.bosses[key.slice(5)]?.rule;
    if (!ok) return reject2("explainKey");
    if (!state.save) return reject2("screen");
    state.save.erklaert[key] = true;
    return [{ type: "explained", key }];
  }
  function resetSave() {
    state.save = null;
    state.grade = null;
    state.pendingSettings = {};
    state.combat = null;
    state.reward = null;
    state.cleared = null;
    state.hp = config.game.hero.maxHp;
    state.screen = "title";
    return [{ type: "saveReset" }];
  }
  const MENU_COMMANDS = /* @__PURE__ */ new Set(["ackMission", "ackNewCards", "chooseTalent", "chooseEventOption", "start", "chooseGrade", "createHero", "openLogbook", "closeLogbook", "spendPoint", "resetPoints", "dive", "enterRoom", "surface", "setSetting", "resetSave", "buyCard", "removeCard", "leaveShop", "buyItem", "equipItem", "unequipItem", "editHero", "cancelHeroEdit", "changeHero", "buyUpgrade"]);
  const COMMANDS = {
    title: { start, setSetting, resetSave },
    grade: { chooseGrade },
    heroCreate: { createHero },
    base: { dive, openLogbook, spendPoint: spendPoint2, resetPoints: resetPoints2, setSetting, equipItem, unequipItem, chooseTalent, ackNewCards, ackMission, buyUpgrade },
    logbook: { openLogbook, closeLogbook, spendPoint: spendPoint2, resetPoints: resetPoints2, equipItem, unequipItem, editHero, chooseTalent },
    heroEdit: { changeHero, cancelHeroEdit },
    map: { enterRoom, surface },
    reward: { pickReward },
    shop: { buyCard, buyItem, removeCard, leaveShop },
    event: { chooseEventOption },
    // Phase 9
    riddle: { answerRiddle, leaveRiddle },
    // Tempel (Phase 9, Etappe 7)
    areaCleared: { surface }
  };
  function mapView() {
    const l = lauf();
    if (!l) return null;
    const open = reachable();
    return {
      areaId: l.gebiet,
      depth: l.tiefe,
      // Phase 9
      current: state.save.stroemung,
      position: l.position,
      reachable: open,
      rooms: currentMap().rooms.map((r) => ({
        id: r.id,
        layer: r.layer,
        slot: r.slot,
        type: r.type,
        next: r.next.slice(),
        enemies: r.type === "event" ? null : r.enemies?.slice() ?? null,
        // Ereignis bleibt eine Überraschung
        done: l.erledigt.includes(r.id),
        reachable: open.includes(r.id)
      }))
    };
  }
  function missionCheck() {
    if (state.screen !== "base" || !state.save || !state.clockSet) return [];
    if (!ensureMission(state.save, config, state.now, state.tzOffset)) return [];
    return [{ type: "missionCreated", mission: { ...state.save.auftrag } }];
  }
  function route(command) {
    if (state.screen === "combat") {
      if (command?.type === "pickReward") return reject2("screen");
      if (MENU_COMMANDS.has(command?.type)) return reject2("phase");
      if (command?.type === "markExplained") return markExplained(command);
      return combatCommand(command);
    }
    if (command?.type === "markExplained") return markExplained(command);
    const handler = COMMANDS[state.screen]?.[command?.type];
    if (!handler) return reject2("screen");
    return handler(command);
  }
  return {
    startCombat,
    get combat() {
      return state.combat;
    },
    // tzOffsetMinutes: Zeitzone des Geräts (Phase 10, Spieltage der Lernübersicht); ohne Angabe bleibt der letzte Wert
    setNow(now, tzOffsetMinutes) {
      state.now = now;
      state.clockSet = true;
      if (Number.isFinite(tzOffsetMinutes)) state.tzOffset = tzOffsetMinutes;
    },
    dispatch(command) {
      const events = [...missionCheck(), ...route(command)];
      events.push(...missionCheck());
      return events;
    },
    view({ targetUid } = {}) {
      const s = state.save;
      const l = lauf();
      const inCombat = state.screen === "combat";
      return {
        screen: state.screen,
        combat: state.combat && inCombat ? combatView(state.combat, { targetUid }) : null,
        reward: state.reward ? clone2(state.reward) : null,
        map: state.screen === "map" ? mapView() : null,
        shop: state.screen === "shop" ? shopView() : null,
        event: state.screen === "event" ? eventView() : null,
        riddle: state.screen === "riddle" ? riddleView() : null,
        station: state.screen === "base" && s ? stationView() : null,
        // Ausbau (Etappe 8)
        mission: state.screen === "base" && s?.auftrag && config.game.mission?.enabled ? { ...s.auftrag } : null,
        // Tagesauftrag (Phase 10, Etappe 5)
        cleared: state.cleared ? { ...state.cleared } : null,
        run: l ? { areaId: l.gebiet, depth: l.tiefe } : null,
        logbook: state.screen === "logbook" ? { page: state.logbookPage } : null,
        grade: state.grade,
        profile: profileView(),
        explained: { ...state.save?.erklaert ?? {} },
        cardLevels: s ? cardLevels(s, config) : {},
        // Kartenstufen für Beute und Händler (Etappe 8)
        tutorial: inCombat && Boolean(state.combatInfo?.tutorial) && !state.save?.erklaert.firstCombat,
        settings: { ...state.save?.einstellung ?? { ...DEFAULT_SETTINGS, ...state.pendingSettings } },
        hero: s ? { hp: inCombat ? state.combat.hero.hp : l?.leben ?? state.hp, maxHp: maxHp(s, config), stufe: s.stufe, ep: s.ep, perlen: s.perlen } : null
      };
    },
    toSave(now) {
      if (!state.save) return null;
      const out = clone2(state.save);
      out.geaendert = now;
      return out;
    }
  };
}

// src/ui/text.js
function createText(texts) {
  return function t2(key, vars = {}) {
    const value = key.split(".").reduce((o, k) => o == null ? void 0 : o[k], texts);
    if (typeof value !== "string") return `\u27E6${key}\u27E7`;
    return value.replace(/\{(\w+)\}/g, (m, name) => name in vars ? String(vars[name]) : m);
  };
}
var current = createText({});
function setTexts(texts) {
  current = createText(texts);
}
function t(key, vars) {
  return current(key, vars);
}
function wayText(tt, way) {
  if (!way) return null;
  return tt(`way.${way.key}`, Object.fromEntries(way.parts.map((p, i) => [i, p.replaceAll(" ", "\xA0")])));
}
function hintAsk(tt, mistakeType, askKey, place = null) {
  if (!mistakeType) return tt(askKey);
  return tt(`mistake.${mistakeType}`, { stelle: tt(`place.${place ?? "next"}`) });
}

// src/ui/assets.js
var manifest = {};
function setManifest(m) {
  manifest = m ?? {};
}
function assetUrl(key) {
  return manifest[key] ?? null;
}
function placeholder(key, label) {
  const d = document.createElement("div");
  d.className = "ph";
  d.textContent = label || key;
  d.dataset.key = key;
  return d;
}
function renderAsset(key, altText = "") {
  const src = assetUrl(key);
  if (!src) return placeholder(key, altText);
  const img = new Image();
  img.src = src;
  img.alt = altText;
  img.decoding = "async";
  img.draggable = false;
  img.addEventListener("error", () => img.replaceWith(placeholder(key, altText)), { once: true });
  return img;
}

// src/ui/app.js
async function playEvents(events, handlers, onEach = null) {
  for (const event of events) {
    onEach?.(event);
    const handler = handlers[event.type];
    if (handler) await handler(event);
  }
}
var SAVE_NOW = /* @__PURE__ */ new Set(["rescueStarted", "rescueEnded", "secondWind", "missionDone"]);
function needsSave(events) {
  return events.some((e) => SAVE_NOW.has(e.type));
}
function isCalm() {
  return document.body.classList.contains("is-calm") || matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, isCalm() ? Math.min(ms, 120) : ms));
}
function isLocalHost(hostname = location.hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

// src/ui/icons.js
var S = 'stroke="#14161f" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';
var ICON = {
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#ff5a4e" d="M12 20.5s-7.5-4.6-8.9-9.4C2.2 7.9 4.4 5 7.4 5c1.9 0 3.4 1.1 4.6 2.7C13.2 6.1 14.7 5 16.6 5c3 0 5.2 2.9 4.3 6.1-1.4 4.8-8.9 9.4-8.9 9.4z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#8fd3ff" d="M12 2.8l7.6 2.8v5.6c0 5-3.3 8.6-7.6 10.1-4.3-1.5-7.6-5.1-7.6-10.1V5.6z"/><path ${S} fill="none" d="M12 6v12"/></svg>`,
  attack: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#fbfbf7" d="M4 20l3-1 11-11 1-4-4 1L4 16z"/><path ${S} fill="#ffd23f" d="M3 17.5l3.5 3.5 1.6-1.6-3.5-3.5z"/></svg>`,
  bolt: `<svg viewBox="0 0 24 34" aria-hidden="true"><path ${S} fill="#ffd23f" d="M14.5 1.5L3 19h7.5l-2.5 13.5L21 13h-7.8z"/></svg>`,
  deck: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect ${S} fill="#1d7fb8" x="7" y="3" width="12" height="16" rx="2"/><rect ${S} fill="#fbfbf7" x="4" y="6" width="12" height="16" rx="2"/></svg>`,
  discard: `<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(-12 11 13)"><rect ${S} fill="#fbfbf7" x="5" y="5" width="12" height="16" rx="2"/><path ${S} fill="none" d="M8 10l6 6M14 10l-6 6"/></g></svg>`,
  heal: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#3fbf7f" d="M12 21c-4-3-6-7-5-11 1-3 4-6 5-7 1 1 4 4 5 7 1 4-1 8-5 11z"/><path ${S} fill="none" d="M12 8v10"/></svg>`,
  swirl: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="#fbfbf7" stroke-linecap="round" stroke-width="2.6" d="M12.5 12.2a1.6 1.6 0 1 1-1.9-1.6 3.4 3.4 0 1 1-2.2 4.9 5.4 5.4 0 1 1 9.6-4.2 7.2 7.2 0 0 1-3 7.2"/></svg>`,
  pearl: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle ${S} fill="#fbfbf7" cx="12" cy="12" r="8"/><path fill="none" stroke="#8fd3ff" stroke-width="2.4" stroke-linecap="round" d="M8.6 10.2a3.6 3.6 0 0 1 3.2-2.4"/></svg>`,
  rest: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#3fbf7f" d="M12 21c-1-4-1-8 0-12M12 13c-3-1-6-4-6-8 3 0 6 2 6 5M12 11c2-2 5-3 7-2-1 3-4 4-7 4"/><path ${S} fill="#fbfbf7" d="M5 21h14"/></svg>`,
  boss: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#ff5a4e" d="M5 12a7 7 0 0 1 14 0v2c0 1.5-1 2.5-2 3l1 3.5-2.5-1.5-1 2.5-1.5-2.5-1.5 2.5-1-2.5L8 20.5 9 17c-1-.5-2-1.5-2-3z"/><circle ${S} fill="#fbfbf7" cx="9.5" cy="11" r="1.6"/><circle ${S} fill="#fbfbf7" cx="14.5" cy="11" r="1.6"/></svg>`,
  treasure: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#ffd23f" d="M3.5 11h17v8.5h-17z"/><path ${S} fill="#c9893a" d="M3.5 11c0-3.6 2.4-6 5-6h7c2.6 0 5 2.4 5 6z"/><rect ${S} fill="#fbfbf7" x="10.2" y="9.5" width="3.6" height="4.5" rx="1"/></svg>`,
  shop: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#fbfbf7" d="M4 9h16v11H4z"/><path ${S} fill="#ff5a4e" d="M3 9l2-5h14l2 5c0 1.4-1.1 2.3-2.4 2.3S16.2 10.4 16.2 9c0 1.4-1.1 2.3-2.4 2.3S11.4 10.4 11.4 9c0 1.4-1.1 2.3-2.4 2.3S6.6 10.4 6.6 9c0 1.4-1.1 2.3-2.4 2.3S3 10.4 3 9z"/><circle ${S} fill="#fbfbf7" cx="12" cy="16" r="2.4"/></svg>`,
  harpoon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="none" stroke-width="2.6" d="M3 21L17 7"/><path ${S} fill="#fbfbf7" d="M14.5 4.5L21 3l-1.5 6.5-2.2-2.3z"/><path ${S} fill="none" d="M5 15l4 4"/></svg>`,
  conch: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#ffd9b8" d="M4 18c2-8 7-13 15-14-1 3-2 6-1 9-3-1-6 0-8 3l-1 4z"/><path ${S} fill="none" d="M9 20c1-3 4-6 9-7M7 14c3-1 6-1 9 0"/></svg>`,
  crack: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#8fd3ff" d="M12 2.8l7.6 2.8v5.6c0 5-3.3 8.6-7.6 10.1-4.3-1.5-7.6-5.1-7.6-10.1V5.6z"/><path ${S} fill="none" stroke-width="2.6" d="M12 3.5l-2 5 3.5 2.5-2.5 5 1 4.5"/></svg>`,
  wall: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect ${S} fill="#ff9e7a" x="8" y="3" width="8" height="5" rx="1"/><rect ${S} fill="#ff9e7a" x="4" y="9.5" width="8" height="5" rx="1"/><rect ${S} fill="#ff9e7a" x="12" y="9.5" width="8" height="5" rx="1"/><rect ${S} fill="#fbfbf7" x="1.5" y="16" width="7" height="5" rx="1"/><rect ${S} fill="#fbfbf7" x="8.5" y="16" width="7" height="5" rx="1"/><rect ${S} fill="#fbfbf7" x="15.5" y="16" width="7" height="5" rx="1"/></svg>`,
  bubbles: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle ${S} fill="#8fd3ff" cx="6" cy="17" r="3.6"/><circle ${S} fill="#8fd3ff" cx="12.5" cy="11.5" r="3.2"/><circle ${S} fill="#8fd3ff" cx="18" cy="5.5" r="2.8"/><path fill="none" stroke="#14161f" stroke-width="2" stroke-linecap="round" d="M8.6 14.6l1.4-1.2M14.8 9.3l1.2-1.4"/></svg>`,
  ink: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#3b2a5c" d="M5 17c-2.2 0-3-2.6-1.4-4 -.6-2.6 2-4.6 4.3-3.4C8.6 6.6 12.6 5.8 14.6 8c2.4-.8 4.8 1 4.4 3.4 2 .6 2.4 3.6.2 4.6-.8 2.4-4 2.6-5.2 1-1.4 1.6-4.2 1.4-5.2-.2C7.6 17.6 6 17.8 5 17z"/><circle fill="#fbfbf7" cx="10" cy="12.5" r="1.3"/><circle fill="#fbfbf7" cx="14" cy="12.5" r="1.3"/></svg>`,
  // Rätseltruhe (Tempel): Truhe mit Zahlenschloss
  riddle: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#3fbfb0" d="M3.5 11h17v8.5h-17z"/><path ${S} fill="#1d7fb8" d="M3.5 11c0-3.6 2.4-6 5-6h7c2.6 0 5 2.4 5 6z"/><path ${S} fill="none" d="M10 10.5V9a2 2 0 0 1 4 0v1.5"/><rect ${S} fill="#ffd23f" x="8.8" y="10.5" width="6.4" height="5.5" rx="1"/></svg>`,
  // Station ausbauen (Etappe 8): Hammer
  build: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#c9893a" d="M10.2 11.6l2.2 2.2-7 7a1.55 1.55 0 0 1-2.2-2.2z"/><path ${S} fill="#ffd23f" d="M8.6 6.2l4.4-3.4 3 .6 4.6 4.6-1.6 1.6-1.4-1.4-6.4 6.4-4.4-4.4 2.4-2.4z"/></svg>`,
  dice: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect ${S} fill="#fbfbf7" x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle fill="#14161f" cx="8.5" cy="8.5" r="1.7"/><circle fill="#14161f" cx="15.5" cy="15.5" r="1.7"/><circle fill="#14161f" cx="12" cy="12" r="1.7"/></svg>`,
  book: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#ffd23f" d="M4 5.5c3-1.5 5.5-1.5 8 0v14c-2.5-1.5-5-1.5-8 0z"/><path ${S} fill="#fbfbf7" d="M12 5.5c2.5-1.5 5-1.5 8 0v14c-3-1.5-5.5-1.5-8 0z"/></svg>`,
  next: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle ${S} fill="#ffd23f" cx="12" cy="12" r="9"/><path ${S} fill="none" stroke-width="2.8" d="M8 12h8M13 8.5l3.5 3.5-3.5 3.5"/></svg>`,
  star: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#ffd23f" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>`,
  helmet: `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${S} fill="#ffd23f" d="M4.5 13.5a7.5 7.5 0 0 1 15 0V18a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"/><circle ${S} fill="#8fd3ff" cx="12" cy="13" r="4.2"/><path ${S} fill="none" d="M12 8.8v8.4M7.8 13h8.4"/><path ${S} fill="#fbfbf7" d="M3 20h18v1.8H3z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle ${S} fill="#fbfbf7" cx="12" cy="12" r="9"/><path ${S} fill="none" stroke-width="3" d="M7.5 12.5l3 3 6-6.5"/></svg>`,
  cross: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle ${S} fill="#fbfbf7" cx="12" cy="12" r="9"/><path ${S} fill="none" stroke-width="3" d="M8.5 8.5l7 7M15.5 8.5l-7 7"/></svg>`
};
var OP_ICON_RAW = {
  add: `<svg viewBox="0 0 48 48" aria-hidden="true"><path ${S} stroke-width="3" fill="#fbfbf7" d="M19 6h10v13h13v10H29v13H19V29H6V19h13z"/></svg>`,
  sub: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect ${S} stroke-width="3" fill="#fbfbf7" x="6" y="19" width="36" height="10" rx="2"/></svg>`,
  mul: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle ${S} stroke-width="3" fill="#fbfbf7" cx="24" cy="24" r="11"/></svg>`,
  div: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle ${S} stroke-width="3" fill="#fbfbf7" cx="24" cy="13" r="6.5"/><circle ${S} stroke-width="3" fill="#fbfbf7" cx="24" cy="35" r="6.5"/></svg>`
};
var OP_ICON = OP_ICON_RAW;

// src/ui/components/pose.js
function poseBox(base, baseNatural, poseNatural, anchor = 0.5) {
  const scale = base.height / baseNatural.height;
  const width = poseNatural.width * scale;
  const height = poseNatural.height * scale;
  return { left: base.left + anchor * base.width - width / 2, bottom: base.bottom, width, height };
}
function dashDistance(mover, target, dir = 1, overlap = 0.2) {
  const width = target.right - target.left;
  const gap = dir === 1 ? target.left - mover.right : mover.left - target.right;
  return dir * Math.max(0, gap + overlap * width);
}

// src/ui/input.js
function bindKeys(map) {
  const onKey = (e) => {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    const fn = map[e.key];
    if (fn && fn() !== false) e.preventDefault();
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}

// src/ui/components/enemy.js
function renderEnemy(e, { t: t2, selected }) {
  const name = t2(`enemies.${e.typeId}.name`);
  const b = document.createElement("button");
  b.type = "button";
  b.className = "foe" + (e.alive ? "" : " is-dead") + (e.rule === "hidden" && e.alive ? " is-hidden" : "") + (e.elite ? " is-elite" : "");
  b.dataset.uid = e.uid;
  b.disabled = !e.alive;
  b.setAttribute("aria-pressed", String(selected && e.alive));
  const parts = [name, t2("hud.hp", { n: e.hp, max: e.maxHp })];
  if (e.intent) parts.push(t2(e.intent.type === "attack" ? "hud.intentAttack" : "hud.intentBlock", { n: e.intent.amount }));
  const broken = e.immune && e.immuneBroken > 0;
  if (e.immune) parts.push(broken ? t2("hud.immuneBroken", { op: OPERATOR_SIGN[e.immune], n: e.immuneBroken }) : t2("hud.immune", { op: OPERATOR_SIGN[e.immune] }));
  if (e.nextImmune) parts.push(t2("hud.immuneNext", { op: OPERATOR_SIGN[e.nextImmune] }));
  if (e.shielded) parts.push(t2("hud.shielded"));
  if (e.rule === "hidden") parts.push(t2("hud.hidden"));
  if (e.elite) parts.push(t2(`elite.${e.elite}`, { name }));
  if (e.weakTurns > 0) parts.push(t2("hud.weak", { n: e.weakTurns }));
  b.setAttribute("aria-label", parts.join(", "));
  const row = document.createElement("div");
  row.className = "foe-row";
  if (e.intent) {
    const isAttack = e.intent.type === "attack";
    row.insertAdjacentHTML(
      "beforeend",
      `<span class="intent ${isAttack ? "" : "is-shield"}${e.weakTurns > 0 && isAttack ? " is-weak" : ""}">${isAttack ? ICON.attack : ICON.shield}${e.intent.amount}${e.weakTurns > 0 ? `<b class="weak-turns">${e.weakTurns}</b>` : ""}</span>`
    );
  }
  if (e.immune) {
    const title = broken ? t2("hud.immuneBroken", { op: OPERATOR_SIGN[e.immune], n: e.immuneBroken }) : t2("hud.immune", { op: OPERATOR_SIGN[e.immune] });
    row.insertAdjacentHTML(
      "beforeend",
      `<span class="immune${broken ? " is-broken" : ""}" title="${title}">${OP_ICON[e.immune].replaceAll("#fbfbf7", "#14161f")}${broken ? `<b class="immune-turns">${e.immuneBroken}</b>` : ""}</span>`
    );
  }
  if (e.nextImmune && e.alive) {
    row.insertAdjacentHTML(
      "beforeend",
      `<span class="immune-next" title="${t2("hud.immuneNext", { op: OPERATOR_SIGN[e.nextImmune] })}"><b aria-hidden="true">\u2192</b>${OP_ICON[e.nextImmune].replaceAll("#fbfbf7", "#14161f")}</span>`
    );
  }
  const art = document.createElement("div");
  art.className = "foe-art";
  art.append(renderAsset(`enemy.${e.typeId}`, name));
  const label = document.createElement("span");
  label.className = "foe-name";
  label.textContent = name;
  if (e.elite) {
    label.insertAdjacentHTML("afterbegin", `<span class="foe-star">${ICON.star}</span>`);
    label.insertAdjacentHTML("beforeend", `<span class="foe-star">${ICON.star}</span>`);
  }
  const plate = document.createElement("div");
  plate.className = "plate";
  plate.innerHTML = `<span class="stat hp">${ICON.heart}${e.hp}</span>${e.block > 0 ? `<span class="stat block">${ICON.shield}${e.block}</span>` : ""}`;
  const bar = document.createElement("div");
  bar.className = "hpbar";
  const fill = document.createElement("i");
  fill.style.width = `${Math.max(0, e.hp) / e.maxHp * 100}%`;
  const num = document.createElement("span");
  num.className = "hpbar-num";
  num.innerHTML = `${ICON.heart}<span></span>`;
  num.lastChild.textContent = String(e.hp);
  bar.append(fill, num);
  b.append(row, art, label);
  if (e.shielded && e.alive) {
    const tag = document.createElement("span");
    tag.className = "shield-tag";
    tag.textContent = t2("hud.shielded");
    b.append(tag);
  }
  b.append(plate, bar);
  return b;
}

// src/ui/components/card.js
var KIND = { damage: "attack", damagePerStep: "attack", damageBlock: "attack", damageAll: "attack", damageTwo: "attack", block: "block", heal: "heal" };
var FORMAT_ICON = { numberLine: ICON.harpoon, wall: ICON.wall, chain: ICON.bubbles, match: ICON.pearl };
function plaque(e) {
  switch (e.type) {
    case "damage":
    case "damagePerStep":
      return [ICON.attack, e.amount];
    case "block":
      return [ICON.shield, e.amount];
    case "heal":
      return [ICON.heal, e.amount];
    case "energy":
      return [ICON.bolt, `+${e.amount}`];
    case "buff":
      return [ICON.conch, `+${e.amount}`];
    case "weaken":
      return [ICON.ink, `\u2212${e.amount}`];
    case "breakImmunity":
      return [ICON.crack, e.turns];
    case "cycle":
      return [ICON.swirl, null];
    case "damageBlock":
    case "damageAll":
    case "damageTwo":
      return [ICON.attack, e.amount];
    case "poison":
      return [ICON.ink, e.amount];
    case "thorns":
      return [ICON.crack, e.amount];
    case "draw":
      return [ICON.deck, `+${e.amount}`];
    case "slowTime":
      return [ICON.swirl, `\xD7${e.factor}`];
    default:
      return [null, null];
  }
}
function effectText(def, t2, level = 1) {
  const e = cardEffect(def, level);
  if (e.type === "cycle") return t2("eff.cycle", { discard: e.discard, draw: e.draw });
  if (e.type === "damage" && e.perStreak) return t2("eff.damageStreak", { n: e.amount });
  if (e.type === "block" && e.keep) return t2("eff.blockKeep", { n: e.amount });
  return t2(`eff.${e.type}`, { n: e.amount, b: e.block, turns: e.turns });
}
function renderCard(h, def, { t: t2, why, picked, pending }) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `card k-${KIND[def.effect.type] ?? "other"}${def.rarity === "rare" ? " is-rare" : ""}`;
  b.dataset.uid = h.uid;
  if (why) b.classList.add("is-off");
  if (picked) b.classList.add("is-picked");
  if (pending) b.classList.add("is-pending");
  const name = t2(`cards.${h.cardId}.name`);
  const level = h.level ?? 1;
  const eff = effectText(def, t2, level);
  const op = def.task?.operation ? OP_ICON[def.task.operation] : FORMAT_ICON[def.task?.format] ?? null;
  const [icon, n] = plaque(cardEffect(def, level));
  b.innerHTML = `<span class="cost">${def.cost}</span><span class="card-frame"><span class="card-art">` + (op ? `<span class="card-op${def.task?.operation ? "" : " is-format"}">${op}</span>` : "") + (icon ? `<span class="card-plaque">${icon}${n !== null ? `<b>${n}</b>` : ""}</span>` : "") + `</span><span class="card-text"><span class="card-name">${name}</span><span class="card-eff">${eff}</span></span></span>` + (level > 1 ? `<span class="card-stars">${ICON.star.repeat(level - 1)}</span>` : "") + (why ? `<span class="card-why">${t2(`reject.${why}`)}</span>` : "");
  const url = assetUrl(`card.${h.cardId}`);
  if (url) b.querySelector(".card-art").style.backgroundImage = `url("${url}")`;
  const plain = t2("hud.cardLabel", { name: name.replaceAll("\xAD", ""), cost: def.cost, effect: eff });
  const label = level > 1 ? `${plain}, ${t2("hud.cardLevel", { n: level })}` : plain;
  b.setAttribute("aria-label", why ? `${label}, ${t2(`reject.${why}`)}` : label);
  return b;
}
function emptySlot() {
  const d = document.createElement("div");
  d.className = "card is-gone";
  return d;
}

// src/ui/components/number-line.js
var NS = "http://www.w3.org/2000/svg";
var W = 1e3;
var LEFT = 75;
var RIGHT = 925;
var AXIS = 118;
var NUM_SIZE = 52;
var ANSWER_SIZE = 56;
var CHAR_WIDTH = 0.62;
var LABEL_Y = AXIS + 62;
var ANSWER_Y = AXIS + 128;
var THIN_WIDTH = 0.2;
function textBox(text2, x, y, size) {
  const thin = [...text2].filter((ch) => ch === "\u202F").length;
  const width = (text2.length - thin) * size * CHAR_WIDTH + thin * size * THIN_WIDTH;
  const cx = Math.min(W - width / 2, Math.max(width / 2, x));
  return { text: text2, x: cx, y, width, height: size };
}
function lineLayout(task, { solution = false } = {}) {
  const { min, max, ticks: steps, labels: labelled } = task.line;
  const x = (n) => LEFT + (n - min) / (max - min) * (RIGHT - LEFT);
  const ticks = [];
  const labels = [];
  const smallest = steps[steps.length - 1];
  const SIZES = ["big", "mid", "small"];
  for (let n = min; n <= max; n += smallest) {
    ticks.push({ x: x(n), size: SIZES[steps.findIndex((s) => n % s === 0)] });
    if (labelled.includes(n)) labels.push(textBox(formatNumber(n), x(n), LABEL_Y, NUM_SIZE));
  }
  const marks = task.marks.map((m2, i) => ({ x: x(m2), right: i === task.correctIndex }));
  const m = task.marks[task.correctIndex];
  const answer2 = solution ? textBox(formatNumber(m), x(m), ANSWER_Y, ANSWER_SIZE) : null;
  return { width: W, height: solution ? ANSWER_Y + 14 : 200, ticks, labels, marks, answer: answer2 };
}
function el(name, attrs, text2) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text2 !== void 0) e.textContent = text2;
  return e;
}
function renderNumberLine(task, { solution = false } = {}) {
  const L = lineLayout(task, { solution });
  const svg = el("svg", { viewBox: `0 0 ${L.width} ${L.height}`, class: "nline-svg", role: "img", "aria-label": task.marks.map((m, i) => task.choices[i]).join(", ") });
  svg.append(el("line", { x1: LEFT, y1: AXIS, x2: RIGHT, y2: AXIS, class: "nline-axis" }));
  const HALF = { big: 18, mid: 11, small: 6 };
  for (const t2 of L.ticks) svg.append(el("line", { x1: t2.x, y1: AXIS - HALF[t2.size], x2: t2.x, y2: AXIS + HALF[t2.size], class: `nline-tick is-${t2.size}` }));
  for (const t2 of L.labels) svg.append(el("text", { x: t2.x, y: t2.y, class: "nline-num" }, t2.text));
  L.marks.forEach((mk, i) => {
    const g = el("g", { class: `nline-mark${solution && mk.right ? " is-right" : ""}` });
    g.append(el("path", { d: `M${mk.x} ${AXIS - 4} l-12 -26 h24 z`, class: "nline-pin" }));
    g.append(el("circle", { cx: mk.x, cy: 44, r: 26, class: "nline-dot" }));
    g.append(el("text", { x: mk.x, y: 56, class: "nline-letter" }, task.choices[i]));
    svg.append(g);
  });
  if (L.answer) svg.append(el("text", { x: L.answer.x, y: L.answer.y, class: "nline-num is-answer" }, L.answer.text));
  return svg;
}

// src/ui/components/number-wall.js
var ROWS = [[5], [3, 4], [0, 1, 2]];
function renderNumberWall(task, { solution = false, all = false, t: t2 } = {}) {
  const { cells, hidden } = task.wall;
  const i = task.stepIndex - (task.stepOffset ?? 0);
  const current2 = hidden[i];
  const filled = new Set(hidden.slice(0, i));
  const wrap = document.createElement("div");
  wrap.className = "nwall";
  wrap.setAttribute("role", "img");
  const label = [];
  for (const row of ROWS) {
    const r = document.createElement("div");
    r.className = "nwall-row";
    for (const cell of row) {
      const stone = document.createElement("span");
      stone.className = "nwall-stone";
      const known = !hidden.includes(cell) || filled.has(cell);
      if (cell === current2) {
        stone.classList.add(solution ? "is-solved" : "is-current");
        stone.textContent = solution ? formatNumber(cells[cell]) : "?";
      } else if (known || solution && all) {
        stone.textContent = formatNumber(cells[cell]);
      } else {
        stone.classList.add("is-empty");
      }
      label.push(stone.textContent || "_");
      r.append(stone);
    }
    wrap.append(r);
  }
  wrap.setAttribute("aria-label", t2 ? t2("task.wallLabel", { stones: label.join(", ") }) : label.join(", "));
  return wrap;
}

// src/ui/components/task-panel.js
var BUBBLE_HTML = `
  <div class="timer" data-ref="timer" aria-hidden="true"><i></i><i></i><i></i><b data-ref="fill"></b></div>
  <p class="bubble-ask" data-ref="ask"></p>
  <div class="steps-dots" data-ref="dots" hidden></div>
  <div class="nline" data-ref="line" hidden></div>
  <p class="free-note" data-ref="note" role="status" hidden></p>
  <p class="yours" data-ref="yours" hidden></p>
  <p class="eq" data-ref="eq"></p>
  <p class="way" data-ref="way" hidden></p>
  <div class="answers" data-ref="answers"></div>
  <button class="btn btn-go" type="button" data-ref="next" hidden></button>`;
function createTaskPanel(bubble, { t: t2, onAnswer, onNext }) {
  bubble.innerHTML = BUBBLE_HTML;
  const ref = Object.fromEntries([...bubble.querySelectorAll("[data-ref]")].map((el2) => [el2.dataset.ref, el2]));
  let buttons = [];
  let locked = true;
  let current2 = null;
  const NEXT_GUARD_MS = 700;
  let solutionAt = 0;
  const nextReady = () => !ref.next.hidden && performance.now() - solutionAt >= NEXT_GUARD_MS;
  ref.next.addEventListener("click", () => {
    if (nextReady()) onNext();
  });
  const ANSWER_GUARD_MS = 450;
  let openedAt = 0;
  const answerReady = () => performance.now() - openedAt >= ANSWER_GUARD_MS;
  function fitEq() {
    ref.eq.classList.remove("is-long");
    for (let size = 64; size >= 44; size -= 2) {
      ref.eq.style.fontSize = `calc(${size} * var(--u))`;
      if (ref.eq.scrollWidth <= ref.eq.clientWidth) return;
    }
    ref.eq.classList.add("is-long");
    ref.eq.style.fontSize = "calc(34 * var(--u))";
  }
  function fitAnswers() {
    if (ref.answers.hidden || buttons.length === 0) return;
    const over = () => buttons.some((b) => b.scrollWidth > b.clientWidth);
    const shrink = () => {
      buttons.forEach((b) => {
        b.style.fontSize = "";
      });
      if (!over()) return true;
      const base = parseFloat(getComputedStyle(buttons[0]).fontSize);
      for (let f = base * 0.95; f >= base * 0.6; f -= base * 0.05) {
        buttons.forEach((b) => {
          b.style.fontSize = `${f}px`;
        });
        if (!over()) return true;
      }
      return false;
    };
    ref.answers.classList.remove("is-stacked");
    if (shrink()) return;
    ref.answers.classList.add("is-stacked");
    shrink();
  }
  const refit = () => {
    if (bubble.hidden) return;
    if (!ref.eq.hidden) fitEq();
    fitAnswers();
  };
  window.addEventListener("resize", refit);
  const freeText = (left) => t2(left === 0 ? "ask.freeNone" : left === 1 ? "ask.freeMistake" : "ask.freeMistakes", { n: left });
  const AIR = { right: "is-done", wrong: "is-popped", now: "is-now", open: "" };
  const CHECK2 = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12.5l3.6 3.6L17.5 8.5" fill="none" stroke="#14161f" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let progressLabel = "";
  function renderAir(progress) {
    ref.dots.hidden = false;
    ref.dots.classList.add("is-air");
    ref.dots.replaceChildren(...progress.map((state) => {
      const d = document.createElement("i");
      if (AIR[state]) d.className = AIR[state];
      if (state === "right") d.innerHTML = CHECK2;
      return d;
    }));
    if (progressLabel) {
      const note = document.createElement("span");
      note.className = "air-note";
      note.setAttribute("aria-hidden", "true");
      note.textContent = progressLabel;
      ref.dots.append(note);
    }
    ref.dots.setAttribute("role", "img");
    ref.dots.setAttribute("aria-label", progressLabel);
  }
  function renderSteps(task, progress = null) {
    ref.note.hidden = !(task.steps && task.freeLeft < task.freeMistakes);
    if (!ref.note.hidden) ref.note.textContent = freeText(task.freeLeft);
    ref.dots.classList.remove("is-air");
    ref.dots.removeAttribute("role");
    if (progress) {
      renderAir(progress);
      return;
    }
    if (!task.steps) {
      ref.dots.hidden = true;
      return;
    }
    ref.dots.hidden = false;
    ref.dots.replaceChildren(...task.steps.map((_, i) => {
      const d = document.createElement("i");
      if (i < task.stepIndex) d.className = "is-done";
      else if (i === task.stepIndex) d.className = "is-now";
      return d;
    }));
    ref.dots.setAttribute("aria-label", t2("task.stepOf", { n: task.stepIndex + 1, of: task.steps.length }));
  }
  return {
    timerRoot: ref.timer,
    timerFill: ref.fill,
    open(task, { progress = null, label = "", note = null } = {}) {
      current2 = task;
      progressLabel = label;
      ref.way.hidden = true;
      ref.yours.hidden = true;
      const fmt = task.stepFormat ?? task.format;
      const equations = fmt === "pickTrue" || fmt === "pickFalse" || fmt === "compareTerms";
      const isLine = fmt === "numberLine";
      const isWall = fmt === "wall";
      ref.timer.classList.toggle("no-tempo", Boolean(task.noTempo));
      bubble.classList.toggle("is-wide", equations || isLine);
      bubble.classList.toggle("is-line", isLine || isWall);
      bubble.classList.remove("solution");
      if (fmt === "solve" && !task.steps) {
        ref.ask.textContent = "";
        ref.eq.textContent = `${task.prompt} = ?`;
      } else {
        ref.ask.textContent = t2(task.prompt, task.promptParams ?? {});
        ref.eq.textContent = task.display ?? "";
      }
      ref.eq.hidden = equations || isLine || isWall || fmt === "divisibility";
      ref.line.hidden = !(isLine || isWall);
      if (isLine) ref.line.replaceChildren(renderNumberLine(task));
      else if (isWall) ref.line.replaceChildren(renderNumberWall(task, { t: t2 }));
      else ref.line.replaceChildren();
      renderSteps(task, progress);
      if (note) {
        ref.note.textContent = note;
        ref.note.hidden = false;
      }
      ref.answers.hidden = false;
      ref.answers.classList.toggle("is-equations", equations);
      ref.answers.classList.toggle("is-terms", fmt === "compareTerms");
      buttons = task.choices.map((label2, k) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "answer";
        b.innerHTML = `<span></span><span class="key">${k + 1}</span>`;
        b.firstChild.textContent = label2;
        b.addEventListener("click", () => {
          if (locked || !answerReady()) return;
          locked = true;
          buttons.forEach((x) => {
            x.disabled = true;
          });
          onAnswer(k);
        });
        return b;
      });
      ref.answers.replaceChildren(...buttons);
      for (const k of task.wrongChoices ?? []) {
        buttons[k].disabled = true;
        buttons[k].classList.add("is-wrong");
      }
      for (const k of task.usedChoices ?? []) {
        buttons[k].disabled = true;
        buttons[k].classList.add("is-used");
      }
      ref.next.hidden = true;
      bubble.hidden = false;
      locked = false;
      openedAt = performance.now();
      if (!ref.eq.hidden) fitEq();
      fitAnswers();
    },
    // Stand der Schritte: Punkte und Satz zu den freien Fehlversuchen
    lock() {
      locked = true;
      buttons.forEach((x) => {
        x.disabled = true;
      });
    },
    choose(k) {
      if (locked || !buttons[k] || !answerReady()) return false;
      buttons[k].click();
      return true;
    },
    markRight(k) {
      buttons[k]?.classList.add("is-right");
    },
    markWrong(k) {
      buttons[k]?.classList.add("is-wrong");
    },
    // wayText: Rechenweg unter der Rechnung (Phase 6b, Regelwerk 8.1) oder null.
    // chosenText: die getippte Antwort, klein und durchgestrichen unter der Lösung (Phase 7a, D47), oder null
    showSolution(askText, solutionText, wayText2 = null, chosenText = null) {
      bubble.classList.add("solution");
      ref.ask.textContent = askText;
      ref.eq.hidden = false;
      ref.eq.textContent = solutionText;
      ref.way.textContent = wayText2 ?? "";
      ref.way.hidden = !wayText2;
      if (chosenText) {
        const struck = document.createElement("s");
        struck.textContent = chosenText;
        ref.yours.replaceChildren(`${t2("ask.yours")} `, struck);
      }
      ref.yours.hidden = !chosenText;
      ref.answers.hidden = true;
      ref.timer.hidden = true;
      if ((current2?.stepFormat ?? current2?.format) === "numberLine") ref.line.replaceChildren(renderNumberLine(current2, { solution: true }));
      if (current2?.format === "wall") ref.line.replaceChildren(renderNumberWall(current2, { solution: true, all: Boolean(current2.solveAll), t: t2 }));
      ref.note.hidden = true;
      ref.next.textContent = t2("btn.next");
      ref.next.hidden = false;
      solutionAt = performance.now();
      fitEq();
      ref.next.focus({ preventScroll: true });
    },
    // Rettung (Durchsicht Etappe 6): Luftblasen sofort nach der Antwort umstellen, Satz unter den Blasen setzen
    setProgress(progress, label = "") {
      progressLabel = label;
      renderAir(progress);
    },
    setNote(text2) {
      ref.note.textContent = text2 ?? "";
      ref.note.hidden = !text2;
    },
    nextVisible: () => !ref.next.hidden,
    // Liefert false, wenn „Weiter“ nicht sichtbar ist: Dann bleibt die Eingabetaste beim fokussierten Knopf.
    pressNext() {
      if (ref.next.hidden || bubble.hidden) return false;
      if (nextReady()) ref.next.click();
      return true;
    },
    close() {
      locked = true;
      bubble.hidden = true;
      ref.next.hidden = true;
    },
    destroy() {
      window.removeEventListener("resize", refit);
    }
  };
}

// src/ui/timer.js
function createTimer({ limitMs, now }) {
  let accumulated = 0;
  let startedAt = now();
  let running = true;
  const elapsedMs = () => accumulated + (running ? now() - startedAt : 0);
  return {
    elapsedMs,
    pause() {
      if (!running) return;
      accumulated += now() - startedAt;
      running = false;
    },
    resume() {
      if (running) return;
      startedAt = now();
      running = true;
    },
    fraction() {
      if (!limitMs) return 0;
      return Math.min(1, elapsedMs() / limitMs);
    }
  };
}

// src/ui/components/timer-bar.js
function startTimerBar({ root, fill, limitMs, onTimeout }) {
  root.hidden = limitMs === 0;
  fill.style.width = "0%";
  const timer = createTimer({ limitMs, now: () => performance.now() });
  if (document.visibilityState !== "visible") timer.pause();
  let stopped = false;
  const onVisibility = () => {
    if (document.visibilityState === "visible") timer.resume();
    else timer.pause();
  };
  const tick = () => {
    if (stopped || !limitMs) return;
    const f = timer.fraction();
    fill.style.width = `${f * 100}%`;
    if (f >= 1) {
      stop();
      onTimeout();
    }
  };
  const id = limitMs ? setInterval(tick, 50) : null;
  document.addEventListener("visibilitychange", onVisibility);
  function stop() {
    if (stopped) return;
    stopped = true;
    if (id) clearInterval(id);
    document.removeEventListener("visibilitychange", onVisibility);
  }
  return {
    stop,
    elapsedMs: () => Math.round(timer.elapsedMs())
  };
}

// src/ui/tutorial.js
var STEP_TARGET = { 1: "#foes", 2: "#hand", 3: null, 4: "#endBtn" };
function createTutorial({ active }) {
  let step = active ? 1 : 0;
  return {
    get active() {
      return step > 0;
    },
    get step() {
      return step;
    },
    text(t2, { noPlayable = false } = {}) {
      if (step === 0) return null;
      if (step === 4 && noPlayable) return t2("tutorial.step4end");
      return t2(`tutorial.step${step}`);
    },
    // what: 'target' | 'task' | 'answered' | 'turnEnded' | 'combatOver'
    // Liefert true, wenn die Erklärung damit fertig ist.
    advance(what) {
      if (step === 0) return false;
      if (what === "combatOver") {
        step = 0;
        return true;
      }
      if (step === 1 && what === "target") step = 2;
      else if (step <= 2 && what === "task") step = 3;
      else if (step === 3 && what === "answered") step = 4;
      else if (step === 4 && what === "turnEnded") {
        step = 0;
        return true;
      }
      return false;
    },
    // Hervorhebung setzen (Klasse is-tutorial-focus) und alte entfernen.
    // quiet: solange eine Aufgabe offen ist, wird nichts hervorgehoben
    highlight(root, { quiet = false } = {}) {
      root.querySelectorAll(".is-tutorial-focus").forEach((el2) => el2.classList.remove("is-tutorial-focus"));
      root.querySelector("#caption")?.classList.toggle("is-quiet", quiet);
      if (quiet) return;
      const sel = STEP_TARGET[step];
      if (sel) root.querySelector(sel)?.classList.add("is-tutorial-focus");
    }
  };
}

// src/ui/screens/combat.js
var STAGE_HTML = `
<main class="stage">
  <section class="scene panel" id="scene" aria-label="Kampf">
    <div class="scene-bg" id="sceneBg"></div>
    <p class="caption" id="caption" aria-live="polite"></p>
    <div class="hero" id="hero">
      <div class="hero-art" id="heroArt"></div>
      <span class="current" id="currentPlate" hidden></span>
      <div class="plate hero-plate">
        <span class="stat block" id="heroBlock" hidden></span>
        <span class="stat streak" id="heroStreak" hidden></span>
      </div>
      <div class="hpbar"><i id="heroHpBar"></i><span class="hpbar-num" id="heroHp"></span></div>
    </div>
    <div class="foes" id="foes"></div>
    <div class="bubble" id="bubble" hidden></div>
    <div class="boom" id="boom" aria-hidden="true"></div>
    <div class="banner" id="banner" hidden>
      <p class="banner-word" id="bannerWord"></p>
      <p class="banner-text" id="bannerText"></p>
      <button class="btn btn-go" type="button" id="againBtn"></button>
    </div>
  </section>
  <section class="strip panel" aria-label="Karten">
    <div class="panel stats">
      <div class="energy" id="energy"></div>
      <div class="piles"><span class="pile" id="drawPile"></span><span class="pile" id="discardPile"></span></div>
    </div>
    <div class="hand" id="hand"></div>
    <div class="actions">
      <button class="btn btn-quiet" type="button" id="discardBtn"></button>
      <button class="btn btn-end" type="button" id="endBtn"></button>
    </div>
  </section>
</main>`;
var clone3 = (o) => JSON.parse(JSON.stringify(o));
function mountCombat(root, { config, t: t2, game, audio, onWon, onLost, tutorial = false, explained = {}, onExplain = () => {
}, onPersist = () => {
} }) {
  root.innerHTML = STAGE_HTML;
  const $ = (id) => root.querySelector(`#${id}`);
  const cards = config.cards;
  const handSize = config.game.hero.handSize;
  let combat;
  let shown;
  let targetUid = null;
  let mode = null;
  let picked = /* @__PURE__ */ new Set();
  let busy = false;
  let foesTurn = false;
  let pendingUid = null;
  let task = null;
  let timerBar = null;
  const tut = createTutorial({ active: tutorial });
  const seenCards = new Set(Object.keys(explained).filter((k) => k.startsWith("card.")).map((k) => k.slice(5)));
  const ruleBoss = game.combat.enemies.find((e) => e.rule && !explained[`boss.${e.typeId}`]);
  let ruleText = ruleBoss ? t2(`boss.rule.${ruleBoss.typeId}`) : null;
  if (ruleBoss) onExplain(`boss.${ruleBoss.typeId}`);
  const elite = game.combat.enemies.find((e) => e.elite);
  if (!ruleText && elite) ruleText = t2(`elite.${elite.elite.rule}`, { name: t2(`enemies.${elite.typeId}.name`) });
  const panel = createTaskPanel($("bubble"), { t: t2, onAnswer: (k) => answer2(k), onNext: () => next() });
  const cardHint = document.createElement("p");
  cardHint.className = "card-hint";
  cardHint.id = "cardHint";
  cardHint.hidden = true;
  $("bubble").prepend(cardHint);
  const areaId = game.view().run?.areaId ?? "reef";
  $("scene").dataset.area = areaId;
  $("sceneBg").append(renderAsset(config.areas.areas[areaId]?.background ?? "area.reef", ""));
  const profile = game.view().profile;
  const heroAsset = profile?.asset ?? "hero.diver";
  $("heroArt").append(renderAsset(heroAsset, profile?.name ?? t2("hero.name")));
  const poseImgs = /* @__PURE__ */ new Map();
  function poseImg(key) {
    if (!poseImgs.has(key)) {
      const url = assetUrl(key);
      let img = null;
      if (url) {
        img = new Image();
        img.src = url;
        img.alt = "";
        img.className = "pose-img";
        img.draggable = false;
      }
      poseImgs.set(key, img);
    }
    return poseImgs.get(key);
  }
  const foeAsset = (uid) => `enemy.${shown?.enemies.find((x) => x.uid === uid)?.typeId}`;
  for (const kind of ["attack", "hit"]) poseImg(`${heroAsset}.${kind}`);
  const live = () => combatView(combat, { targetUid });
  function autoTarget() {
    const v = combatView(combat);
    if (targetUid && !v.enemies.find((e) => e.uid === targetUid)?.alive) targetUid = null;
    const candidates = v.enemies.filter((e) => e.alive && !e.shielded);
    if (!targetUid && candidates.length === 1 && tut.step !== 1) targetUid = candidates[0].uid;
  }
  function render(v = live(), { keepFoes = false } = {}) {
    shown = v;
    const h = v.hero;
    $("heroHp").innerHTML = `${ICON.heart}<span>${h.hp}/${h.maxHp}</span>`;
    $("heroHp").setAttribute("aria-label", t2("hud.hp", { n: h.hp, max: h.maxHp }));
    $("heroBlock").hidden = h.block <= 0;
    $("heroBlock").innerHTML = `${ICON.shield}<span>${h.block}</span>`;
    const streakOn = (h.streak ?? 0) >= config.game.streak.from;
    $("heroStreak").hidden = !streakOn;
    if (streakOn) $("heroStreak").textContent = t2("hud.streak", { n: h.streak });
    const cur = v.current ?? 1;
    $("currentPlate").hidden = cur === 1;
    if (cur !== 1) {
      $("currentPlate").textContent = t2(cur > 1 ? "current.strongShort" : "current.calmShort");
      $("currentPlate").setAttribute("aria-label", t2(cur > 1 ? "current.strong" : "current.calm"));
      $("currentPlate").title = t2(cur > 1 ? "current.strong" : "current.calm");
      $("currentPlate").classList.toggle("is-low", cur < 1);
    }
    $("heroHpBar").style.width = `${Math.max(0, h.hp) / h.maxHp * 100}%`;
    const foes = $("foes");
    foes.dataset.n = v.enemies.length;
    if (!keepFoes) foes.replaceChildren(...v.enemies.map((e) => renderEnemy(e, { t: t2, selected: e.uid === targetUid && v.phase !== "rescue" })));
    const maxEnergy = config.game.hero.energy;
    $("energy").innerHTML = Array.from(
      { length: Math.max(maxEnergy, h.energy) },
      (_, k) => `<span class="${k < h.energy ? "" : "is-empty"}">${ICON.bolt}</span>`
    ).join("");
    $("energy").setAttribute("aria-label", t2("hud.energy", { n: h.energy, max: maxEnergy }));
    $("drawPile").innerHTML = `${ICON.deck}<span>${t2("hud.drawPile", { n: v.piles.draw })}</span>`;
    $("discardPile").innerHTML = `${ICON.discard}<span>${t2("hud.discardPile", { n: v.piles.discard })}</span>`;
    const hand = $("hand");
    hand.classList.toggle("is-discard", mode === "discard");
    hand.classList.toggle("is-cycle", v.phase === "cycle");
    hand.classList.toggle("is-locked", v.phase === "rescue");
    const slots = [];
    for (let k = 0; k < Math.max(handSize, v.hand.length); k++) {
      const c = v.hand[k];
      if (!c) {
        slots.push(emptySlot());
        continue;
      }
      const why = v.phase === "player" && !mode && !busy ? c.blockedReason : null;
      slots.push(renderCard(c, cards[c.cardId], { t: t2, why, picked: picked.has(c.uid), pending: c.uid === pendingUid }));
    }
    hand.replaceChildren(...slots);
    if (v.phase === "rescue") for (const b of [...foes.querySelectorAll("button"), ...hand.querySelectorAll("button")]) b.disabled = true;
    const playing = v.phase === "player" && !busy;
    const discardBtn = $("discardBtn");
    discardBtn.textContent = mode ? t2("btn.discardStop") : t2("btn.discard", { n: v.discardsLeft });
    discardBtn.setAttribute("aria-pressed", String(mode != null));
    discardBtn.disabled = !playing || !mode && (v.discardsLeft === 0 || v.hand.length === 0);
    $("endBtn").textContent = t2("btn.end");
    $("endBtn").disabled = !playing || mode != null;
    renderCaption(v);
    tut.highlight(root, { quiet: v.phase !== "player" });
  }
  function renderCaption(v) {
    let text2 = "";
    if (foesTurn) text2 = t2("caption.foeTurn");
    else if (v.phase === "feedback") text2 = t2("caption.next");
    else if (v.phase === "rescue") text2 = t2("rescue.caption", { needed: v.rescue.needed, total: v.rescue.total });
    else if (v.phase === "task" && task) {
      const f = task.stepFormat ?? task.format;
      text2 = t2(f === "solve" ? "caption.solve" : `caption.${f}`);
    } else if (v.phase === "cycle") text2 = v.cycleRequired === 1 ? t2("caption.cycleOne") : t2("caption.cycle", { n: v.cycleRequired });
    else if (v.phase === "player") {
      const candidates = v.enemies.filter((e) => e.alive && !e.shielded);
      if (mode === "discard") text2 = t2("caption.discard");
      else if (!v.hand.some((c) => c.cost <= v.hero.energy)) text2 = t2("caption.noEnergy");
      else if (!targetUid && candidates.length > 1) text2 = t2("caption.pickFoe");
      else if (targetUid && v.enemies.find((e) => e.uid === targetUid)?.shielded) text2 = t2("caption.shieldedTarget");
      else text2 = t2("caption.pickCard");
    }
    const noPlayable = v.phase === "player" && !v.hand.some((c) => c.cost <= v.hero.energy);
    const tutText = !foesTurn && v.phase !== "feedback" ? tut.text(t2, { noPlayable }) : null;
    const hintShown = v.phase === "task" && !$("cardHint").hidden;
    const lead = tutText ?? (ruleText && v.phase === "player" ? ruleText : null);
    $("caption").textContent = hintShown ? "" : lead ?? text2;
    $("caption").classList.toggle("is-tutorial", Boolean(lead));
  }
  function showBoom(text2) {
    const el2 = $("boom");
    el2.textContent = text2;
    el2.classList.remove("is-on");
    void el2.offsetWidth;
    el2.classList.add("is-on");
  }
  function floatAt(target, text2, cls = "") {
    if (!target) return;
    const scene = $("scene").getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const el2 = document.createElement("span");
    el2.className = `float ${cls}`;
    el2.textContent = text2;
    el2.style.left = `${r.left - scene.left + r.width / 2}px`;
    el2.style.top = `${r.top - scene.top + r.height * 0.3}px`;
    $("scene").append(el2);
    setTimeout(() => el2.remove(), 1050);
  }
  function shake(el2) {
    if (!el2 || isCalm()) return;
    el2.animate([{ transform: "translateX(0)" }, { transform: "translateX(6px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(0)" }], { duration: 260 });
  }
  const foeEl = (uid) => root.querySelector(`.foe[data-uid="${uid}"]`);
  const EASE = "cubic-bezier(0.16,1,0.3,1)";
  const NO_BACK = async () => {
  };
  const settled = (anim, ms) => Promise.race([anim.finished.catch(() => {
  }), wait(ms + 200)]);
  async function dash(mover, target, dir = 1, reach = 0) {
    if (!mover || !target || isCalm()) return NO_BACK;
    const rect = (el2) => (el2.querySelector("img:not(.pose-img)") ?? el2).getBoundingClientRect();
    const m = rect(mover);
    const d = dashDistance({ left: m.left - (dir < 0 ? reach : 0), right: m.right + (dir > 0 ? reach : 0) }, rect(target), dir, 0.15);
    const layer = mover.closest(".hero, .foes") ?? mover;
    layer.style.zIndex = "4";
    const go = mover.animate(
      [{ transform: "translateX(0)" }, { transform: `translateX(${d}px)` }],
      { duration: 240, easing: "cubic-bezier(0.55,0,0.8,0.3)", fill: "forwards" }
    );
    await settled(go, 240);
    return async () => {
      const back = mover.animate([{ transform: `translateX(${d}px)` }, { transform: "translateX(0)" }], { duration: 300, easing: EASE, fill: "forwards" });
      await settled(back, 300);
      go.cancel();
      back.cancel();
      layer.style.zIndex = "";
    };
  }
  function poseLayout(art, key, anchor = 0.5) {
    const pose = poseImg(key);
    const base = art?.querySelector("img:not(.pose-img)");
    if (!pose || !base || isCalm() || !pose.naturalWidth || !base.naturalWidth) return null;
    const a = art.getBoundingClientRect();
    const b = base.getBoundingClientRect();
    const box = poseBox(
      { left: b.left - a.left, bottom: a.bottom - b.bottom, width: b.width, height: b.height },
      { width: base.naturalWidth, height: base.naturalHeight },
      { width: pose.naturalWidth, height: pose.naturalHeight },
      anchor
    );
    return { pose, art, box, reach: Math.max(0, a.left + box.left + box.width - b.right), reachLeft: Math.max(0, b.left - a.left - box.left) };
  }
  const heroPose = (kind) => poseLayout($("heroArt"), `${heroAsset}.${kind}`, profile?.poseAnchor ?? 0.5);
  const foePose = (uid, kind) => poseLayout(foeEl(uid)?.querySelector(".foe-art"), `${foeAsset(uid)}.${kind}`);
  function showPose(layout) {
    if (!layout) return () => {
    };
    const { pose, art, box } = layout;
    Object.assign(pose.style, { left: `${box.left}px`, bottom: `${box.bottom}px`, width: `${box.width}px`, height: `${box.height}px` });
    art.append(pose);
    art.classList.add("is-posing");
    return () => {
      pose.remove();
      art.classList.remove("is-posing");
    };
  }
  function flash(el2, dir = 1) {
    const img = el2?.querySelector(".pose-img") ?? el2?.querySelector("img");
    if (!img || isCalm()) return;
    const base = getComputedStyle(img).filter;
    const bright = base === "none" ? "brightness(2.4) saturate(0.4)" : `${base} brightness(2.4) saturate(0.4)`;
    const normal = base === "none" ? "brightness(1) saturate(1)" : `${base} brightness(1) saturate(1)`;
    img.animate([{ filter: normal }, { filter: bright, offset: 0.2 }, { filter: normal }], { duration: 380 });
    const d = el2.getBoundingClientRect().width * 0.08 * dir;
    img.animate([{ transform: "translateX(0) rotate(0deg)" }, { transform: `translateX(${d}px) rotate(${3 * dir}deg)`, offset: 0.3 }, { transform: "translateX(0) rotate(0deg)" }], { duration: 420, easing: EASE });
  }
  function bubbles(el2, n = 9) {
    if (!el2 || isCalm()) return;
    const scene = $("scene").getBoundingClientRect();
    const r = el2.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const b = document.createElement("span");
      b.className = "fx-bubble";
      const size = 10 + i * 7 % 16;
      b.style.width = `${size}px`;
      b.style.height = `${size}px`;
      b.style.left = `${r.left - scene.left + r.width * (0.2 + 0.6 * (i * 37 % 100) / 100)}px`;
      b.style.top = `${r.top - scene.top + r.height * (0.45 + 0.3 * (i * 53 % 100) / 100)}px`;
      $("scene").append(b);
      const rise = r.height * (0.5 + i * 29 % 40 / 100);
      b.animate(
        [{ transform: "translateY(0) scale(0.4)", opacity: 0 }, { transform: `translateY(${-rise * 0.3}px) scale(1)`, opacity: 1, offset: 0.25 }, { transform: `translateY(${-rise}px) scale(1.1)`, opacity: 0 }],
        { duration: 900 + i % 4 * 120, delay: i % 5 * 60, easing: "ease-out", fill: "backwards" }
      ).finished.then(() => b.remove(), () => b.remove());
    }
  }
  function dome(el2) {
    if (!el2 || isCalm()) return;
    const scene = $("scene").getBoundingClientRect();
    const r = el2.getBoundingClientRect();
    const d = document.createElement("span");
    d.className = "fx-dome";
    const size = Math.max(r.width, r.height * 0.75);
    d.style.width = `${size}px`;
    d.style.height = `${size}px`;
    d.style.left = `${r.left - scene.left + r.width / 2 - size / 2}px`;
    d.style.top = `${r.top - scene.top + r.height * 0.55 - size / 2}px`;
    $("scene").append(d);
    d.animate(
      [{ transform: "scale(0.5)", opacity: 0 }, { transform: "scale(1.06)", opacity: 1, offset: 0.25 }, { transform: "scale(1)", opacity: 1, offset: 0.4 }, { transform: "scale(1)", opacity: 0 }],
      { duration: 1100, easing: EASE }
    ).finished.then(() => d.remove(), () => d.remove());
  }
  function healGlow(el2) {
    const img = el2?.querySelector("img");
    if (!img || isCalm()) return;
    const base = getComputedStyle(img).filter;
    const glow = "drop-shadow(0 0 4px rgba(214, 255, 228, 1)) drop-shadow(0 0 28px rgba(63, 191, 127, 0.95))";
    img.animate([{ filter: base }, { filter: glow, offset: 0.35 }, { filter: glow, offset: 0.6 }, { filter: base }], { duration: 1e3, easing: "ease-in-out" });
  }
  const sound = (e) => audio?.event(e);
  const handlers = {
    // Tauschkrebs (Phase 9, Etappe 7): neue Immunität zu Beginn der Runde
    immunityRotated(e) {
      const foe = shown.enemies.find((x) => x.uid === e.enemyUid);
      if (foe) {
        foe.immune = e.immune;
        foe.nextImmune = e.next;
      }
      render(shown);
    },
    streakChanged(e) {
      shown.hero.streak = e.streak;
      render(shown);
    },
    cardPlayed(e) {
      ruleText = null;
      showCardHint(e.cardId);
      if (cards[e.cardId].task) pendingUid = e.cardUid;
      shown.hero.energy -= cards[e.cardId].cost;
      render(shown);
    },
    taskOpened(e) {
      task = e.task;
      panel.open(task);
      timerBar = startTimerBar({ root: panel.timerRoot, fill: panel.timerFill, limitMs: task.timeLimitMs, onTimeout: () => answer2(-1) });
      if (tut.step <= 2 && tut.active) tut.advance("task");
      render(shown);
    },
    // Mehrschrittige Aufgaben (Phase 5, Etappe 4)
    async stepJudged(e) {
      if (e.outcome === "correct") {
        panel.markRight(task.correctIndex);
        await wait(260);
      } else {
        if (e.chosen >= 0) panel.markWrong(e.chosen);
      }
    },
    stepOpened(e) {
      task = e.task;
    },
    async bossPhase() {
      showBoom(t2("boss.phase2"));
      await wait(700);
    },
    // Rettungsaufgabe (Phase 10, Etappe 4): Lautwort zuerst, dann die Aufgabe ohne Zeitleiste (nichts bewegt sich über ihr)
    async rescueStarted(e) {
      foesTurn = false;
      rescue = { total: e.total, needed: e.needed, results: [], failed: false };
      shown = { ...live(), hero: shown.hero };
      render(shown);
      showBoom(t2("rescue.boom"));
      await new Promise((resolve) => setTimeout(resolve, 1e3));
      $("boom").classList.remove("is-on");
      openRescue(e.task);
    },
    rescueTaskOpened(e) {
      openRescue(e.task);
    },
    async rescueJudged(e) {
      rescue.results.push(e.outcome === "correct" ? "right" : "wrong");
      panel.setProgress(rescueProgress(false), rescueNeed());
      if (e.outcome === "correct") {
        panel.markRight(task.correctIndex);
        await wait(500);
      } else {
        panel.markWrong(e.chosen);
        panel.markRight(task.correctIndex);
        await wait(600);
        showFeedback(e);
        panel.setProgress(rescueProgress(false), rescueNeed());
      }
    },
    async rescueEnded(e) {
      panel.close();
      task = null;
      if (!e.saved) {
        rescue.failed = true;
        return;
      }
      const before = shown.hero.hp;
      shown.hero.hp = e.hp;
      render(shown);
      $("caption").textContent = t2("rescue.saved", { hp: e.hp });
      showBoom(t2("rescue.savedWord"));
      floatAt($("hero"), `+${e.hp - Math.max(0, before)}`, "is-heal");
      await new Promise((resolve) => setTimeout(resolve, 3e3));
    },
    async secondWind() {
      showBoom(t2("talents.secondWindBoom"));
      await wait(700);
    },
    weakened(e) {
      const foe = shown.enemies.find((x) => x.uid === e.enemyUid);
      foe.weakTurns = e.turns;
      if (foe.intent?.type === "attack") foe.intent = { ...foe.intent, amount: Math.max(0, foe.intent.amount - e.amount) };
      render(shown);
    },
    freeMistakeUsed(e) {
      task = { ...task, freeLeft: e.left };
    },
    async energyGained(e) {
      shown.hero.energy += e.amount;
      render(shown);
      floatAt($("hero"), `+${e.amount}`, "is-block");
      await wait(450);
    },
    async answerJudged(e) {
      if (e.outcome === "correct") {
        panel.markRight(task.correctIndex);
        await wait(260);
        panel.close();
        showBoom(t2(`boom.${e.tierId}`));
      } else {
        if (e.chosen >= 0) panel.markWrong(e.chosen);
        panel.markRight(task.correctIndex);
        await wait(600);
        showFeedback(e);
      }
    },
    async damageDealt(e) {
      const foe = shown.enemies.find((x) => x.uid === e.targetUid);
      foe.block -= e.blocked;
      foe.hp -= e.amount;
      const back = await dash($("heroArt"), foeEl(e.targetUid)?.querySelector(".foe-art"), 1, heroPose("attack")?.reach ?? 0);
      const unpose = showPose(heroPose("attack"));
      render(shown);
      floatAt(foeEl(e.targetUid), `\u2212${e.amount}`);
      const unposeFoe = showPose(foePose(e.targetUid, "hit"));
      flash(foeEl(e.targetUid)?.querySelector(".foe-art"));
      if (isCalm()) {
        await wait(450);
        return;
      }
      await wait(260);
      unpose();
      await back();
      unposeFoe();
    },
    async blockGained(e) {
      shown.hero.block += e.amount;
      render(shown);
      dome($("hero"));
      floatAt($("hero"), `+${e.amount}`, "is-block");
      await wait(450);
    },
    async healed(e) {
      shown.hero.hp += e.amount;
      render(shown);
      healGlow($("hero"));
      floatAt($("hero"), `+${e.amount}`, "is-heal");
      await wait(450);
    },
    // Besiegter Gegner zerfällt in Blasen (D36)
    async enemyDefeated(e) {
      const el2 = foeEl(e.enemyUid);
      if (!el2 || isCalm()) return;
      const art = el2.querySelector(".foe-art") ?? el2;
      bubbles(art);
      art.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.85) translateY(-6%)", opacity: 0.2 }], { duration: 520, easing: "ease-in", fill: "forwards" });
      await wait(520);
    },
    async selfDamage(e) {
      shown.hero.block -= e.blocked;
      shown.hero.hp -= e.amount;
      render(shown);
      if (e.amount > 0) floatAt($("hero"), `\u2212${e.amount}`, "is-self");
      await wait(500);
    },
    async enemyActed(e) {
      const foe = shown.enemies.find((x) => x.uid === e.enemyUid);
      foe.block = 0;
      if (e.intent.type === "attack") {
        const art = foeEl(e.enemyUid)?.querySelector(".foe-art");
        const back = await dash(art, $("heroArt"), -1, foePose(e.enemyUid, "attack")?.reachLeft ?? 0);
        const unpose = showPose(foePose(e.enemyUid, "attack"));
        wait(380).then(() => {
          unpose();
          return back();
        });
      }
      if (e.intent.type === "block") {
        foe.block += e.intent.amount;
        render(shown);
        floatAt(foeEl(e.enemyUid), `+${e.intent.amount}`, "is-block");
        await wait(650);
      }
    },
    async heroDamaged(e) {
      shown.hero.block -= e.blocked;
      shown.hero.hp -= e.amount;
      render(shown, { keepFoes: true });
      floatAt($("hero"), `\u2212${e.amount}`);
      const unpose = showPose(heroPose("hit"));
      flash($("heroArt"), -1);
      await wait(650);
      unpose();
    },
    cardDiscarded() {
    }
  };
  function showCardHint(cardId) {
    if (seenCards.has(cardId)) return;
    seenCards.add(cardId);
    $("cardHint").textContent = t2(`hint.card.${cardId}`);
    $("cardHint").hidden = false;
    onExplain(`card.${cardId}`);
  }
  const hideCardHint = () => {
    $("cardHint").hidden = true;
  };
  function tutorialStep(what) {
    if (tut.advance(what)) onExplain("firstCombat");
    render();
  }
  async function run(command, extraHandlers = {}) {
    busy = true;
    const events = game.dispatch(command);
    if (needsSave(events)) onPersist();
    shown = clone3(shown ?? live());
    await playEvents(events, { ...handlers, ...extraHandlers }, sound);
    busy = false;
    autoTarget();
    render();
    if (combat.phase === "won" || combat.phase === "lost") endBanner(combat.phase === "won");
    return events;
  }
  let rescue = null;
  function rescueProgress(open) {
    const n = rescue.results.length;
    return Array.from({ length: rescue.total }, (_, i) => i < n ? rescue.results[i] : open && i === n ? "now" : "open");
  }
  function rescueNeed() {
    const right = rescue.results.filter((x) => x === "right").length;
    const wrong = rescue.results.length - right;
    if (wrong > rescue.total - rescue.needed) return t2("rescue.lastChance");
    const left = rescue.needed - right;
    if (left <= 0) return "";
    return left === 1 ? t2("rescue.needOne") : t2("rescue.needMany", { n: left });
  }
  function openRescue(next2) {
    task = next2;
    panel.open(task, { progress: rescueProgress(true), label: rescueNeed() });
    panel.timerRoot.hidden = true;
  }
  async function rescueAnswer2(k) {
    if (busy) return;
    panel.lock();
    busy = true;
    const events = game.dispatch({ type: "answer", choiceIndex: k });
    if (needsSave(events)) onPersist();
    shown = clone3(shown);
    await playEvents(events.map((e) => e.type === "rescueJudged" ? { ...e, chosen: k } : e), handlers, sound);
    busy = false;
    autoTarget();
    render();
    if (combat.phase === "won" || combat.phase === "lost") endBanner(combat.phase === "won");
  }
  async function answer2(k) {
    if (combat.phase === "rescue") return rescueAnswer2(k);
    if (combat.phase !== "task" || !timerBar) return;
    panel.lock();
    timerBar.stop();
    const elapsedMs = timerBar.elapsedMs();
    timerBar = null;
    const command = k < 0 ? { type: "timeout" } : { type: "answer", choiceIndex: k, elapsedMs };
    const events = game.dispatch(command);
    if (needsSave(events)) onPersist();
    busy = true;
    shown = clone3(shown);
    await playEvents(events.map((e) => e.type === "answerJudged" || e.type === "stepJudged" ? { ...e, chosen: k } : e), handlers, sound);
    if (combat.phase === "task") {
      task = clone3(game.view().combat.task);
      panel.open(task);
      timerBar = startTimerBar({ root: panel.timerRoot, fill: panel.timerFill, limitMs: task.timeLimitMs, onTimeout: () => answer2(-1) });
      busy = false;
      render();
      return;
    }
    if (combat.phase === "feedback") {
    } else {
      pendingUid = null;
      task = null;
      hideCardHint();
      if (tut.step === 3) tut.advance("answered");
    }
    busy = false;
    autoTarget();
    render();
    if (combat.phase === "won" || combat.phase === "lost") endBanner(combat.phase === "won");
  }
  function showFeedback(judged) {
    const ask = judged.outcome === "timeout" ? t2("ask.timeout") : task.format === "pickTrue" ? t2("ask.wrongTrue") : task.format === "pickFalse" ? t2("ask.wrongFalse") : hintAsk(t2, judged.mistakeType, "ask.wrong", judged.hintPlace);
    const fmt = task.stepFormat ?? task.format;
    const k = judged.chosen;
    const chosen = judged.outcome === "wrong" && k >= 0 && fmt !== "numberLine" && fmt !== "wall" ? task.choices?.[k] ?? null : null;
    panel.showSolution(ask, judged.solutionText, wayText(t2, judged.way), chosen);
  }
  async function next() {
    if (combat.phase === "rescue" && !busy) {
      panel.close();
      task = null;
      await run({ type: "acknowledgeFeedback" });
      return;
    }
    if (combat.phase !== "feedback" || busy) return;
    panel.close();
    pendingUid = null;
    task = null;
    hideCardHint();
    if (tut.step === 3) tut.advance("answered");
    await run({ type: "acknowledgeFeedback" });
  }
  function endBanner(won) {
    if (tut.active) tutorialStep("combatOver");
    hideCardHint();
    panel.close();
    timerBar?.stop();
    $("bannerWord").textContent = t2(won ? "result.winWord" : "result.loseWord");
    $("bannerText").textContent = t2(won ? "result.winText" : rescue?.failed ? "rescue.failed" : "result.loseText");
    $("againBtn").textContent = t2(won ? "btn.next" : game.view().screen === "base" ? "btn.toBase" : "btn.again");
    $("againBtn").dataset.won = String(won);
    $("banner").hidden = false;
    $("againBtn").focus({ preventScroll: true });
  }
  $("foes").addEventListener("click", (e) => {
    const b = e.target.closest(".foe");
    if (!b || busy || combat.phase !== "player" || mode) return;
    targetUid = b.dataset.uid;
    render();
    if (tut.step === 1) tutorialStep("target");
  });
  $("hand").addEventListener("click", async (e) => {
    const b = e.target.closest(".card[data-uid]");
    if (!b || busy) return;
    const uid = b.dataset.uid;
    const v = live();
    if (v.phase === "cycle") {
      if (picked.has(uid)) picked.delete(uid);
      else if (picked.size < v.cycleRequired) picked.add(uid);
      render();
      if (picked.size === v.cycleRequired) {
        const chosen = [...picked];
        picked = /* @__PURE__ */ new Set();
        await run({ type: "confirmCycle", cardUids: chosen });
      }
      return;
    }
    if (v.phase !== "player") return;
    if (mode === "discard") {
      await run({ type: "discard", cardUid: uid });
      if (combat.discardsLeft === 0 || combat.piles.hand.length === 0) {
        mode = null;
        render();
      }
      return;
    }
    const card = v.hand.find((c) => c.uid === uid);
    const def = cards[card.cardId];
    if (def.target === "enemy" && !targetUid) {
      shake($("caption"));
      return;
    }
    if (!card.playable) {
      shake(b);
      return;
    }
    const aimed = def.target === "enemy" || def.effect.type === "damagePerStep" && targetUid;
    const events = await run({ type: "playCard", cardUid: uid, targetUid: aimed ? targetUid : void 0 });
    if (combat.phase === "cycle" && combat.cycle.required === 0) await run({ type: "confirmCycle", cardUids: [] });
    if (events[0]?.type === "rejected") shake(b);
  });
  $("discardBtn").addEventListener("click", () => {
    if (busy || combat.phase !== "player") return;
    mode = mode ? null : "discard";
    render();
  });
  $("endBtn").addEventListener("click", async () => {
    if (busy || combat.phase !== "player" || mode) return;
    foesTurn = true;
    busy = true;
    render();
    await wait(300);
    busy = false;
    hideCardHint();
    await run({ type: "endTurn" });
    foesTurn = false;
    render();
    if (tut.step === 4) tutorialStep("turnEnded");
  });
  $("againBtn").addEventListener("click", () => {
    if ($("againBtn").dataset.won === "true") onWon?.();
    else onLost?.();
  });
  const unbindKeys = bindKeys({
    1: () => panel.choose(0),
    2: () => panel.choose(1),
    3: () => panel.choose(2),
    4: () => panel.choose(3),
    Enter: () => panel.pressNext()
  });
  function start() {
    timerBar?.stop();
    timerBar = null;
    combat = game.combat;
    for (const e of combatView(combat).enemies) for (const kind of ["attack", "hit"]) poseImg(`enemy.${e.typeId}.${kind}`);
    targetUid = null;
    mode = null;
    picked = /* @__PURE__ */ new Set();
    busy = false;
    pendingUid = null;
    task = null;
    $("banner").hidden = true;
    panel.close();
    autoTarget();
    render();
  }
  start();
  return {
    get combat() {
      return combat;
    },
    destroy() {
      timerBar?.stop();
      timerBar = null;
      unbindKeys();
      panel.destroy();
    }
    // Inhalt ersetzt der nächste Bildschirm
  };
}

// src/ui/components/world.js
function homeAreaId(config, profile, run) {
  if (run?.areaId) return run.areaId;
  const open = (profile?.areas ?? []).filter((a) => a.open && !a.comingSoon).map((a) => a.id);
  return open.at(-1) ?? config.areas.order[0];
}
function worldLayer(key, className = "world-bg") {
  const bg = document.createElement("div");
  bg.className = className;
  bg.setAttribute("aria-hidden", "true");
  if (assetUrl(key)) bg.append(renderAsset(key, ""));
  return bg;
}
function addWorld(screen, key) {
  screen.classList.add("is-world");
  screen.prepend(worldLayer(key));
}
function bossOfArea(config, areaId) {
  const area = config.areas.areas[areaId];
  for (const layer of area?.layers ?? []) {
    for (const room of layer.rooms ?? []) {
      if (room.type === "boss" || room.choices?.includes("boss")) return config.bosses.encounters[room.encounter]?.at(-1) ?? null;
    }
  }
  return null;
}

// src/ui/screens/reward.js
function mountReward(root, { config, t: t2, reward, onPick, levels = {}, areaId = null }) {
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
  const ref = Object.fromEntries([...root.querySelectorAll("[data-ref]")].map((el2) => [el2.dataset.ref, el2]));
  addWorld(root.querySelector(".screen"), `area.${areaId ?? config.areas.order[0]}`);
  root.querySelector(".reward-word").textContent = reward.treasure ? t2("reward.treasureWord") : reward.riddle ? t2("reward.riddleWord") : reward.event ? t2("reward.eventWord") : t2("result.winWord");
  ref.xp.textContent = t2("reward.xp", { n: reward.xp });
  ref.xp.hidden = reward.xp === 0;
  ref.pearls.textContent = t2("reward.pearls", { n: reward.pearls });
  if (reward.levelUps > 0) {
    ref.level.hidden = false;
    ref.level.textContent = t2("reward.levelUp");
  }
  if (reward.current) {
    ref.current.hidden = false;
    ref.current.textContent = t2(reward.current.to > reward.current.from ? "current.up" : "current.down");
  }
  if (reward.item) {
    ref.item.hidden = false;
    ref.item.textContent = t2("gear.found", { name: t2(`items.${reward.item}.name`) });
    ref.item.prepend(renderAsset(`item.${reward.item}`, ""));
  }
  const stageUps = reward.stageUps ?? [];
  if (stageUps.length > 0) {
    ref.stageUps.hidden = false;
    ref.stageUps.replaceChildren(...stageUps.map(({ ladder: ladder3, pearls }) => {
      const line = document.createElement("span");
      line.className = "gain-stage-up";
      line.textContent = `${t2(`learning.up.${ladder3}`)} ${t2("learning.pearls", { n: pearls })}`;
      return line;
    }));
  }
  const ups = reward.cardLevelUps ?? [];
  if (ups.length > 0) {
    ref.cardUps.hidden = false;
    ref.cardUps.replaceChildren(...ups.map(({ cardId }) => {
      const line = document.createElement("span");
      line.className = "gain-card-up";
      line.innerHTML = ICON.star;
      line.append(t2("reward.cardLevelUp", { name: t2(`cards.${cardId}.name`).replaceAll("\xAD", "") }));
      return line;
    }));
  }
  root.querySelector(".reward-ask").textContent = t2("reward.pick");
  let picked = false;
  const pick = (cardId) => {
    if (picked) return;
    picked = true;
    root.querySelectorAll("button").forEach((b) => {
      b.disabled = true;
    });
    onPick(cardId);
  };
  ref.cards.replaceChildren(...reward.cards.map((cardId, i) => {
    const b = renderCard({ uid: `r${i}`, cardId, level: levels[cardId] ?? 1 }, config.cards[cardId], { t: t2, why: null });
    b.addEventListener("click", () => pick(cardId));
    return b;
  }));
  ref.skip.textContent = t2("reward.none");
  ref.skip.addEventListener("click", () => pick(null));
  if (reward.practice.length > 0) {
    ref.practice.hidden = false;
    root.querySelector(".reward-practice-title").textContent = t2("reward.practice");
    ref.practiceList.replaceChildren(...reward.practice.map((text2, i) => {
      const li = document.createElement("li");
      li.textContent = text2;
      const way = wayText(t2, (reward.practiceWays ?? [])[i]);
      if (way) {
        const small = document.createElement("span");
        small.className = "practice-way";
        small.textContent = way;
        li.append(small);
      }
      return li;
    }));
  }
  if (reward.lightningHits > 0) {
    ref.lightning.hidden = false;
    ref.lightning.innerHTML = `${ICON.bolt}<span></span>`;
    ref.lightning.lastChild.textContent = t2("reward.lightning", { n: reward.lightningHits });
  }
}

// src/ui/screens/shop.js
function mountShop(root, { t: t2, config, game, onCommand, onLeave }) {
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
  const ref = Object.fromEntries([...root.querySelectorAll("[data-ref]")].map((el2) => [el2.dataset.ref, el2]));
  addWorld(root.querySelector(".screen"), `area.${game.view().run?.areaId ?? config.areas.order[0]}`);
  ref.title.textContent = t2("shop.title");
  ref.buyTitle.textContent = t2("shop.buyTitle");
  ref.removeTitle.textContent = t2("shop.removeTitle");
  ref.itemTitle.textContent = t2("shop.itemTitle");
  ref.leave.textContent = t2("shop.leave");
  let busy = false;
  let choosing = false;
  const keeper = renderAsset("place.merchant", "");
  const keeperHappy = renderAsset("place.merchant.happy", "");
  keeperHappy.hidden = true;
  ref.keeper.append(keeper, keeperHappy);
  let happyTimer = null;
  const cheer = () => {
    keeper.hidden = true;
    keeperHappy.hidden = false;
    clearTimeout(happyTimer);
    happyTimer = setTimeout(() => {
      keeper.hidden = false;
      keeperHappy.hidden = true;
    }, 1600);
  };
  const say = (text2) => {
    ref.msg.textContent = text2 || t2("shop.hello");
  };
  say("");
  const cardName = (id) => t2(`cards.${id}.name`).replaceAll("\xAD", "");
  function send(command, onOk) {
    if (busy) return;
    busy = true;
    const events = onCommand(command);
    const no = events.find((e) => e.type === "rejected");
    if (no) say(t2(`reject.${no.reason}`, { n: config.rewards.minDeckSize }));
    else onOk(events);
    busy = false;
    render();
  }
  function offerItem(item, pearls) {
    const box = document.createElement("div");
    box.className = "shop-item";
    const card = renderCard({ uid: `s-${item.cardId}`, cardId: item.cardId, level: game.view().cardLevels[item.cardId] ?? 1 }, config.cards[item.cardId], { t: t2, why: null });
    card.disabled = true;
    card.classList.add("is-display");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-quiet shop-buy";
    if (item.soldOut) {
      b.disabled = true;
      b.innerHTML = `${ICON.check}<span></span>`;
      b.lastChild.textContent = t2("shop.soldOut");
    } else {
      b.disabled = pearls < item.price;
      b.innerHTML = `<span></span>${ICON.pearl}<span></span>`;
      b.firstChild.textContent = t2("shop.buy");
      b.lastChild.textContent = String(item.price);
      b.setAttribute("aria-label", `${cardName(item.cardId)}: ${t2("shop.buy")}, ${t2("shop.price", { n: item.price })}`);
      if (b.disabled) b.title = t2("shop.tooExpensive");
      b.addEventListener("click", () => send({ type: "buyCard", cardId: item.cardId }, () => {
        cheer();
        say(t2("shop.bought", { name: cardName(item.cardId) }));
      }));
    }
    box.append(card, b);
    return box;
  }
  function removeArea(shop, profile) {
    if (shop.removed) {
      const p = document.createElement("p");
      p.className = "shop-note";
      p.textContent = t2("shop.removeDone");
      return [p];
    }
    if (!choosing) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-quiet shop-remove-open";
      b.textContent = t2("shop.removeOpen", { n: shop.removePrice });
      b.disabled = profile.perlen < shop.removePrice;
      b.addEventListener("click", () => {
        choosing = true;
        say("");
        render();
      });
      return [b];
    }
    const ask = document.createElement("p");
    ask.className = "shop-note";
    ask.textContent = t2("shop.removeAsk");
    const list = document.createElement("div");
    list.className = "shop-deck";
    list.append(...profile.deck.map(({ cardId, n }) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-quiet shop-deck-card";
      b.innerHTML = '<span class="shop-deck-n"></span><span></span>';
      b.firstChild.textContent = t2("shop.cardCount", { n });
      b.lastChild.textContent = t2(`cards.${cardId}.name`);
      b.addEventListener("click", () => send({ type: "removeCard", cardId }, () => {
        choosing = false;
        say(t2("shop.removed", { name: cardName(cardId) }));
      }));
      return b;
    }));
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-quiet";
    cancel.textContent = t2("shop.removeCancel");
    cancel.addEventListener("click", () => {
      choosing = false;
      say("");
      render();
    });
    return [ask, list, cancel];
  }
  function render() {
    const v = game.view();
    if (!v.shop) return;
    const pearls = v.profile.perlen;
    ref.pearls.innerHTML = `${ICON.pearl}<span></span>`;
    ref.pearls.lastChild.textContent = String(pearls);
    ref.pearls.setAttribute("aria-label", t2("hud.pearls", { n: pearls }));
    ref.offer.replaceChildren(...v.shop.cards.map((item) => offerItem(item, pearls)));
    const it = v.shop.item;
    ref.itemTitle.hidden = !it;
    ref.gear.hidden = !it;
    if (it) {
      ref.gear.innerHTML = '<span class="item-pic"></span><span class="shop-gear-text"><b></b><small></small></span><button class="btn btn-quiet shop-buy" type="button"></button>';
      ref.gear.querySelector(".item-pic").append(renderAsset(`item.${it.itemId}`, ""));
      ref.gear.querySelector("b").textContent = `${t2(`items.${it.itemId}.name`)} (${t2(`slots.${config.items[it.itemId].slot}`)})`;
      ref.gear.querySelector("small").textContent = t2(`items.${it.itemId}.eff`);
      const b = ref.gear.querySelector("button");
      if (it.soldOut) {
        b.disabled = true;
        b.innerHTML = `${ICON.check}<span></span>`;
        b.lastChild.textContent = t2("shop.soldOut");
      } else {
        b.innerHTML = `<span></span>${ICON.pearl}<span></span>`;
        b.firstChild.textContent = t2("shop.buy");
        b.lastChild.textContent = String(it.price);
        b.disabled = pearls < it.price;
        b.addEventListener("click", () => send({ type: "buyItem" }, () => {
          cheer();
          say(t2("gear.found", { name: t2(`items.${it.itemId}.name`) }));
        }));
      }
    }
    ref.remove.replaceChildren(...removeArea(v.shop, v.profile));
  }
  ref.leave.addEventListener("click", () => {
    if (busy) return;
    busy = true;
    ref.leave.disabled = true;
    onLeave();
  });
  render();
  return { destroy() {
  } };
}

// src/ui/screens/event.js
function mountEvent(root, { t: t2, game, onChoose }) {
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
  const ref = Object.fromEntries([...root.querySelectorAll("[data-ref]")].map((el2) => [el2.dataset.ref, el2]));
  root.querySelector(".event-scene").prepend(worldLayer(`area.${v.run?.areaId ?? "reef"}`, "scene-bg"));
  ref.word.textContent = t2("events.title");
  ref.text.textContent = t2(`events.${ev.eventId}.text`);
  let busy = false;
  ref.btns.replaceChildren(...ev.options.map((o, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = i === 0 ? "btn btn-go event-btn" : "btn event-btn";
    b.innerHTML = '<span class="event-btn-label"></span>';
    b.firstChild.textContent = t2(`events.${ev.eventId}.${o.id}`);
    if (o.cost > 0) {
      const small = document.createElement("small");
      small.className = "event-cost";
      small.innerHTML = `${ICON.pearl}<span></span>`;
      small.lastChild.textContent = o.available ? t2("events.cost", { n: o.cost }) : t2("events.noPearls");
      b.append(small);
    }
    b.disabled = !o.available;
    b.addEventListener("click", () => {
      if (busy) return;
      busy = true;
      onChoose(o.id);
    });
    return b;
  }));
  ref.btns.querySelector(".btn:not(:disabled)")?.focus({ preventScroll: true });
}

// src/ui/screens/riddle.js
var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var toNumber = (s) => Number(String(s).replace(/[^\d-]/g, ""));
function sequenceWay(t2, r) {
  const all = [...r.shown, toNumber(r.step.choices[r.step.correctIndex])];
  const steps = all.slice(1).map((n, i) => n - all[i]);
  const sign = (d) => `${d < 0 ? "\u2212" : "+"}${formatNumber(Math.abs(d))}`;
  if (steps.every((d) => d === steps[0])) return t2("riddle.seqSame", { d: sign(steps[0]) });
  return steps.map(sign).join(", ");
}
function mountRiddle(root, { t: t2, game, onAnswer, onLeave }) {
  root.innerHTML = `
  <main class="screen riddle-screen">
    <section class="comic-page">
      <div class="panel comic-big riddle-scene">
        <p class="banner-word riddle-word" data-ref="word"></p>
        <div class="riddle-chest" data-ref="chest"></div>
        <div class="riddle-lock" data-ref="lock" role="img"></div>
      </div>
      <div class="panel riddle-body">
        <p class="riddle-text" data-ref="text" aria-live="polite"></p>
        <div class="riddle-task" data-ref="task"></div>
      </div>
    </section>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll("[data-ref]")].map((el2) => [el2.dataset.ref, el2]));
  const screen = root.querySelector(".riddle-screen");
  const v0 = game.view();
  root.querySelector(".riddle-scene").prepend(worldLayer(`area.${v0.run?.areaId ?? "temple"}`, "scene-bg"));
  ref.word.textContent = t2("riddle.word");
  ref.chest.append(renderAsset("riddle.chest", t2("riddle.chestAlt")));
  let busy = false;
  let lastStep = v0.riddle?.stepIndex ?? 0;
  const panel = createTaskPanel(ref.task, {
    t: t2,
    onAnswer: (k) => {
      if (busy) return;
      busy = true;
      const events = onAnswer(k);
      busy = false;
      if (events.some((e) => e.type === "riddleSolved")) return;
      draw3(events.find((e) => e.type === "riddleMistake") ?? null);
    },
    onNext: () => onLeave()
  });
  panel.timerRoot.hidden = true;
  function asTask(r) {
    const wall = r.format === "wall";
    return {
      format: r.format,
      stepFormat: r.format,
      prompt: r.step.prompt,
      display: r.step.display ?? (wall ? null : r.shown?.join(", ") + ", ?"),
      choices: r.step.choices,
      correctIndex: r.step.correctIndex,
      wall: r.wall,
      stepIndex: r.stepIndex,
      steps: wall ? Array.from({ length: r.steps }) : null,
      freeMistakes: r.freeMistakes,
      freeLeft: r.freeLeft,
      wrongChoices: r.wrongChoices,
      noTempo: true,
      solveAll: true
      // beim Scheitern die ganze Mauer zeigen
    };
  }
  function drawLock(r, fresh) {
    const failed = r.result === "failed";
    ref.lock.replaceChildren(...Array.from({ length: r.steps }, (_, i) => {
      const w = document.createElement("i");
      w.className = "riddle-wheel";
      if (i < r.stepIndex) {
        w.classList.add("is-open");
        w.innerHTML = CHECK;
      } else if (i === r.stepIndex && !failed) w.classList.add("is-now");
      if (i === fresh) w.classList.add("is-fresh");
      return w;
    }));
    ref.lock.setAttribute("aria-label", t2("riddle.lockLabel", { n: r.stepIndex, of: r.steps }));
  }
  function draw3(mistake) {
    const r = game.view().riddle;
    if (!r) return;
    const advanced = r.stepIndex > lastStep;
    drawLock(r, advanced ? r.stepIndex - 1 : -1);
    lastStep = r.stepIndex;
    if (r.result === "failed") {
      screen.classList.toggle("is-failed", r.format === "wall");
      const praise = r.stepIndex > 0 ? `${t2(r.stepIndex === 1 ? "riddle.partialOne" : "riddle.partial", { n: r.stepIndex })} ` : "";
      ref.text.textContent = `${praise}${t2("riddle.failed")}`;
      panel.open(asTask(r));
      const way = r.format === "wall" ? wayText(t2, r.way) : sequenceWay(t2, r);
      panel.showSolution(t2("ask.solution"), r.solutionText, way);
      return;
    }
    const free = r.format === "wall" ? "" : ` ${t2(r.freeLeft === 0 ? "ask.freeNone" : r.freeLeft === 1 ? "ask.freeMistake" : "ask.freeMistakes", { n: r.freeLeft })}`;
    if (mistake) ref.text.textContent = `${hintAsk(t2, mistake.mistake, "riddle.tryAgain")}${free}`;
    else ref.text.textContent = t2(advanced ? "riddle.stepRight" : "riddle.text");
    panel.open(asTask(r));
  }
  draw3(null);
  return { destroy: () => panel.destroy() };
}

// src/ui/screens/map.js
var ROOM_ICON = { combat: ICON.attack, rest: ICON.rest, boss: ICON.boss, treasure: ICON.treasure, shop: ICON.shop, elite: ICON.star, event: ICON.dice, riddle: ICON.riddle };
var SVG_NS = "http://www.w3.org/2000/svg";
function mountMap(root, { t: t2, config, game, onEnter, onSurface, onExplain, onBeforeEnter = () => {
} }) {
  root.innerHTML = `
  <main class="screen sea">
    <header class="sea-bar">
      <h1 class="sea-title" data-ref="title"></h1>
      <div class="sea-hud" data-ref="hud"></div>
      <button class="btn btn-quiet sea-surface" type="button" data-ref="surface"></button>
    </header>
    <section class="sea-map" data-ref="map">
      <svg class="sea-paths" data-ref="paths" aria-hidden="true"></svg>
      <div class="sea-layers" data-ref="layers"></div>
      <p class="sea-toast" data-ref="toast" role="status" hidden></p>
      <div class="sea-intro" data-ref="intro" role="dialog" aria-modal="true" hidden>
        <p class="sea-intro-text" data-ref="introText"></p>
        <button class="btn btn-go" type="button" data-ref="introOk"></button>
      </div>
    </section>
    <p class="sea-pick" data-ref="pick"></p>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll("[data-ref]")].map((el2) => [el2.dataset.ref, el2]));
  let busy = false;
  ref.surface.textContent = t2("btn.surface");
  ref.surface.addEventListener("click", () => {
    if (!busy) {
      busy = true;
      onSurface();
    }
  });
  ref.pick.textContent = t2("map.pick");
  function roomButton(room) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `room room-${room.type}${room.done ? " is-done" : ""}${room.reachable ? " is-open" : ""}`;
    b.dataset.id = room.id;
    b.disabled = !room.reachable;
    const state = room.done ? t2("map.stateDone") : room.reachable ? t2("map.stateOpen") : t2("map.stateLater");
    const enemyNames = (room.enemies ?? []).map((id) => t2(`enemies.${id}.name`));
    const uniqueNames = [...new Set(enemyNames)];
    b.setAttribute("aria-label", [t2("map.roomLabel", { type: t2(`map.room.${room.type}`), state }), ...uniqueNames].join(", "));
    const head = document.createElement("span");
    head.className = "room-head";
    head.innerHTML = `<span class="room-icon">${ROOM_ICON[room.type]}</span><span class="room-name"></span>`;
    head.lastChild.textContent = room.type === "boss" ? t2(`enemies.${room.enemies.at(-1)}.name`) : t2(`map.room.${room.type}`);
    b.append(head);
    if (room.type === "combat" || room.type === "boss") {
      const foes = document.createElement("span");
      foes.className = "room-foes";
      for (const id of room.type === "boss" ? room.enemies.slice(-1) : room.enemies) {
        const f = document.createElement("span");
        f.className = "room-foe";
        f.append(renderAsset(`enemy.${id}`, t2(`enemies.${id}.name`)));
        foes.append(f);
      }
      b.append(foes);
    }
    if (room.done) {
      const mark = document.createElement("span");
      mark.className = "room-check";
      mark.innerHTML = ICON.check;
      b.append(mark);
    }
    b.addEventListener("click", () => enter2(room.id));
    return b;
  }
  function drawPaths(view) {
    const box = ref.map.getBoundingClientRect();
    const svg = ref.paths;
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    svg.replaceChildren();
    const centre = (id) => {
      const el2 = ref.layers.querySelector(`[data-id="${id}"]`);
      const r = el2.getBoundingClientRect();
      return {
        x: r.left - box.left + r.width / 2,
        y: r.top - box.top + r.height / 2,
        top: r.top - box.top,
        bottom: r.bottom - box.top,
        left: r.left - box.left,
        right: r.right - box.left
      };
    };
    for (const room of view.rooms) {
      for (const next of room.next) {
        const a = centre(room.id);
        const b = centre(next);
        const line = document.createElementNS(SVG_NS, "path");
        const sideways = b.left >= a.right;
        const midX = (a.right + b.left) / 2;
        const midY = (a.bottom + b.top) / 2;
        line.setAttribute("d", sideways ? `M${a.right} ${a.y} C${midX} ${a.y} ${midX} ${b.y} ${b.left} ${b.y}` : `M${a.x} ${a.bottom} C${a.x} ${midY} ${b.x} ${midY} ${b.x} ${b.top}`);
        const walked = room.done && (view.rooms.find((r) => r.id === next)?.done || view.reachable.includes(next));
        line.setAttribute("class", walked ? "path is-walked" : "path");
        svg.append(line);
      }
    }
  }
  function render() {
    const v = game.view();
    const view = v.map;
    const h = v.hero;
    ref.title.textContent = `${t2(`areas.${view.areaId}.name`)} \xB7 ${t2("base.depth", { n: view.depth ?? 1 })}`;
    ref.hud.innerHTML = `
      <span class="chip" aria-label="${t2("hud.hp", { n: h.hp, max: h.maxHp })}">${ICON.heart}<span>${h.hp}/${h.maxHp}</span></span>
      <span class="chip">${t2("hud.level", { n: h.stufe })}</span>
      <span class="chip" aria-label="${t2("hud.pearls", { n: h.perlen })}">${ICON.pearl}<span>${h.perlen}</span></span>`;
    const layers = [];
    for (const room of view.rooms) (layers[room.layer] ??= []).push(room);
    ref.layers.replaceChildren(...layers.map((rooms) => {
      const row = document.createElement("div");
      row.className = "sea-layer";
      row.append(...rooms.map(roomButton));
      return row;
    }));
    requestAnimationFrame(() => drawPaths(view));
  }
  let toastTimer = null;
  function enter2(roomId) {
    if (busy) return;
    busy = true;
    onBeforeEnter();
    const events = game.dispatch({ type: "enterRoom", roomId });
    const rest = events.find((e) => e.type === "restUsed");
    if (rest) {
      onEnter(events, { stay: true });
      ref.toast.textContent = rest.healed > 0 ? t2("map.restHealed", { n: rest.healed }) : t2("map.restFull");
      ref.toast.hidden = false;
      render();
      busy = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        ref.toast.hidden = true;
      }, 1600);
      return;
    }
    onEnter(events, { stay: false });
  }
  const v0 = game.view();
  const areaCfg = config?.areas.areas[v0.map.areaId];
  const introKey = v0.profile?.klasse === 4 && areaCfg?.intro4 || areaCfg?.intro;
  if (introKey && !v0.explained[`area.${v0.map.areaId}`]) {
    ref.introText.textContent = t2(introKey);
    ref.introOk.textContent = t2("areas.introOk");
    ref.intro.hidden = false;
    ref.layers.inert = true;
    ref.introOk.addEventListener("click", () => {
      ref.intro.hidden = true;
      ref.layers.inert = false;
      onExplain?.(`area.${v0.map.areaId}`);
    }, { once: true });
    ref.introOk.focus({ preventScroll: true });
  }
  const onResize = () => {
    const v = game.view();
    if (v.map) drawPaths(v.map);
  };
  window.addEventListener("resize", onResize);
  render();
  return { destroy() {
    clearTimeout(toastTimer);
    window.removeEventListener("resize", onResize);
  } };
}
function mountAreaCleared(root, { t: t2, config, cleared, profile, onDone }) {
  root.innerHTML = `
  <main class="screen cleared">
    <section class="comic-page">
      <div class="panel comic-big">
        <div class="comic-hero" data-ref="hero"></div>
        <div class="comic-boss" data-ref="boss"></div>
        <p class="banner-word cleared-word" data-ref="word"></p>
      </div>
      <div class="comic-row">
        <div class="panel comic-say"><p class="cleared-text" data-ref="text"></p></div>
        <div class="panel comic-next" data-ref="nextPanel">
          <p class="cleared-next" data-ref="next" hidden></p>
          <button class="btn btn-go" type="button" data-ref="done"></button>
        </div>
      </div>
    </section>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll("[data-ref]")].map((el2) => [el2.dataset.ref, el2]));
  const big = root.querySelector(".comic-big");
  big.prepend(worldLayer(`area.${cleared.areaId}`, "scene-bg"));
  const pick = (key, fallback) => assetUrl(key) ? key : fallback;
  if (profile) ref.hero.append(renderAsset(pick(`${profile.asset}.win`, profile.asset), profile.name));
  const boss = bossOfArea(config, cleared.areaId);
  if (boss) {
    ref.boss.append(renderAsset(pick(`enemy.${boss}.hit`, `enemy.${boss}`), t2(`enemies.${boss}.name`)));
    const dizzy = document.createElement("span");
    dizzy.className = "comic-dizzy";
    dizzy.setAttribute("aria-hidden", "true");
    dizzy.innerHTML = ICON.star.repeat(3);
    ref.boss.append(dizzy);
  }
  ref.word.textContent = t2("cleared.word");
  ref.text.textContent = t2(`areas.${cleared.areaId}.bossDefeated`);
  const unlocked = cleared.unlocked ?? [];
  ref.next.hidden = false;
  ref.next.innerHTML = `<span class="cleared-star">${cleared.star ? ICON.star : ""}<span></span></span>`;
  ref.next.querySelector(".cleared-star > span").textContent = !cleared.star ? t2("cleared.starAgain") : cleared.stars === 1 ? t2("cleared.starFirst") : t2("cleared.star", { n: cleared.stars });
  if (unlocked.length) {
    ref.nextPanel.prepend(worldLayer(`area.${unlocked[0]}`, "scene-bg"));
    const line = document.createElement("span");
    line.textContent = t2("cleared.unlockedOne", { area: unlocked.map((id) => t2(`areas.${id}.name`)).join(", ") });
    ref.next.append(line);
  }
  ref.done.textContent = t2("btn.toBase");
  ref.done.addEventListener("click", () => {
    ref.done.disabled = true;
    onDone();
  }, { once: true });
  ref.done.focus({ preventScroll: true });
}

// src/ui/screens/base.js
function mountBase(root, { t: t2, config, game, onDive, onLogbook, onAckNewCards = null, onAckMission = null, onBuy = null, bought = null, account = null }) {
  const v = game.view();
  const p = v.profile;
  root.innerHTML = `
  <main class="screen base station">
    <section class="panel station-scene" aria-label="${t2("base.title")}">
      <div class="station-decor" data-ref="decor" aria-hidden="true"></div>
      <p class="caption" data-ref="text"></p>
      <div class="station-hero">
        <div class="station-art" data-ref="hero"></div>
        <p class="station-name" data-ref="name"></p>
        <div class="sea-hud" data-ref="hud"></div>
      </div>
      <div class="station-dives" data-ref="dives" role="group"></div>
      <div class="station-tools">
        <button class="spot base-logbook" type="button" data-ref="logbook"></button>
        <button class="spot" type="button" data-ref="gear"></button>
        <button class="spot" type="button" data-ref="build"></button>
      </div>
      <div class="title-who station-who" data-ref="who" hidden>
        <span data-ref="whoName"></span>
        <button class="title-logout" type="button" data-ref="logout"></button>
      </div>
      <div class="station-news" data-ref="news" role="status" hidden>
        <p class="station-news-title" data-ref="newsTitle"></p>
        <div class="station-news-cards" data-ref="newsCards"></div>
        <button class="btn btn-go" type="button" data-ref="newsOk"></button>
      </div>
      <div class="station-build" data-ref="buildPanel" role="dialog" aria-modal="true" aria-labelledby="station-build-title" hidden>
        <div class="station-build-head">
          <h2 class="station-build-title" id="station-build-title" data-ref="buildTitle"></h2>
          <span class="chip station-build-pearls" data-ref="buildPearls"></span>
        </div>
        <p class="station-build-hint" data-ref="buildHint" role="status"></p>
        <ul class="station-build-list" data-ref="buildList"></ul>
        <button class="btn station-build-back" type="button" data-ref="buildBack"></button>
      </div>
      <div class="station-ask" data-ref="ask" role="dialog" aria-modal="true" hidden>
        <div class="station-ask-pic" data-ref="askPic" hidden></div>
        <p class="station-ask-text" data-ref="askText"></p>
        <p class="chip station-ask-sub" data-ref="askSub" hidden></p>
        <div class="station-ask-btns">
          <button class="btn btn-go" type="button" data-ref="askYes"></button>
          <button class="btn" type="button" data-ref="askNo"></button>
        </div>
        <div class="station-depths" data-ref="askDepths" hidden>
          <span class="station-depths-label" data-ref="askDepthsLabel"></span>
          <div class="station-depths-btns" data-ref="askDepthsBtns"></div>
        </div>
      </div>
    </section>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll("[data-ref]")].map((el2) => [el2.dataset.ref, el2]));
  const scene = root.querySelector(".station-scene");
  const bgKey = assetUrl("place.station") ? "place.station" : `area.${homeAreaId(config, p, v.run)}`;
  scene.prepend(worldLayer(bgKey, "scene-bg"));
  ref.hero.append(renderAsset(p.asset, p.name));
  ref.name.textContent = p.name;
  ref.hud.innerHTML = `
    <span class="chip">${t2("hud.level", { n: p.stufe })}</span>
    <span class="chip" aria-label="${t2("hud.pearls", { n: p.perlen })}">${ICON.pearl}<span>${p.perlen}</span></span>
    <span class="chip chip-stars" aria-label="${p.stars === 1 ? t2("base.starsOne") : t2("base.stars", { n: p.stars })}">${ICON.star}<span>${p.stars}</span></span>`;
  const complete = Boolean(bought) && (v.station?.items ?? []).every((x) => x.owned);
  const m = v.mission;
  const missionNews = !bought && m?.geschafft && !m.gemeldet;
  if (complete) ref.text.textContent = t2("station.complete");
  else if (bought) ref.text.textContent = t2("station.bought", { name: t2(`station.items.${bought}.name`) });
  else if (missionNews) ref.text.textContent = t2("mission.done", { n: config.game.mission.reward });
  else if (m?.geschafft) ref.text.textContent = t2("mission.doneLater");
  else if (m) {
    ref.text.classList.add("is-mission");
    const op = m.leiter ? t2(`mission.ops.${m.leiter}`) : "";
    const line = document.createElement("span");
    line.className = "mission-progress";
    const pill = document.createElement("span");
    pill.className = "mission-pill";
    pill.textContent = t2("mission.short", { stand: m.stand, ziel: m.ziel });
    pill.setAttribute("aria-label", t2("mission.progress", { stand: m.stand, ziel: m.ziel }));
    const reward = document.createElement("span");
    reward.className = "mission-reward";
    reward.setAttribute("aria-label", t2("mission.reward", { n: config.game.mission.reward }));
    reward.innerHTML = `<span aria-hidden="true">+${Number(config.game.mission.reward)}</span>${ICON.pearl}`;
    line.append(pill, reward);
    ref.text.replaceChildren(t2(`mission.${m.art}`, { ziel: m.ziel, op }), line);
  } else ref.text.textContent = t2("base.text");
  let busy = false;
  const once = (fn) => () => {
    if (busy) return;
    busy = true;
    fn();
  };
  let onYes = null;
  let askFrom = null;
  function updateInert() {
    const top = !ref.ask.hidden ? ref.ask : !ref.buildPanel.hidden ? ref.buildPanel : null;
    for (const el2 of scene.children) el2.inert = top ? el2 !== top : false;
  }
  function ask(text2, yes, no, fn, { pic = null, sub = null, from = null } = {}) {
    onYes = fn;
    askFrom = from ?? document.activeElement;
    ref.askDepths.hidden = true;
    ref.askPic.replaceChildren(...pic ? [pic] : []);
    ref.askPic.hidden = !pic;
    ref.askSub.hidden = !sub;
    if (sub) {
      ref.askSub.innerHTML = `${ICON.pearl}<span></span>`;
      ref.askSub.lastChild.textContent = sub;
    }
    ref.askText.textContent = text2;
    ref.askYes.textContent = yes;
    ref.askNo.textContent = no;
    ref.ask.hidden = false;
    updateInert();
    ref.askNo.focus({ preventScroll: true });
  }
  const askSwitch = (areaId, name) => ask(
    t2("base.switchAsk", { from: t2(`areas.${v.run.areaId}.name`), to: name }),
    t2("base.switchYes"),
    t2("base.switchNo"),
    () => onDive(areaId, { abandon: true })
  );
  const askDepth = (a, name) => {
    ask(name, t2("base.depthGo", { n: a.maxDepth }), t2("base.depthBack"), () => onDive(a.id, { depth: a.maxDepth }));
    ref.askDepthsLabel.textContent = t2("base.easier");
    ref.askDepthsBtns.replaceChildren(...Array.from({ length: a.maxDepth - 1 }, (_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn station-depth";
      b.textContent = String(i + 1);
      b.setAttribute("aria-label", t2("base.depthGo", { n: i + 1 }));
      b.addEventListener("click", () => {
        if (busy) return;
        busy = true;
        onDive(a.id, { depth: i + 1 });
      });
      return b;
    }));
    ref.askDepths.hidden = false;
  };
  const askResume = (a, name) => {
    ask(name, t2("base.resume"), t2("base.depthBack"), () => onDive(a.id));
    ref.askDepthsLabel.textContent = t2("base.restart");
    ref.askDepthsBtns.replaceChildren(...Array.from({ length: a.maxDepth }, (_, i) => i + 1).filter((n) => n !== v.run.depth).map((n) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn station-depth";
      b.textContent = String(n);
      b.setAttribute("aria-label", t2("base.depthGo", { n }));
      b.addEventListener("click", () => {
        if (busy) return;
        busy = true;
        onDive(a.id, { depth: n, abandon: true });
      });
      return b;
    }));
    ref.askDepths.hidden = false;
  };
  ref.askNo.addEventListener("click", () => {
    ref.ask.hidden = true;
    onYes = null;
    updateInert();
    askFrom?.focus?.({ preventScroll: true });
  });
  ref.askYes.addEventListener("click", () => {
    if (busy || !onYes) return;
    busy = true;
    onYes();
  });
  if (account) {
    ref.who.hidden = false;
    ref.whoName.textContent = t2("login.who", { name: account.name });
    ref.logout.textContent = t2("login.logout");
    ref.logout.addEventListener("click", () => {
      if (busy) return;
      ask(t2("base.logoutAsk", { name: account.name }), t2("login.logout"), t2("base.logoutNo"), () => {
        ref.askYes.disabled = true;
        ref.askNo.disabled = true;
        account.onLogout();
      });
    });
  }
  const shown = p.areas.filter((a) => a.open || !a.comingSoon);
  ref.dives.dataset.n = String(shown.length);
  ref.dives.replaceChildren(...shown.map((a) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "porthole base-dive";
    const name = t2(`areas.${a.id}.name`);
    const win = document.createElement("span");
    win.className = "porthole-window";
    win.append(worldLayer(`area.${a.id}`, "porthole-view"));
    const label = document.createElement("span");
    label.className = "porthole-label";
    if (a.comingSoon) {
      b.disabled = true;
      b.classList.add("is-soon");
      label.textContent = t2("base.soon", { area: name });
    } else if (!a.open) {
      b.disabled = true;
      b.classList.add("is-locked");
      const missing = a.missing === 1 ? t2("base.missingOne") : t2("base.missing", { n: a.missing });
      label.innerHTML = `<span class="porthole-name"></span><span class="porthole-sub">${ICON.star}<span></span></span>`;
      label.querySelector(".porthole-name").textContent = name;
      label.querySelector(".porthole-sub > span").textContent = missing;
      b.setAttribute("aria-label", `${name}: ${missing}`);
    } else {
      const here = v.run?.areaId === a.id;
      label.innerHTML = '<span class="porthole-name"></span><span class="porthole-sub"></span>';
      label.querySelector(".porthole-name").textContent = here ? t2("base.resume") : name;
      label.querySelector(".porthole-sub").textContent = t2("base.depth", { n: here ? v.run.depth : a.maxDepth });
      if (!here) b.setAttribute("aria-label", `${t2("base.diveTo", { area: name })}, ${t2("base.depth", { n: a.maxDepth })}`);
      if (v.run && !here) b.addEventListener("click", () => {
        if (!busy) askSwitch(a.id, name);
      });
      else if (!here && a.depth >= 1) b.addEventListener("click", () => {
        if (!busy) askDepth(a, name);
      });
      else if (here && a.depth >= 1) b.addEventListener("click", () => {
        if (!busy) askResume(a, name);
      });
      else b.addEventListener("click", once(() => onDive(a.id)));
    }
    b.append(win, label);
    return b;
  }));
  if (p.newCards?.length) {
    ref.news.hidden = false;
    ref.newsTitle.textContent = p.newCards.length === 1 ? t2("collection.newOne") : t2("collection.newMany", { n: p.newCards.length });
    ref.newsCards.replaceChildren(...p.newCards.map((cardId, i) => {
      const card = renderCard({ uid: `n${i}`, cardId, level: 1 }, config.cards[cardId], { t: t2, why: null });
      card.disabled = true;
      card.tabIndex = -1;
      return card;
    }));
    ref.newsOk.textContent = t2("collection.newOk");
    ref.newsOk.addEventListener("click", () => {
      onAckNewCards?.();
      ref.news.hidden = true;
    }, { once: true });
  }
  ref.logbook.innerHTML = `<span class="spot-icon">${ICON.book}</span><span class="spot-label"></span>`;
  ref.logbook.querySelector(".spot-label").textContent = t2("base.logbook");
  if (p.freePoints > 0 || p.talentOpen) {
    const badge = document.createElement("span");
    badge.className = "badge spot-badge";
    badge.textContent = p.talentOpen ? t2("base.talentNew") : p.freePoints === 1 ? t2("base.freeOne") : t2("base.freeMany", { n: p.freePoints });
    ref.logbook.append(badge);
  }
  ref.logbook.addEventListener("click", once(() => onLogbook(p.talentOpen ? "talents" : "hero")));
  ref.gear.innerHTML = `<span class="spot-icon">${ICON.helmet}</span><span class="spot-label"></span>`;
  ref.gear.querySelector(".spot-label").textContent = t2("base.gear");
  ref.gear.addEventListener("click", once(() => onLogbook("gear")));
  const pieces = (v.station?.items.filter((x) => x.owned) ?? []).map((it) => {
    const piece = document.createElement("div");
    piece.className = `station-piece${it.id === bought ? " is-new" : ""}`;
    piece.dataset.id = it.id;
    piece.append(renderAsset(`station.${it.id}`, t2(`station.items.${it.id}.name`)));
    ref.decor.append(piece);
    return piece;
  });
  const portraitQuery = matchMedia("(orientation: portrait)");
  const place = () => {
    for (const piece of pieces) {
      const cfg = config.station[piece.dataset.id];
      const slot = portraitQuery.matches && cfg.slotPortrait || cfg.slot;
      piece.style.left = `${slot.x * 100}%`;
      piece.style.top = `${slot.y * 100}%`;
      piece.style.width = `${slot.w * 100}%`;
    }
  };
  place();
  if (pieces.length) portraitQuery.addEventListener("change", place);
  if (bought && config.station[bought]) {
    const piece = pieces.find((x) => x.dataset.id === bought);
    if (piece) {
      const word = document.createElement("span");
      word.className = "station-boom";
      word.setAttribute("aria-hidden", "true");
      word.textContent = complete ? t2("station.done") : t2("station.built");
      if (complete) word.classList.add("is-complete");
      word.style.left = piece.style.left;
      word.style.top = piece.style.top;
      word.style.width = piece.style.width;
      scene.append(word);
      word.addEventListener("animationend", () => word.remove());
    }
    const num = ref.hud.querySelector(".chip:nth-child(2) > span");
    const from = p.perlen + config.station[bought].price;
    if (num && !isCalm()) {
      const ms = 700;
      num.textContent = String(from);
      setTimeout(() => {
        const start = performance.now();
        const tick = (now) => {
          const k = Math.min(1, (now - start) / ms);
          num.textContent = String(Math.round(from - (from - p.perlen) * (1 - (1 - k) ** 3)));
          if (k < 1 && num.isConnected) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, 300);
    }
  }
  if (missionNews) {
    const word = document.createElement("span");
    word.className = "station-boom is-mission";
    word.setAttribute("aria-hidden", "true");
    word.textContent = t2("mission.doneWord");
    scene.append(word);
    word.addEventListener("animationend", () => word.remove());
    onAckMission?.();
  }
  ref.build.innerHTML = `<span class="spot-icon">${ICON.build}</span><span class="spot-label"></span>`;
  ref.build.querySelector(".spot-label").textContent = t2("station.button");
  if (v.station?.items.some((x) => x.affordable)) {
    const badge = document.createElement("span");
    badge.className = "badge spot-badge";
    badge.textContent = t2("station.badge");
    ref.build.append(badge);
  }
  ref.buildTitle.textContent = t2("station.title");
  ref.buildPearls.innerHTML = `${ICON.pearl}<span></span>`;
  ref.buildPearls.lastChild.textContent = t2("station.have", { n: p.perlen });
  ref.buildBack.textContent = t2("station.back");
  ref.buildList.replaceChildren(...(v.station?.items ?? []).map((it) => {
    const li = document.createElement("li");
    li.className = `station-item${it.owned ? " is-owned" : ""}`;
    const name = t2(`station.items.${it.id}.name`);
    const pic = document.createElement("div");
    pic.className = "station-item-pic";
    pic.append(renderAsset(`station.${it.id}`, name));
    const title = document.createElement("p");
    title.className = "station-item-name";
    title.textContent = name;
    li.append(pic, title);
    if (it.effect) {
      const [key, n] = Object.entries(it.effect)[0];
      const fx = document.createElement("p");
      fx.className = "station-item-effect";
      fx.textContent = t2(`station.effect.${key}`, { n });
      li.append(fx);
    }
    if (it.owned) {
      const done = document.createElement("p");
      done.className = "station-item-owned";
      done.innerHTML = ICON.check;
      done.append(t2("station.owned"));
      li.append(done);
    } else {
      const buy = document.createElement("button");
      buy.type = "button";
      buy.className = `btn station-item-buy${it.affordable ? " btn-go" : " is-short"}`;
      buy.innerHTML = `<span class="station-item-buy-word"></span>${ICON.pearl}<span></span>`;
      buy.firstChild.textContent = t2("station.buy");
      buy.lastChild.textContent = String(it.price);
      const missing = it.price - p.perlen;
      if (it.affordable) {
        buy.setAttribute("aria-label", t2("station.buyLabel", { name, price: it.price }));
        buy.addEventListener("click", () => {
          if (busy) return;
          const pic2 = renderAsset(`station.${it.id}`, name);
          ask(t2("station.ask", { name }), t2("station.yes"), t2("station.no"), () => onBuy?.(it.id), {
            pic: pic2,
            sub: t2("station.after", { n: p.perlen - it.price }),
            from: buy
          });
        });
      } else {
        buy.setAttribute("aria-disabled", "true");
        buy.setAttribute("aria-label", t2("station.shortLabel", { name, price: it.price, n: missing }));
        const short = document.createElement("p");
        short.className = "station-item-short";
        short.hidden = true;
        short.textContent = missing === 1 ? t2("station.tileShortOne") : t2("station.tileShort", { n: missing });
        li.append(short);
        buy.addEventListener("click", () => {
          if (busy) return;
          for (const other of ref.buildList.querySelectorAll(".station-item-short")) other.hidden = other !== short;
          ref.buildHint.textContent = missing === 1 ? t2("station.shortOne", { name }) : t2("station.short", { name, n: missing });
        });
      }
      li.append(buy);
    }
    return li;
  }));
  ref.build.addEventListener("click", () => {
    if (busy) return;
    ref.buildHint.textContent = "";
    for (const el2 of ref.buildList.querySelectorAll(".station-item-short")) el2.hidden = true;
    ref.buildPanel.hidden = false;
    updateInert();
    ref.buildBack.focus({ preventScroll: true });
  });
  ref.buildBack.addEventListener("click", () => {
    ref.buildPanel.hidden = true;
    updateInert();
    ref.build.focus({ preventScroll: true });
  });
  const onKey = (e) => {
    if (e.key !== "Escape" || busy) return;
    if (!ref.ask.hidden) {
      e.preventDefault();
      ref.askNo.click();
    } else if (!ref.buildPanel.hidden) {
      e.preventDefault();
      ref.buildBack.click();
    }
  };
  document.addEventListener("keydown", onKey);
  root.querySelector(".porthole:not(:disabled)")?.focus({ preventScroll: true });
  return {
    destroy() {
      document.removeEventListener("keydown", onKey);
      portraitQuery.removeEventListener("change", place);
    }
  };
}

// src/ui/screens/title.js
function mountTitle(root, { t: t2, hasSave, onStart, onAdult, account = null }) {
  root.innerHTML = `
  <main class="screen title-screen">
    <div class="title-bg" data-ref="bg"></div>
    <section class="title-box">
      <h1 class="title-word"></h1>
      <button class="btn btn-go title-go" type="button"></button>
    </section>
    <div class="title-who" data-ref="who" hidden>
      <span data-ref="name"></span>
      <button class="title-logout" type="button" data-ref="logout"></button>
      <span class="title-net" data-ref="net" role="status" hidden></span>
    </div>
    <button class="title-adult" type="button"></button>
  </main>`;
  const hasArt = Boolean(assetUrl("place.title"));
  root.querySelector("[data-ref=bg]").append(renderAsset(hasArt ? "place.title" : "area.reef", ""));
  root.querySelector(".title-screen").classList.toggle("has-art", hasArt);
  root.querySelector(".title-word").textContent = t2("title.name");
  const go = root.querySelector(".title-go");
  go.textContent = hasSave ? t2("title.continue") : t2("title.start");
  go.addEventListener("click", () => {
    go.disabled = true;
    onStart();
  }, { once: true });
  go.focus({ preventScroll: true });
  const adult = root.querySelector(".title-adult");
  adult.textContent = t2("adult.open");
  adult.addEventListener("click", () => onAdult(), { once: true });
  let stop = null;
  if (account) {
    const who = root.querySelector("[data-ref=who]");
    who.hidden = false;
    root.querySelector("[data-ref=name]").textContent = t2("login.who", { name: account.name });
    const out = root.querySelector("[data-ref=logout]");
    out.textContent = t2("login.logout");
    out.addEventListener("click", () => {
      out.disabled = true;
      go.disabled = true;
      account.onLogout();
    }, { once: true });
    const net = root.querySelector("[data-ref=net]");
    stop = account.onNet((text2) => {
      net.textContent = text2;
      net.hidden = !text2;
    });
  }
  return { destroy: () => stop?.() };
}

// src/ui/screens/login.js
function mountLogin(root, { t: t2, hint = "", busy = false, onSubmit }) {
  root.innerHTML = `
  <main class="screen title-screen login-screen">
    <div class="title-bg" data-ref="bg"></div>
    <section class="title-box">
      <h1 class="title-word"></h1>
      <form class="login-box" novalidate>
        <label class="login-label" for="login-code"></label>
        <input class="login-code" id="login-code" name="code" type="text" inputmode="text"
          autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="12"
          aria-describedby="login-hint login-info">
        <p class="login-hint" id="login-hint" aria-live="polite"></p>
        <button class="btn btn-go login-go" type="submit"></button>
        <p class="login-info" id="login-info"></p>
      </form>
    </section>
    <a class="title-adult login-privacy" href="datenschutz.html"></a>
  </main>`;
  root.querySelector("[data-ref=bg]").append(renderAsset("area.reef", ""));
  root.querySelector(".title-word").textContent = t2("title.name");
  root.querySelector(".login-label").textContent = t2("login.ask");
  root.querySelector(".login-info").textContent = t2("login.info");
  root.querySelector(".login-privacy").textContent = t2("login.privacy");
  const form = root.querySelector(".login-box");
  const input = root.querySelector(".login-code");
  const hintEl = root.querySelector(".login-hint");
  const go = root.querySelector(".login-go");
  go.textContent = t2("login.go");
  function ready(text2 = "") {
    hintEl.textContent = text2;
    go.disabled = false;
    input.disabled = false;
    input.focus({ preventScroll: true });
  }
  function wait2() {
    hintEl.textContent = t2("login.wait");
    go.disabled = true;
    input.disabled = true;
  }
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (go.disabled) return;
    wait2();
    onSubmit(input.value);
  });
  if (busy) wait2();
  else ready(hint);
  return { fail: (text2) => ready(text2), ready };
}

// src/ui/screens/stop.js
function mountStop(root, { t: t2, kind, onReload, onLogout = null }) {
  root.innerHTML = `
  <main class="screen title-screen login-screen stop-screen">
    <div class="title-bg" data-ref="bg"></div>
    <section class="title-box">
      <h1 class="title-word"></h1>
      <div class="login-box stop-box" role="alert">
        <h2 class="stop-title"></h2>
        <p class="stop-text"></p>
        <button class="btn btn-go stop-reload" type="button"></button>
        <button class="btn stop-logout" type="button" hidden></button>
      </div>
    </section>
  </main>`;
  root.querySelector("[data-ref=bg]").append(renderAsset("area.reef", ""));
  root.querySelector(".title-word").textContent = t2("title.name");
  root.querySelector(".stop-title").textContent = t2(kind === "newer" ? "save.newerTitle" : "save.corruptTitle");
  root.querySelector(".stop-text").textContent = t2(kind === "newer" ? "save.newerText" : "save.corruptText");
  const reload = root.querySelector(".stop-reload");
  reload.textContent = t2("save.reload");
  let busy = false;
  reload.addEventListener("click", () => {
    if (busy) return;
    busy = true;
    onReload();
  });
  const logout = root.querySelector(".stop-logout");
  if (onLogout) {
    logout.hidden = false;
    logout.textContent = t2("login.logout");
    logout.addEventListener("click", () => {
      if (busy) return;
      busy = true;
      onLogout();
    });
  }
  reload.focus({ preventScroll: true });
  return {};
}

// src/ui/screens/grade.js
function mountGrade(root, { t: t2, config, onChoose }) {
  root.innerHTML = `
  <main class="screen grade-screen">
    <section class="panel menu-panel">
      <h1 class="menu-title"></h1>
      <div class="grade-choices">
        <button class="grade-choice" type="button" data-grade="3"></button>
        <button class="grade-choice" type="button" data-grade="4"></button>
      </div>
    </section>
  </main>`;
  if (config) addWorld(root.querySelector(".screen"), `area.${config.areas.order[0]}`);
  root.querySelector(".menu-title").textContent = t2("grade.ask");
  for (const b of root.querySelectorAll(".grade-choice")) {
    b.textContent = t2(`grade.k${b.dataset.grade}`);
    b.addEventListener("click", () => {
      root.querySelectorAll(".grade-choice").forEach((x) => {
        x.disabled = true;
      });
      onChoose(Number(b.dataset.grade));
    }, { once: true });
  }
}

// src/ui/screens/hero-create.js
function mountHeroCreate(root, { t: t2, config, onDone, initial = null, onCancel = null, areaId = null }) {
  const figures = Object.keys(config.heroes.figures);
  const { nameA, nameB } = config.heroes;
  let figure = initial?.figur ?? figures[0];
  let a = initial?.nameA ?? 0;
  let b = initial?.nameB ?? 0;
  root.innerHTML = `
  <main class="screen hero-screen">
    <section class="panel menu-panel hero-panel">
      <h1 class="menu-title" data-ref="title"></h1>
      <div class="figures" data-ref="figures"></div>
      <p class="name-label" data-ref="nameLabel"></p>
      <div class="name-row">
        <div class="name-part"><span class="name-word" data-ref="wordA"></span><button class="btn btn-quiet name-other" type="button" data-ref="otherA"></button></div>
        <div class="name-part"><span class="name-word" data-ref="wordB"></span><button class="btn btn-quiet name-other" type="button" data-ref="otherB"></button></div>
        <button class="btn btn-quiet name-dice" type="button" data-ref="dice"></button>
      </div>
      <div class="hero-actions">
        <button class="btn" type="button" data-ref="cancel" hidden></button>
        <button class="btn btn-go" type="button" data-ref="done"></button>
      </div>
    </section>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll("[data-ref]")].map((el2) => [el2.dataset.ref, el2]));
  addWorld(root.querySelector(".screen"), `area.${areaId ?? config.areas.order[0]}`);
  ref.title.textContent = t2(initial ? "heroCreate.titleEdit" : "heroCreate.title");
  if (onCancel) {
    ref.cancel.hidden = false;
    ref.cancel.textContent = t2("logbook.close");
    ref.cancel.addEventListener("click", () => {
      root.querySelectorAll("button").forEach((x) => {
        x.disabled = true;
      });
      onCancel();
    }, { once: true });
  }
  ref.nameLabel.textContent = t2("heroCreate.name");
  ref.otherA.textContent = t2("heroCreate.other");
  ref.otherB.textContent = t2("heroCreate.other");
  ref.dice.innerHTML = `${ICON.dice}<span></span>`;
  ref.dice.lastChild.textContent = t2("heroCreate.dice");
  ref.done.textContent = t2("heroCreate.done");
  ref.figures.replaceChildren(...figures.map((id) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "figure";
    btn.dataset.id = id;
    const name = t2(`figures.${id}.name`);
    btn.setAttribute("aria-label", t2("heroCreate.figureLabel", { name }));
    const art = document.createElement("span");
    art.className = "figure-art";
    art.append(renderAsset(config.heroes.figures[id].asset, name));
    const label = document.createElement("span");
    label.className = "figure-name";
    label.textContent = name;
    const perk = document.createElement("span");
    perk.className = "figure-perk";
    perk.textContent = t2(`perks.${id}`);
    btn.append(art, label, perk);
    btn.setAttribute("aria-label", `${t2("heroCreate.figureLabel", { name })}, ${t2(`perks.${id}`)}`);
    btn.addEventListener("click", () => {
      figure = id;
      render();
    });
    return btn;
  }));
  function render() {
    for (const btn of ref.figures.children) btn.setAttribute("aria-pressed", String(btn.dataset.id === figure));
    ref.wordA.textContent = nameA[a];
    ref.wordB.textContent = nameB[b];
  }
  ref.otherA.addEventListener("click", () => {
    a = (a + 1) % nameA.length;
    render();
  });
  ref.otherB.addEventListener("click", () => {
    b = (b + 1) % nameB.length;
    render();
  });
  ref.dice.addEventListener("click", () => {
    a = Math.floor(Math.random() * nameA.length);
    b = Math.floor(Math.random() * nameB.length);
    render();
  });
  ref.done.addEventListener("click", () => {
    root.querySelectorAll("button").forEach((x) => {
      x.disabled = true;
    });
    onDone({ figureId: figure, nameA: a, nameB: b });
  }, { once: true });
  render();
}

// src/ui/screens/logbook.js
var PAGES = ["hero", "talents", "deck", "collection", "gear", "rules", "practice"];
var SLOTS3 = ["kopf", "koerper", "hand"];
var STATS3 = ["kraft", "ruhe", "leben"];
var STAT_ICON = { kraft: ICON.attack, ruhe: ICON.bolt, leben: ICON.heart };
var RULE_ICON = [ICON.attack, ICON.deck, ICON.check, ICON.bolt, ICON.heart, ICON.next, ICON.star];
function mountLogbook(root, { t: t2, config, game, onCommand, onClose, onEditHero = () => {
} }) {
  root.innerHTML = `
  <main class="screen logbook-screen">
    <section class="panel logbook">
      <header class="logbook-head">
        <h1 class="logbook-title" data-ref="title"></h1>
        <nav class="logbook-tabs" data-ref="tabs"></nav>
        <button class="btn btn-quiet logbook-close" type="button" data-ref="close"></button>
      </header>
      <div class="logbook-page" data-ref="page"></div>
    </section>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll("[data-ref]")].map((el2) => [el2.dataset.ref, el2]));
  const v0 = game.view();
  const homeArea = homeAreaId(config, v0.profile, v0.run);
  addWorld(root.querySelector(".screen"), `area.${homeArea}`);
  ref.title.textContent = t2("logbook.title");
  ref.close.textContent = t2("logbook.close");
  ref.close.addEventListener("click", () => onClose(), { once: true });
  ref.tabs.replaceChildren(...PAGES.map((page) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-quiet logbook-tab";
    b.dataset.page = page;
    b.textContent = t2(`logbook.tab.${page}`);
    b.addEventListener("click", () => {
      onCommand({ type: "openLogbook", page });
      render();
    });
    return b;
  }));
  function heroPage(p) {
    const wrap = document.createElement("div");
    wrap.className = "lb-hero";
    const thresholds = config.levels.xpThresholds;
    const next = thresholds[p.stufe];
    wrap.innerHTML = `
      <div class="lb-hero-art"></div>
      <div class="lb-hero-info lb-sheet">
        <p class="lb-name"></p>
        <p class="lb-line"></p>
        <p class="lb-line lb-quiet"></p>
        <ul class="lb-stats"></ul>
        <div class="lb-points">
          <span class="lb-free"></span>
          <button class="btn btn-quiet lb-reset" type="button"></button>
        </div>
      </div>
      <button class="btn btn-quiet lb-change" type="button"></button>`;
    wrap.querySelector(".lb-hero-art").append(worldLayer(`area.${homeArea}`, "lb-hero-scene"), renderAsset(p.asset, p.name));
    wrap.querySelector(".lb-name").textContent = p.name;
    const [line1, line2] = wrap.querySelectorAll(".lb-line");
    line1.textContent = `${t2("logbook.level", { n: p.stufe })} \xB7 ${t2("logbook.xp", { n: p.ep })} \xB7 ${t2("logbook.hp", { n: p.maxHp })}`;
    line2.textContent = next !== void 0 ? t2("logbook.nextLevel", { n: next - p.ep, stufe: p.stufe + 1 }) : t2("logbook.maxLevel");
    wrap.querySelector(".lb-stats").replaceChildren(...STATS3.map((stat) => {
      const li = document.createElement("li");
      li.className = "lb-stat";
      li.dataset.stat = stat;
      li.innerHTML = `<span class="lb-stat-icon">${STAT_ICON[stat]}</span><span class="lb-stat-text"><b></b><small></small></span><span class="lb-stat-value"></span><button class="btn lb-plus" type="button">+</button>`;
      li.querySelector("b").textContent = t2(`logbook.stat.${stat}`);
      li.querySelector("small").textContent = t2(`logbook.statHelp.${stat}`);
      li.querySelector(".lb-stat-value").textContent = String(p.punkte[stat]);
      const plus = li.querySelector(".lb-plus");
      plus.setAttribute("aria-label", t2("logbook.add", { stat: t2(`logbook.stat.${stat}`) }));
      plus.disabled = p.freePoints === 0 || p.punkte[stat] >= config.levels.maxPointsPerStat;
      plus.addEventListener("click", () => {
        onCommand({ type: "spendPoint", stat });
        render();
      });
      return li;
    }));
    const free = wrap.querySelector(".lb-free");
    free.textContent = p.freePoints === 0 ? t2("logbook.freeNone") : p.freePoints === 1 ? t2("logbook.freeOne") : t2("logbook.freeMany", { n: p.freePoints });
    if (p.freePoints > 0) free.classList.add("is-on");
    const reset = wrap.querySelector(".lb-reset");
    reset.textContent = t2("logbook.reset");
    reset.disabled = STATS3.every((s) => p.punkte[s] === 0);
    reset.addEventListener("click", () => {
      onCommand({ type: "resetPoints" });
      render();
    });
    const change = wrap.querySelector(".lb-change");
    change.textContent = t2("logbook.changeHero");
    change.addEventListener("click", () => onEditHero());
    return wrap;
  }
  function talentsPage(p) {
    const wrap = document.createElement("div");
    wrap.className = "lb-talents";
    const head = document.createElement("p");
    head.className = "lb-quiet";
    head.textContent = t2("talents.pick");
    wrap.append(head);
    for (const row of p.talents) {
      const sec = document.createElement("section");
      sec.className = "lb-talent-row" + (row.available ? "" : " is-locked");
      const lv = document.createElement("h3");
      lv.className = "lb-talent-level";
      lv.textContent = row.available ? t2("logbook.level", { n: row.level }) : t2("talents.from", { n: row.level });
      sec.append(lv);
      for (const id of row.options) {
        const b = document.createElement("button");
        b.type = "button";
        const on = row.chosen === id;
        b.className = "lb-talent" + (on ? " is-chosen" : "");
        b.disabled = !row.available;
        b.setAttribute("aria-pressed", String(on));
        b.innerHTML = "<b></b><small></small>";
        b.querySelector("b").textContent = t2(`talents.${id}.name`) + (on ? ` \xB7 ${t2("talents.chosen")}` : "");
        b.querySelector("small").textContent = t2(`talents.${id}.text`);
        b.addEventListener("click", () => {
          onCommand({ type: "chooseTalent", level: row.level, talentId: id });
          render();
        });
        sec.append(b);
      }
      wrap.append(sec);
    }
    return wrap;
  }
  let collectionPart = "album";
  function collectionPage(p) {
    const wrap = document.createElement("div");
    wrap.className = "lb-collection";
    const found = p.album.filter((a) => a.found).length;
    const seen = p.book.filter((b) => b.count + b.eliteCount > 0).length;
    const switcher = document.createElement("div");
    switcher.className = "lb-switch";
    switcher.setAttribute("role", "group");
    for (const [part, label] of [["album", t2("collection.album", { n: found, max: p.album.length })], ["book", t2("collection.book", { n: seen, max: p.book.length })]]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-quiet lb-switch-btn";
      b.setAttribute("aria-pressed", String(collectionPart === part));
      b.textContent = label;
      b.addEventListener("click", () => {
        collectionPart = part;
        render();
      });
      switcher.append(b);
    }
    wrap.append(switcher);
    if (collectionPart === "album") {
      const grid = document.createElement("div");
      grid.className = "lb-deck-grid lb-album";
      grid.replaceChildren(...p.album.map(({ cardId, found: has, level, toNext }, i) => {
        const cell = document.createElement("div");
        cell.className = "lb-deck-cell" + (has ? "" : " is-unknown");
        const card = renderCard({ uid: `a${i}`, cardId, level: has ? level : 1 }, config.cards[cardId], { t: t2, why: null });
        card.disabled = true;
        card.tabIndex = -1;
        if (!has) card.setAttribute("aria-label", t2("collection.unknownCard"));
        cell.append(card);
        const next = document.createElement("p");
        next.className = "lb-next";
        const albumRow = p.album[i];
        next.textContent = !has && albumRow.locked ? t2("collection.fromStars", { n: albumRow.unlockStars }) : !has ? t2("collection.notFound") : toNext !== null ? t2("logbook.deckNext", { n: toNext }) : level > 1 ? t2("logbook.deckMax") : "";
        if (next.textContent) cell.append(next);
        return cell;
      }));
      wrap.append(grid);
      return wrap;
    }
    for (const areaId of [...new Set(p.book.map((b) => b.areaId))]) {
      const sec = document.createElement("section");
      sec.className = "lb-book-area";
      const h = document.createElement("h3");
      h.className = "lb-slot-title";
      h.textContent = t2(`areas.${areaId}.name`);
      const row = document.createElement("div");
      row.className = "lb-book-row";
      row.replaceChildren(...p.book.filter((b) => b.areaId === areaId).map((b) => {
        const known = b.count + b.eliteCount > 0;
        const cell = document.createElement("article");
        cell.className = "lb-book-entry" + (known ? "" : " is-unknown") + (b.boss || b.eliteCount > 0 ? " is-gold" : "");
        const pic = document.createElement("div");
        pic.className = "lb-book-pic";
        pic.append(renderAsset(`enemy.${b.typeId}`, known ? t2(`enemies.${b.typeId}.name`) : ""));
        const name = document.createElement("b");
        name.textContent = known ? t2(`enemies.${b.typeId}.name`) : t2("collection.unknownName");
        const text2 = document.createElement("small");
        text2.textContent = known ? t2(`enemies.${b.typeId}.book`) : "";
        const count = document.createElement("span");
        count.className = "lb-book-count";
        count.textContent = known ? b.eliteCount ? t2("collection.countElite", { n: b.count, e: b.eliteCount }) : t2("collection.count", { n: b.count }) : "";
        cell.append(pic, name, text2, count);
        return cell;
      }));
      sec.append(h, row);
      wrap.append(sec);
    }
    return wrap;
  }
  function gearPage(p) {
    const wrap = document.createElement("div");
    wrap.className = "lb-gear";
    const head = document.createElement("p");
    head.className = "lb-quiet";
    head.textContent = p.gear.besitz.length ? t2("gear.hint") : t2("gear.none");
    wrap.append(head);
    for (const slot of SLOTS3) {
      const row = document.createElement("section");
      row.className = "lb-slot";
      const title = document.createElement("h3");
      title.className = "lb-slot-title";
      title.textContent = t2(`slots.${slot}`);
      row.append(title);
      const owned = p.gear.besitz.filter((id) => config.items[id].slot === slot);
      if (!owned.length) {
        const empty = document.createElement("p");
        empty.className = "lb-quiet";
        empty.textContent = t2("gear.empty");
        row.append(empty);
      }
      for (const id of owned) {
        const worn = p.gear.angelegt[slot] === id;
        const item = document.createElement("div");
        item.className = "lb-item" + (worn ? " is-worn" : "");
        item.innerHTML = '<span class="item-pic"></span><span class="lb-item-text"><b></b><small></small></span><button class="btn btn-quiet lb-item-btn" type="button"></button>';
        item.querySelector(".item-pic").append(renderAsset(`item.${id}`, ""));
        item.querySelector("b").textContent = t2(`items.${id}.name`) + (worn ? ` \xB7 ${t2("gear.worn")}` : "");
        item.querySelector("small").textContent = t2(`items.${id}.eff`);
        const b = item.querySelector("button");
        b.textContent = worn ? t2("gear.unequip") : t2("gear.equip");
        b.addEventListener("click", () => {
          onCommand(worn ? { type: "unequipItem", slot } : { type: "equipItem", itemId: id });
          render();
        });
        row.append(item);
      }
      wrap.append(row);
    }
    return wrap;
  }
  function deckPage(p) {
    const wrap = document.createElement("div");
    wrap.className = "lb-deck";
    const total = p.deck.reduce((sum, d) => sum + d.n, 0);
    const head = document.createElement("p");
    head.className = "lb-quiet";
    head.textContent = t2("logbook.deckTotal", { n: total });
    const grid = document.createElement("div");
    grid.className = "lb-deck-grid";
    grid.replaceChildren(...p.deck.map(({ cardId, n, level, toNext }, i) => {
      const cell = document.createElement("div");
      cell.className = "lb-deck-cell";
      const card = renderCard({ uid: `d${i}`, cardId, level }, config.cards[cardId], { t: t2, why: null });
      card.disabled = true;
      card.tabIndex = -1;
      const count = document.createElement("span");
      count.className = "lb-count";
      count.textContent = t2("logbook.deckCount", { n });
      cell.append(card, count);
      if (toNext !== null || level > 1) {
        const next = document.createElement("p");
        next.className = "lb-next";
        next.textContent = toNext !== null ? t2("logbook.deckNext", { n: toNext }) : t2("logbook.deckMax");
        cell.append(next);
      }
      return cell;
    }));
    wrap.append(head, grid);
    return wrap;
  }
  function rulesPage() {
    const ol = document.createElement("ol");
    ol.className = "lb-rules";
    ol.replaceChildren(...RULE_ICON.map((icon, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="lb-rule-num">${i + 1}</span><span class="lb-rule-icon">${icon}</span><span></span>`;
      li.lastChild.textContent = t2(`logbook.rules.${i}`, { n: config.game.penalty.wrong });
      return li;
    }));
    return ol;
  }
  function practicePage(p) {
    const wrap = document.createElement("div");
    wrap.className = "lb-practice";
    const head = document.createElement("p");
    head.className = "lb-quiet";
    head.textContent = p.practice.length ? t2("logbook.practiceText") : t2("logbook.practiceEmpty");
    const ul = document.createElement("ul");
    ul.replaceChildren(...p.practice.map((text2, i) => {
      const li = document.createElement("li");
      li.textContent = text2;
      const way = wayText(t2, (p.practiceWays ?? [])[i]);
      if (way) {
        const small = document.createElement("span");
        small.className = "practice-way";
        small.textContent = way;
        li.append(small);
      }
      return li;
    }));
    wrap.append(head, ul);
    return wrap;
  }
  function render() {
    const v = game.view();
    const page = v.logbook?.page ?? "hero";
    for (const b of ref.tabs.children) b.setAttribute("aria-pressed", String(b.dataset.page === page));
    const p = v.profile;
    const content = page === "hero" ? heroPage(p) : page === "talents" ? talentsPage(p) : page === "collection" ? collectionPage(p) : page === "deck" ? deckPage(p) : page === "gear" ? gearPage(p) : page === "rules" ? rulesPage() : practicePage(p);
    ref.page.replaceChildren(content);
  }
  render();
}

// src/engine/adult-gate.js
var ONES = ["", "ein", "zwei", "drei", "vier", "f\xFCnf", "sechs", "sieben", "acht", "neun"];
var TEENS = ["zehn", "elf", "zw\xF6lf", "dreizehn", "vierzehn", "f\xFCnfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"];
var TENS = ["", "", "zwanzig", "drei\xDFig", "vierzig", "f\xFCnfzig", "sechzig", "siebzig", "achtzig", "neunzig"];
function belowHundred(n) {
  if (n === 0) return "";
  if (n === 1) return "eins";
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  const t2 = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t2] : `${ONES[o]}und${TENS[t2]}`;
}
function belowThousand(n) {
  const h = Math.floor(n / 100);
  return `${h > 0 ? `${ONES[h]}hundert` : ""}${belowHundred(n % 100)}`;
}
function numberToGermanWords(n) {
  if (!Number.isInteger(n) || n < 1 || n > 99999) throw new Error(`nur ganze Zahlen von 1 bis 99 999: ${n}`);
  if (n === 1) return "eins";
  const th = Math.floor(n / 1e3);
  const rest = belowThousand(n % 1e3);
  if (th === 0) return belowThousand(n);
  const thWord = th === 1 ? "ein" : belowHundred(th);
  return `${thWord}tausend${rest}`;
}
var GATE_DIGITS = 5;
function createGateChallenge(rng) {
  const n = rng.nextInt(1e4, 99999);
  return { words: numberToGermanWords(n), digits: String(n) };
}

// src/ui/screens/adult.js
var TOGGLES = ["ton", "musik", "wenigBewegung"];
function mountAdult(root, { t: t2, config, game, rng, onSetting, onReset, onBack }) {
  root.innerHTML = `
  <main class="screen adult-screen">
    <section class="panel adult">
      <header class="adult-head">
        <h1 class="adult-title" data-ref="title"></h1>
        <button class="btn btn-quiet" type="button" data-ref="back"></button>
      </header>
      <div class="adult-gate" data-ref="gate">
          <p class="adult-text" data-ref="gateAsk"></p>
          <p class="gate-words" data-ref="gateWords"></p>
          <p class="gate-input" data-ref="gateInput" aria-live="polite"></p>
          <p class="adult-note gate-wrong" data-ref="gateWrong" hidden></p>
          <div class="gate-keys" data-ref="keys"></div>
          <div class="gate-actions">
            <button class="btn btn-quiet" type="button" data-ref="gateCancel"></button>
            <button class="btn" type="button" data-ref="gateOk"></button>
          </div>
      </div>
      <div class="adult-body" data-ref="body" hidden>
        <p class="adult-text" data-ref="about"></p>
        <p class="adult-note" data-ref="pending" hidden></p>
        <div class="adult-row">
          <span class="adult-label" data-ref="moreTimeLabel"></span>
          <div class="adult-options" data-ref="moreTime" role="group"></div>
        </div>
        <div data-ref="toggles"></div>
        <div class="adult-row">
          <span class="adult-label" data-ref="volumeLabel"></span>
          <div class="adult-options" data-ref="volume" role="group"></div>
        </div>
        <p class="adult-note" data-ref="storage"></p>
        <p class="adult-note"><a data-ref="privacy" href="datenschutz.html"></a> \xB7 <a data-ref="imprint" href="impressum.html"></a></p>
        <div class="adult-reset" data-ref="resetBox">
          <button class="btn btn-quiet adult-reset-btn" type="button" data-ref="reset"></button>
          <p class="adult-note" data-ref="resetHelp"></p>
        </div>
        <div class="adult-confirm" data-ref="confirm" hidden>
          <p class="adult-text" data-ref="confirmAsk"></p>
          <div class="gate-actions">
            <button class="btn btn-quiet" type="button" data-ref="confirmCancel"></button>
            <button class="btn adult-danger" type="button" data-ref="confirmOk"></button>
          </div>
        </div>
      </div>
    </section>
  </main>`;
  const ref = Object.fromEntries([...root.querySelectorAll("[data-ref]")].map((el2) => [el2.dataset.ref, el2]));
  ref.title.textContent = t2("adult.title");
  ref.back.textContent = t2("adult.back");
  ref.back.addEventListener("click", () => onBack(), { once: true });
  ref.about.textContent = t2("adult.about");
  ref.moreTimeLabel.textContent = t2("adult.moreTime");
  ref.volumeLabel.textContent = t2("adult.volume");
  ref.storage.textContent = onReset ? t2("adult.storage") : t2("adult.storageAccount");
  ref.privacy.textContent = t2("adult.privacy");
  ref.imprint.textContent = t2("adult.imprint");
  if (!onReset) ref.resetBox.remove();
  ref.reset.textContent = t2("adult.reset");
  ref.resetHelp.textContent = t2("adult.resetHelp");
  ref.gateAsk.textContent = t2("adult.gateAsk");
  ref.gateCancel.textContent = t2("adult.cancel");
  ref.gateOk.textContent = t2("adult.gateOk");
  ref.confirmAsk.textContent = t2("adult.resetConfirm");
  ref.confirmCancel.textContent = t2("adult.cancel");
  ref.confirmOk.textContent = t2("adult.resetOk");
  function renderSettings() {
    const v = game.view();
    const s = v.settings;
    ref.pending.hidden = Boolean(v.profile);
    ref.pending.textContent = t2("adult.pendingNote");
    ref.moreTime.replaceChildren(...Object.keys(config.game.moreTime).map((key) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-quiet adult-option";
      b.textContent = t2(`adult.moreTimeOpt.${key}`);
      b.setAttribute("aria-pressed", String(s.mehrZeit === key));
      b.addEventListener("click", () => {
        onSetting("mehrZeit", key);
        renderSettings();
      });
      return b;
    }));
    ref.toggles.replaceChildren(...TOGGLES.map((key) => {
      const row = document.createElement("div");
      row.className = "adult-row";
      const label = document.createElement("span");
      label.className = "adult-label";
      label.textContent = t2(`adult.${key}`);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-quiet adult-toggle";
      b.setAttribute("aria-pressed", String(s[key]));
      b.textContent = s[key] ? t2("adult.on") : t2("adult.off");
      b.setAttribute("aria-label", `${t2(`adult.${key}`)}: ${b.textContent}`);
      b.addEventListener("click", () => {
        onSetting(key, !s[key]);
        renderSettings();
      });
      row.append(label, b);
      return row;
    }));
    ref.volume.replaceChildren(...config.sounds.volumeSteps.map((value, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-quiet adult-option";
      b.textContent = t2(`adult.volumeOpt.v${i}`);
      b.setAttribute("aria-pressed", String(s.lautstaerke === value));
      b.addEventListener("click", () => {
        onSetting("lautstaerke", value);
        renderSettings();
      });
      return b;
    }));
    if (onReset) {
      ref.reset.disabled = !v.profile;
      ref.resetHelp.textContent = v.profile ? t2("adult.resetHelp") : t2("adult.noSave");
    }
  }
  let challenge = null;
  let typed = "";
  function newChallenge(wrong) {
    challenge = createGateChallenge(rng);
    typed = "";
    const cut = challenge.words.indexOf("tausend") + "tausend".length;
    ref.gateWords.replaceChildren(challenge.words.slice(0, cut), document.createElement("wbr"), challenge.words.slice(cut));
    ref.gateWrong.hidden = !wrong;
    ref.gateWrong.textContent = t2("adult.gateWrong");
    renderInput();
  }
  function renderInput() {
    ref.gateInput.textContent = typed || "\u2013";
    ref.gateOk.disabled = typed.length !== GATE_DIGITS;
  }
  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0"];
  ref.keys.replaceChildren(...KEYS.map((k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-quiet gate-key";
    b.textContent = k === "del" ? "\u232B" : k;
    if (k === "del") b.setAttribute("aria-label", t2("adult.gateDelete"));
    b.addEventListener("click", () => {
      if (k === "del") typed = typed.slice(0, -1);
      else if (typed.length < GATE_DIGITS) typed += k;
      renderInput();
    });
    return b;
  }));
  ref.gateCancel.addEventListener("click", () => onBack(), { once: true });
  ref.gateOk.addEventListener("click", () => {
    if (typed !== challenge.digits) {
      newChallenge(true);
      return;
    }
    ref.gate.hidden = true;
    ref.body.hidden = false;
    renderSettings();
  });
  ref.reset.addEventListener("click", () => {
    ref.resetBox.hidden = true;
    ref.confirm.hidden = false;
    ref.confirm.scrollIntoView({ block: "nearest" });
  });
  ref.confirmCancel.addEventListener("click", () => {
    ref.confirm.hidden = true;
    ref.resetBox.hidden = false;
  });
  ref.confirmOk.addEventListener("click", () => {
    ref.confirmOk.disabled = true;
    onReset();
  });
  newChallenge(false);
}

// src/main.js
var app = document.getElementById("app");
function setupAudio(config, settings) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const audio = createAudio({
    sounds: config.sounds,
    enabled: settings?.ton ?? true,
    music: settings?.musik ?? true,
    volume: settings?.lautstaerke ?? config.sounds.defaultVolume,
    context: Ctx ? () => new Ctx() : null,
    loadTrack: (url) => fetch(url).then((r) => {
      if (!r.ok) throw new Error(url);
      return r.arrayBuffer();
    })
    // Musikstücke (D35)
  });
  document.addEventListener("pointerdown", () => audio.unlock(), { capture: true });
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest?.("button");
    if (b && !b.disabled && !b.closest(".stage")) audio.ui("buttonTap");
  }, { capture: true });
  return audio;
}
function showMessage(title, lines = []) {
  app.replaceChildren();
  const h = document.createElement("h1");
  h.textContent = title;
  app.append(h);
  if (lines.length) {
    const list = document.createElement("ul");
    for (const line of lines) {
      const li = document.createElement("li");
      li.textContent = line;
      list.append(li);
    }
    app.append(list);
  }
}
function showNotice(text2) {
  let el2 = document.querySelector(".notice");
  if (!el2) {
    el2 = document.createElement("p");
    el2.className = "notice";
    el2.setAttribute("role", "status");
    document.body.append(el2);
  }
  el2.textContent = text2;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => el2.remove(), 6e3);
}
function browserBackend() {
  try {
    return window.localStorage;
  } catch {
    const fail = () => {
      throw new Error("kein Speicher");
    };
    return { getItem: fail, setItem: fail, removeItem: fail };
  }
}
function openSave(config) {
  const storage = createStorage(browserBackend(), config);
  const { save, status } = storage.load();
  if (status === "unavailable") showNotice(t("save.unavailable"));
  return { storage, save: save ?? createSave(Date.now(), 3, config), status };
}
function runDevCombats(config, params) {
  const enemies = (params.get("enemies") || "crab,jelly").split(",").filter((id) => config.enemies[id] || config.bosses.bosses[id]).slice(0, 4);
  if (params.get("calm") === "1") document.body.classList.add("is-calm");
  const { storage, save } = openSave(config);
  const zeit = params.get("zeit");
  if (zeit && config.game.moreTime[zeit] !== void 0) save.einstellung.mehrZeit = zeit;
  if (params.get("klasse") === "4") save.klasse = 4;
  const game = createGame({ config, save, seed: Number(params.get("seed") || Date.now() % 1e5) });
  const audio = setupAudio(config, save.einstellung);
  audio.setScene(params.get("area") || "reef");
  const level = Number(params.get("stufe") || 1);
  const persist = () => {
    if (!storage.write(game.toSave(Date.now()))) showNotice(t("save.unavailable"));
  };
  let screen = null;
  const show = (next) => {
    screen?.destroy?.();
    screen = next;
  };
  function fight() {
    game.setNow(Date.now(), (/* @__PURE__ */ new Date()).getTimezoneOffset());
    const area = config.class3.areas[params.get("area")] ? params.get("area") : "reef";
    const elite = config.elites.rules[params.get("elite")] ? params.get("elite") : null;
    const rescue = params.get("rettung") === "1";
    const hp = Number(params.get("leben")) > 0 ? Number(params.get("leben")) : void 0;
    game.startCombat(enemies.length ? enemies : ["crab"], level, { enemyPower: Number(params.get("stroemung") || 1), areaId: area, elite, rescue, hp });
    show(mountCombat(app, {
      config,
      t,
      game,
      audio,
      onWon: () => {
        const { reward } = game.view();
        show(mountReward(app, {
          config,
          t,
          reward,
          levels: game.view().cardLevels,
          onPick: (cardId) => {
            game.setNow(Date.now(), (/* @__PURE__ */ new Date()).getTimezoneOffset());
            game.dispatch({ type: "pickReward", cardId });
            persist();
            fight();
          }
        }));
      },
      onLost: () => {
        persist();
        fight();
      }
    }));
  }
  fight();
}
function runGame(config, session = null) {
  const backend = session ? accountBackend(session.account.S, STORAGE_KEY, browserBackend()) : browserBackend();
  const storage = createStorage(backend, config);
  const { save, status } = storage.load();
  const verdict = loadVerdict(status, Boolean(session));
  if (verdict !== "play") {
    mountStop(app, {
      t,
      kind: verdict === "reload" ? "newer" : "corrupt",
      onReload: () => location.reload(),
      onLogout: session?.title?.onLogout ?? null
    });
    return;
  }
  if (status === "unavailable") showNotice(t("save.unavailable"));
  const game = createGame({ config, save, seed: Date.now() % 1000000007 });
  const audio = setupAudio(config, save?.einstellung);
  const persist = () => {
    const out = game.toSave(Date.now());
    if (out && !storage.write(out)) showNotice(t("save.unavailable"));
  };
  const act = (command) => {
    game.setNow(Date.now(), (/* @__PURE__ */ new Date()).getTimezoneOffset());
    const events = game.dispatch(command);
    persist();
    audio.events(events);
    return events;
  };
  const applySettings = () => {
    const s = game.view().settings;
    document.body.classList.toggle("is-calm", Boolean(s.wenigBewegung));
    audio.setEnabled(s.ton);
    audio.setMusic(s.musik);
    audio.setVolume(s.lautstaerke);
  };
  applySettings();
  let screen = null;
  const show = (next) => {
    screen?.destroy?.();
    screen = next;
  };
  let stationBought = null;
  const takeBought = () => {
    const id = stationBought;
    stationBought = null;
    return id;
  };
  function route() {
    const v = game.view();
    const bossFight = v.screen === "combat" && v.combat?.enemies.some((e) => config.bosses.bosses[e.typeId]);
    audio.setScene(bossFight ? "boss" : v.run?.areaId ?? v.cleared?.areaId ?? "base");
    if (v.screen === "title") {
      show(mountTitle(app, {
        t,
        hasSave: Boolean(v.profile),
        account: session?.title ?? null,
        onStart: () => {
          act({ type: "start" });
          route();
        },
        onAdult: () => show(mountAdult(app, {
          t,
          config,
          game,
          rng: createRng(Date.now() >>> 0),
          onSetting: (key, value) => {
            act({ type: "setSetting", key, value });
            applySettings();
          },
          // Mit Konto setzt nur die Lehrkraft zurück (Perlentaucher, D37)
          onReset: session ? null : () => {
            game.dispatch({ type: "resetSave" });
            storage.clear();
            applySettings();
            showNotice(t("adult.done"));
            route();
          },
          onBack: route
        }))
      }));
    } else if (v.screen === "grade") {
      show(mountGrade(app, {
        t,
        config,
        onChoose: (grade) => {
          act({ type: "chooseGrade", grade });
          route();
        }
      }));
    } else if (v.screen === "heroCreate") {
      show(mountHeroCreate(app, { t, config, onDone: (hero) => {
        act({ type: "createHero", ...hero });
        route();
      } }));
    } else if (v.screen === "logbook") {
      show(mountLogbook(app, {
        t,
        config,
        game,
        onCommand: (command) => act(command),
        onClose: () => {
          act({ type: "closeLogbook" });
          route();
        },
        onEditHero: () => {
          act({ type: "editHero" });
          route();
        }
      }));
    } else if (v.screen === "heroEdit") {
      show(mountHeroCreate(app, {
        t,
        config,
        initial: v.profile.held,
        areaId: v.run?.areaId ?? null,
        onDone: (hero) => {
          act({ type: "changeHero", ...hero });
          route();
        },
        onCancel: () => {
          act({ type: "cancelHeroEdit" });
          route();
        }
      }));
    } else if (v.screen === "base") {
      show(mountBase(app, {
        t,
        config,
        game,
        onDive: (areaId, { abandon = false, depth } = {}) => {
          act(depth === void 0 ? { type: "dive", areaId, abandon } : { type: "dive", areaId, abandon, depth });
          route();
        },
        onLogbook: (page) => {
          act({ type: "openLogbook", page });
          route();
        },
        onAckNewCards: () => act({ type: "ackNewCards" }),
        // Phase 9
        onAckMission: () => act({ type: "ackMission" }),
        // Tagesauftrag geschafft gesehen (Phase 10)
        // Station ausbauen (Etappe 8): nach dem Kauf steht das Stück im Bild, oben ein Satz dazu
        onBuy: (upgradeId) => {
          const ok = act({ type: "buyUpgrade", upgradeId }).some((e) => e.type === "upgradeBought");
          stationBought = ok ? upgradeId : null;
          route();
        },
        bought: takeBought(),
        account: session?.title ?? null
      }));
    } else if (v.screen === "map") {
      show(mountMap(app, {
        t,
        config,
        game,
        onExplain: (key) => act({ type: "markExplained", key }),
        onBeforeEnter: () => game.setNow(Date.now(), (/* @__PURE__ */ new Date()).getTimezoneOffset()),
        onEnter: (events, { stay }) => {
          game.setNow(Date.now(), (/* @__PURE__ */ new Date()).getTimezoneOffset());
          persist();
          if (!stay && !events.some((e) => e.type === "rejected")) route();
        },
        onSurface: () => {
          act({ type: "surface" });
          route();
        }
      }));
    } else if (v.screen === "combat") {
      show(mountCombat(app, {
        config,
        t,
        game,
        audio,
        tutorial: v.tutorial,
        explained: v.explained,
        onExplain: (key) => act({ type: "markExplained", key }),
        onPersist: () => {
          game.setNow(Date.now(), (/* @__PURE__ */ new Date()).getTimezoneOffset());
          persist();
        },
        // Rettung, Zweite Luft (Phase 10)
        onWon: () => {
          persist();
          show(mountReward(app, {
            config,
            t,
            reward: game.view().reward,
            levels: game.view().cardLevels,
            areaId: game.view().run?.areaId ?? game.view().cleared?.areaId,
            onPick: (cardId) => {
              game.setNow(Date.now(), (/* @__PURE__ */ new Date()).getTimezoneOffset());
              game.dispatch({ type: "pickReward", cardId });
              persist();
              route();
            }
          }));
        },
        // Uhr vor der Rückkehr zur Station: nach Mitternacht gilt der Auftrag des neuen Tages (Abschlussreview Etappe 5)
        onLost: () => {
          game.setNow(Date.now(), (/* @__PURE__ */ new Date()).getTimezoneOffset());
          persist();
          route();
        }
      }));
    } else if (v.screen === "reward") {
      show(mountReward(app, {
        config,
        t,
        reward: v.reward,
        levels: v.cardLevels,
        areaId: v.run?.areaId,
        onPick: (cardId) => {
          act({ type: "pickReward", cardId });
          route();
        }
      }));
    } else if (v.screen === "shop") {
      show(mountShop(app, {
        t,
        config,
        game,
        onCommand: (command) => act(command),
        onLeave: () => {
          act({ type: "leaveShop" });
          route();
        }
      }));
    } else if (v.screen === "event") {
      show(mountEvent(app, {
        t,
        game,
        onChoose: (optionId) => {
          act({ type: "chooseEventOption", optionId });
          route();
        }
      }));
    } else if (v.screen === "riddle") {
      show(mountRiddle(app, {
        t,
        game,
        onAnswer: (choiceIndex) => {
          const events = act({ type: "answerRiddle", choiceIndex });
          if (events.some((e) => e.type === "riddleSolved")) route();
          return events;
        },
        onLeave: () => {
          act({ type: "leaveRiddle" });
          route();
        }
      }));
    } else if (v.screen === "areaCleared") {
      show(mountAreaCleared(app, {
        t,
        config,
        cleared: v.cleared,
        profile: v.profile,
        onDone: () => {
          act({ type: "surface" });
          route();
        }
      }));
    } else {
      showMessage(t("title.name"), [`Bildschirm ${v.screen}`]);
    }
  }
  route();
}
async function boot() {
  let config;
  try {
    config = await loadConfig(browserFetchJson());
    setManifest(await browserFetchJson("")("assets/manifest.json"));
  } catch (err) {
    showMessage("Abyss of Numbers", [String(err.message || err)]);
    return;
  }
  setTexts(config.texts);
  const errors = validateConfig(config);
  if (errors.length > 0) {
    showMessage(t("boot.configError"), errors);
    return;
  }
  document.title = t("title.name");
  const params = new URLSearchParams(location.search);
  if (params.get("dev") === "combat" && isLocalHost()) {
    runDevCombats(config, params);
    return;
  }
  const LK = window.LagunenKonto;
  if (!LK || isLocalHost() && !window.ATTRAPPE) {
    runGame(config);
    return;
  }
  enter(config, LK);
}
var RESTART_FLAG = "abyss-neustart";
function enter(config, LK) {
  const account = createAccount(LK, FIREBASE);
  const { S: S2, cloud } = account;
  let playing = false;
  let login = null;
  const netText = () => {
    const z = cloud.zustand().art;
    if (z === "lokal") return t("login.offline");
    if (z === "fehler") return t("login.failed");
    return "";
  };
  cloud.beiZustand((z) => {
    if (playing && z.art === "fehler") showNotice(t("login.failed"));
  });
  cloud.beiNeustart(() => {
    try {
      sessionStorage.setItem(RESTART_FLAG, "1");
    } catch {
    }
    location.reload();
  });
  function play(r) {
    if (playing) return;
    clearTimeout(slowTimer);
    playing = true;
    try {
      startPlay(r);
    } catch (e) {
      playing = false;
      showLogin(t("login.crash", { msg: String(e?.message ?? e).slice(0, 160) }));
    }
  }
  function startPlay(r) {
    const title = {
      name: r.name,
      onLogout: () => {
        cloud.abmelden().then(() => location.reload(), () => location.reload());
      },
      onNet: (f) => {
        let on = true;
        const update = () => {
          if (on) f(netText());
        };
        cloud.beiZustand(update);
        return () => {
          on = false;
        };
      }
    };
    runGame(config, { account, title });
    if (r.gespeichert === false) showNotice(t("save.unavailable"));
    let restarted = false;
    try {
      restarted = sessionStorage.getItem(RESTART_FLAG) === "1";
      sessionStorage.removeItem(RESTART_FLAG);
    } catch {
    }
    if (restarted) showNotice(t("login.restarted"));
  }
  function fail(r) {
    clearTimeout(slowTimer);
    if (r.grund === cloud.TEXT.gesperrt && S2.aktiv()) S2.abmelden();
    if (login) login.fail(r.grund || cloud.TEXT.sonst);
    else showLogin(r.grund || cloud.TEXT.sonst);
  }
  let slowTimer = null;
  let lastError = "";
  window.addEventListener("error", (e) => {
    lastError = String(e.message ?? "").slice(0, 120);
  });
  window.addEventListener("unhandledrejection", (e) => {
    lastError = String(e.reason?.message ?? e.reason ?? "").slice(0, 120);
  });
  const watch = () => {
    clearTimeout(slowTimer);
    slowTimer = setTimeout(() => {
      if (!playing && login) login.fail(t("login.slow", { step: `${cloud.schritt()}, Firebase ${typeof firebase === "undefined" ? "fehlt" : "da"}${lastError ? `, Fehler: ${lastError}` : ""}` }));
    }, 15e3);
  };
  function showLogin(hint = "", busy = false) {
    login = mountLogin(app, {
      t,
      hint,
      busy,
      onSubmit: (code) => {
        watch();
        return cloud.anmelden(code).then((r) => r.ok ? play(r) : fail(r), (e) => fail({ grund: `${cloud.TEXT.sonst} (${String(e?.message ?? e).slice(0, 120)})` }));
      }
    });
    if (busy) watch();
  }
  const LA = LK.adresse;
  const qr = LA.code();
  const spur = LA.spur();
  LA.saeubern();
  if (qr) {
    if (S2.aktiv() && S2.code() !== qr) S2.abmelden();
    showLogin("", true);
    cloud.anmelden(qr).then((r) => r.ok ? play(r) : fail(r), () => fail({ grund: cloud.TEXT.sonst }));
    return;
  }
  const remembered = S2.code();
  showLogin(spur ? t("login.partial") : "", Boolean(remembered));
  cloud.start().then((r) => {
    if (r.ok) {
      play(r);
      return null;
    }
    if (r.grund) {
      fail(r);
      return null;
    }
    return remembered && S2.code() === remembered ? cloud.anmelden(remembered) : null;
  }).then((r) => {
    if (!r) {
      if (!playing) login.ready(spur ? t("login.partial") : "");
      return;
    }
    if (r.ok) play(r);
    else fail(r);
  }, () => {
    if (!playing) login.ready();
  });
}
var lastTap = { t: 0, x: 0, y: 0 };
document.addEventListener("touchend", (e) => {
  if (e.touches.length > 0 || e.changedTouches.length !== 1) return;
  const p = e.changedTouches[0];
  const now = e.timeStamp;
  const near = Math.abs(p.clientX - lastTap.x) < 40 && Math.abs(p.clientY - lastTap.y) < 40;
  if (now - lastTap.t < 350 && near && !e.target.closest?.("button, a, input, textarea, select, label, [role=button], [tabindex], .card")) e.preventDefault();
  lastTap = { t: now, x: p.clientX, y: p.clientY };
}, { passive: false });
boot();
