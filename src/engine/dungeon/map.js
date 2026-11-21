// Seekarte eines Gebiets (Konzept 11). Aus Schichten der Konfiguration und einem Seed
// entsteht immer dieselbe Karte; sie wird nicht gespeichert, sondern aus lauf.seed neu erzeugt.
//
// Raum-Spezifikation: "type" oder "choices" (die Karte zieht den Typ mit dem Seed).
// Wege (Phase 5, Etappe 2): Raum an Platz i führt zu den Plätzen i und i + 1 der nächsten
// Schicht; hat die nächste Schicht weniger Räume, zu i − 1 und i (jeweils auf vorhandene
// Plätze begrenzt). Benachbarte Schichten unterscheiden sich um höchstens einen Raum
// (validate.js), deshalb hat jeder Raum einen Nachfolger und jeder Raum einen Vorgänger.
//
// Jahresausbau, Etappe 2 (Phase 9, Konzept 8):
//   - Vorlagen: "layers" ist Vorlage 0, "moreLayouts": [{ layers }] weitere; der Seed wählt eine (map.layout).
//   - Gruppen je Tiefe: Kampfräume haben "pool" (ab Tiefe 1) und "deepPools": [{ fromDepth, groups }].
//   - Räume ab einer Tiefe: "fromDepth" mit "fallback" (Raum-Spezifikation, die darunter gilt).
import { createRng, deriveSeed } from '../rng.js?v=5d2bb76b';

export function nextSlots(slot, nextCount, count) {
  const wanted = nextCount < count ? [slot - 1, slot] : [slot, slot + 1];
  const clamped = wanted.map((s) => Math.min(nextCount - 1, Math.max(0, s)));
  return [...new Set(clamped)];
}

// Alle Vorlagen eines Gebiets in fester Reihenfolge.
export function layoutsOf(areaConfig) {
  return [{ layers: areaConfig.layers }, ...(areaConfig.moreLayouts ?? [])];
}

// Raum-Spezifikation für eine Tiefe: unter fromDepth gilt fallback.
export function specAt(spec, depth) {
  return spec.fromDepth !== undefined && depth < spec.fromDepth ? specAt(spec.fallback, depth) : spec;
}

// Gegnergruppen eines Kampfraums für eine Tiefe.
export function groupsAt(spec, depth) {
  return [...(spec.pool ?? []), ...(spec.deepPools ?? []).filter((p) => p.fromDepth <= depth).flatMap((p) => p.groups)];
}

// config wird für die Boss-Begegnungen (bosses.json) gebraucht.
// Vorratskammer (Phase 9, Etappe 8): Der späteste Schatz- oder Ereignisraum wird zum Ruheplatz (bei gleicher
// Schicht der mit dem kleinsten Platz). Ohne solchen Raum bleibt die Karte gleich. Kennungen und Wege bleiben.
export function addExtraRest(map) {
  const pick = map.rooms.filter((r) => r.type === 'treasure' || r.type === 'event')
    .sort((a, b) => (b.layer - a.layer) || (a.slot - b.slot))[0];
  return {
    ...map,
    rooms: map.rooms.map((r) => (r === pick ? { id: r.id, layer: r.layer, slot: r.slot, type: 'rest', next: r.next.slice() } : r)),
  };
}

export function generateMap(areaConfig, seed, config, depth = 1) {
  const rng = createRng(deriveSeed(seed, 'map'));
  const layouts = layoutsOf(areaConfig);
  const layout = layouts.length > 1 ? rng.nextInt(0, layouts.length - 1) : 0;
  const layers = layouts[layout].layers.map((layer, li) => layer.rooms.map((raw, si) => {
    const spec = specAt(raw, depth);
    const type = spec.type ?? rng.pick(spec.choices);
    const room = { id: `r${li}-${si}`, layer: li, slot: si, type, next: [] };
    // Ereignisraum mit Pool (Phase 9): Gegner für die Option „fight“
    if (type === 'combat' || type === 'elite' || (type === 'event' && spec.pool)) {
      room.enemies = rng.pick(groupsAt(spec, depth)).slice();
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
  return { rooms: layers.flat(), start: layers[0].map((r) => r.id), layout };
}

// Alle Wege vom Start bis zum letzten Raum, als Listen von Räumen.
export function pathsOf(map) {
  const byId = Object.fromEntries(map.rooms.map((r) => [r.id, r]));
  const out = [];
  const walk = (id, path) => {
    const p = [...path, byId[id]];
    if (byId[id].next.length === 0) { out.push(p); return; }
    for (const n of byId[id].next) walk(n, p);
  };
  for (const s of map.start) walk(s, []);
  return out;
}
