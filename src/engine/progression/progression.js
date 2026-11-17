// Fortschritt: Erfahrung und Stufen, Kartenbeute, Deck, Übungsliste.

export function grantXp(save, amount, config) {
  const before = save.stufe;
  save.ep += amount;
  const th = config.levels.xpThresholds;
  let stufe = 1;
  for (let i = 1; i < th.length; i++) if (save.ep >= th[i]) stufe = i + 1;
  save.stufe = Math.max(before, stufe);
  return { levelUps: save.stufe - before };
}

// Drei verschiedene Karten aus dem Pool des Gebiets. Fehlt die Pflichtkarte
// (firstRewardIncludes) im Deck, ist sie beim ersten Mal dabei.
export function rollRewardCards(save, areaId, rng, config) {
  const pool = config.decks.rewardPools[areaId];
  if (!pool) throw new Error(`kein Beutepool für ${areaId}`);
  const count = config.rewards.cardChoices;
  const must = config.decks.firstRewardIncludes;
  const chosen = [];
  if (must && pool.includes(must) && !(save.deck[must] > 0)) chosen.push(must);
  for (const id of rng.shuffle(pool)) {
    if (chosen.length >= count) break;
    if (!chosen.includes(id)) chosen.push(id);
  }
  return rng.shuffle(chosen);
}

export function addCardToDeck(save, cardId) {
  save.deck[cardId] = (save.deck[cardId] ?? 0) + 1;
}

export function deckList(save) {
  return Object.entries(save.deck).flatMap(([id, n]) => Array(n).fill(id));
}

// entries: [{ key, text }]; gleicher Schlüssel wird erneuert, es bleiben die neuesten.
export function addPractice(save, entries, now, config) {
  for (const { key, text } of entries) {
    delete save.uebung[key]; // neu einfügen, damit die Reihenfolge stimmt
    save.uebung[key] = { text, t: now };
  }
  const keys = Object.keys(save.uebung);
  const max = config.game.practiceListMax;
  if (keys.length <= max) return;
  const ordered = keys
    .map((k, i) => ({ k, t: save.uebung[k].t, i }))
    .sort((a, b) => b.t - a.t || b.i - a.i);
  const keep = new Set(ordered.slice(0, max).map((x) => x.k));
  for (const k of keys) if (!keep.has(k)) delete save.uebung[k];
}

// ---------- Kartenstufen (Phase 5, Etappe 8) ----------
// save.karten[cardId].richtig zählt richtige Antworten je Kartenart über alle Kämpfe.
// game.json "cardLevels": [15, 40] = ab so vielen richtigen Antworten Stufe 2 bzw. 3.
// Karten ohne "upgrades" (zum Beispiel der Strudel) haben nur Stufe 1 und zählen nicht.
const upgradable = (cardId, config) => (config.cards[cardId]?.upgrades?.length ?? 0) > 0;

export function cardLevel(save, cardId, config) {
  if (!upgradable(cardId, config)) return 1;
  const n = save.karten?.[cardId]?.richtig ?? 0;
  const max = 1 + config.cards[cardId].upgrades.length;
  const reached = config.game.cardLevels.filter((need) => n >= need).length;
  return Math.min(max, 1 + reached);
}

// Zählt eine richtige Antwort; liefert die neue Stufe, wenn die Karte damit aufsteigt, sonst null.
export function countCorrect(save, cardId, config) {
  if (!upgradable(cardId, config)) return null;
  const before = cardLevel(save, cardId, config);
  save.karten[cardId] = { richtig: (save.karten[cardId]?.richtig ?? 0) + 1 };
  const after = cardLevel(save, cardId, config);
  return after > before ? after : null;
}

// Stufe je Kartenart im Deck (nur Karten über Stufe 1), für createCombat.
export function cardLevels(save, config) {
  const out = {};
  for (const cardId of Object.keys(save.karten ?? {})) {
    const level = cardLevel(save, cardId, config);
    if (level > 1) out[cardId] = level;
  }
  return out;
}

// Wie viele richtige Antworten bis zur nächsten Stufe; null, wenn es keine nächste gibt.
export function toNextLevel(save, cardId, config) {
  if (!upgradable(cardId, config)) return null;
  const level = cardLevel(save, cardId, config);
  if (level >= 1 + config.cards[cardId].upgrades.length) return null;
  const need = config.game.cardLevels[level - 1];
  return need - (save.karten?.[cardId]?.richtig ?? 0);
}
