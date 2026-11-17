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
