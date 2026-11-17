// Kartenstapel eines Kampfs: Nachziehstapel, Hand, Ablage, verbraucht.
// Jede Karte ist { uid, cardId }. Die Summe über alle vier Stapel bleibt gleich.

export function createPiles(cardIds, rng) {
  const cards = cardIds.map((cardId, i) => ({ uid: `c${i + 1}`, cardId }));
  return { draw: rng.shuffle(cards), hand: [], discard: [], exhausted: [] };
}

// Zieht n Karten. Ist der Nachziehstapel leer, wird die Ablage gemischt.
// Sind beide leer, wird gezogen, was da ist.
export function drawCount(piles, n, rng) {
  const events = [];
  const drawn = [];
  for (let i = 0; i < n; i++) {
    if (piles.draw.length === 0) {
      if (piles.discard.length === 0) break;
      piles.draw = rng.shuffle(piles.discard);
      piles.discard = [];
      events.push({ type: 'pilesShuffled', count: piles.draw.length });
    }
    const card = piles.draw.shift();
    piles.hand.push(card);
    drawn.push(card.uid);
  }
  if (drawn.length > 0) events.push({ type: 'cardsDrawn', cardUids: drawn });
  return events;
}

export function drawTo(piles, handSize, rng) {
  const missing = handSize - piles.hand.length;
  return missing > 0 ? drawCount(piles, missing, rng) : [];
}

function take(piles, uid) {
  const i = piles.hand.findIndex((c) => c.uid === uid);
  if (i < 0) throw new Error(`Karte ${uid} ist nicht auf der Hand`);
  return piles.hand.splice(i, 1)[0];
}

export function moveToDiscard(piles, uid) {
  piles.discard.push(take(piles, uid));
}

export function moveToExhausted(piles, uid) {
  piles.exhausted.push(take(piles, uid));
}
