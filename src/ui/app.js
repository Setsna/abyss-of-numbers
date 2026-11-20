// Gemeinsame Abläufe der Oberfläche.

// Spielt Ereignisse nacheinander ab: Für jedes Ereignis wird handlers[event.type]
// aufgerufen und abgewartet. Unbekannte Ereignisse werden übersprungen.
// onEach (Etappe 9): wird vor jedem Ereignis aufgerufen, zum Beispiel für den passenden Klang.
export async function playEvents(events, handlers, onEach = null) {
  for (const event of events) {
    onEach?.(event);
    const handler = handlers[event.type];
    if (handler) await handler(event);
  }
}

// Ereignisse, nach denen die App mitten im Kampf sofort speichert (Abschlussreview Phase 10, Etappe 4, I1):
// Rettung und Zweite Luft sind je Tauchgang einmal; ohne Speichern gäbe es sie nach dem Neuladen noch einmal.
// missionDone (Etappe 5): Belohnung und „geschafft“ des Tagesauftrags überstehen ein Neuladen mitten im Kampf.
const SAVE_NOW = new Set(['rescueStarted', 'secondWind', 'missionDone']);
export function needsSave(events) {
  return events.some((e) => SAVE_NOW.has(e.type));
}

// Weniger Bewegung: Geräteeinstellung oder Schalter ?calm=1 (Klasse is-calm am body).
export function isCalm() {
  return document.body.classList.contains('is-calm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, isCalm() ? Math.min(ms, 120) : ms));
}

// Entwicklerzugang (?dev=…) nur auf dem eigenen Rechner.
export function isLocalHost(hostname = location.hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}
