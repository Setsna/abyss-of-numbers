// Seekarte eines Gebiets (Konzept 11). Aus Schichten der Konfiguration und einem Seed
// entsteht immer dieselbe Karte; sie wird nicht gespeichert, sondern aus lauf.seed neu erzeugt.
//
// Raum-Spezifikation: "type" oder "choices" (die Karte zieht den Typ mit dem Seed).
// Wege (Phase 5, Etappe 2): Raum an Platz i führt zu den Plätzen i und i + 1 der nächsten
// Schicht; hat die nächste Schicht weniger Räume, zu i − 1 und i (jeweils auf vorhandene
// Plätze begrenzt). Benachbarte Schichten unterscheiden sich um höchstens einen Raum
// (validate.js), deshalb hat jeder Raum einen Nachfolger und jeder Raum einen Vorgänger.
import { createRng, deriveSeed } from '../rng.js?v=e972392a';

export function nextSlots(slot, nextCount, count) {
  const wanted = nextCount < count ? [slot - 1, slot] : [slot, slot + 1];
  const clamped = wanted.map((s) => Math.min(nextCount - 1, Math.max(0, s)));
  return [...new Set(clamped)];
}

// config wird für die Boss-Begegnungen (bosses.json) gebraucht.
export function generateMap(areaConfig, seed, config) {
  const rng = createRng(deriveSeed(seed, 'map'));
  const layers = areaConfig.layers.map((layer, li) => layer.rooms.map((spec, si) => {
    const type = spec.type ?? rng.pick(spec.choices);
    const room = { id: `r${li}-${si}`, layer: li, slot: si, type, next: [] };
    if (type === 'combat') {
      room.enemies = rng.pick(spec.pool).slice();
      room.level = spec.level;
    }
    if (type === 'boss') {
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
  return { rooms: layers.flat(), start: layers[0].map((r) => r.id) };
}
