import { offerable } from '../progression/progression.js?v=36a3ca2d';
// Händler (Konzept 10 und 11; Phase 5, Etappe 2): Karten gegen Perlen kaufen und eine Karte
// gegen Perlen abgeben. Das Angebot wird nicht gespeichert, sondern aus dem Seed des Raums neu
// erzeugt; gespeichert ist nur, was gekauft und ob schon abgegeben wurde (save.lauf.laden).

// depth (Phase 9): seltene Karten erst ab Tiefe 3, nur freigeschaltete Karten
export function createShopOffer(save, areaId, rng, config, { depth = 1 } = {}) {
  const full = config.decks.rewardPools[areaId];
  if (!full) throw new Error(`kein Beutepool für ${areaId}`);
  const pool = full.filter((id) => offerable(save, id, config, { depth }));
  const ids = [...new Set(rng.shuffle(pool))].slice(0, config.rewards.shopCards);
  return {
    cards: ids.map((cardId) => ({ cardId, price: config.cards[cardId].price })),
    removePrice: config.rewards.removePrice,
  };
}

// Rechenarten der Schadenskarten im Deck (ohne Karten mit Anzahl 0).
export function attackOperations(deck, config) {
  const ops = new Set();
  for (const [id, n] of Object.entries(deck)) {
    const def = config.cards[id];
    if (n > 0 && def?.effect.type === 'damage' && def.task?.operation) ops.add(def.task.operation);
  }
  return ops;
}

// Warum diese Karte nicht abgegeben werden darf, sonst null. Schutz vor einem Deck, mit dem
// kein Kampf mehr zu gewinnen ist (Prüfschwerpunkt 2): Jeder Gegner ist gegen höchstens eine
// Rechenart immun, also reichen Schadenskarten mit zwei Rechenarten.
export function removalBlockedReason(save, cardId, config) {
  if (!(save.deck[cardId] > 0)) return 'card';
  const size = Object.values(save.deck).reduce((a, b) => a + b, 0);
  if (size - 1 < config.rewards.minDeckSize) return 'deckTooSmall';
  const after = { ...save.deck, [cardId]: save.deck[cardId] - 1 };
  if (attackOperations(after, config).size < 2) return 'lastAttackTypes';
  return null;
}
