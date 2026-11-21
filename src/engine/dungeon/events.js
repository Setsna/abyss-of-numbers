// Ereignisräume (Phase 9, Jahresausbau Etappe 2; Konzept 8): ein Bild, zwei bis drei kurze Sätze, zwei Knöpfe.
// Die Wirkungen kommen aus einer festen Liste; ein Ereignis drückt die Leben nie unter 1 und nimmt nichts
// Dauerhaftes weg. Welches Ereignis kommt, entsteht aus dem Seed des Tauchgangs und der Raumkennung.
import { createRng, deriveSeed } from '../rng.js?v=b0dbf0d6';

// hp: ± Leben im Tauchgang · heal: Anteil der Höchstleben · pearls: ± Perlen (bei −n nur wählbar, wenn genug da sind)
// card: Beute 1 aus 3 · item: ein Gegenstand, den das Kind noch nicht hat · fight: Kampf mit den Gegnern des Raums, danach Beute plus bonusPearls
export const EFFECT_TYPES = ['hp', 'heal', 'pearls', 'card', 'item', 'fight'];

const hasFight = (ev) => ev.options.some((o) => o.effects.some((f) => f.type === 'fight'));

// Ereignis für einen Raum. withEnemies: ob der Raum Gegner hat (sonst keine Ereignisse mit Kampf).
// areaId: Ereignisse können sich mit "areas" auf Gebiete beschränken.
export function rollEvent(roomId, seed, config, areaId, withEnemies) {
  const ids = Object.keys(config.events).filter((id) => {
    const ev = config.events[id];
    return (!ev.areas || ev.areas.includes(areaId)) && (withEnemies || !hasFight(ev));
  });
  return createRng(deriveSeed(seed, `event:${roomId}`)).pick(ids);
}

// Kosten einer Option in Perlen (Summe der negativen pearls-Wirkungen, als positive Zahl).
export function optionCost(option) {
  return option.effects.filter((f) => f.type === 'pearls' && f.amount < 0).reduce((s, f) => s - f.amount, 0);
}
