// Zeitleiste über der Aufgabe: drei farbige Abschnitte, kein roter Bereich.
// Takt per setInterval (läuft gleichmäßig), hält an, solange die Seite verdeckt ist.
import { createTimer } from '../timer.js?v=dc004222';

export function startTimerBar({ root, fill, limitMs, onTimeout }) {
  root.hidden = limitMs === 0;
  fill.style.width = '0%';
  const timer = createTimer({ limitMs, now: () => performance.now() });
  if (document.visibilityState !== 'visible') timer.pause();
  let stopped = false;

  const onVisibility = () => {
    if (document.visibilityState === 'visible') timer.resume();
    else timer.pause();
  };
  const tick = () => {
    if (stopped || !limitMs) return;
    const f = timer.fraction();
    fill.style.width = `${f * 100}%`;
    if (f >= 1) { stop(); onTimeout(); }
  };
  const id = limitMs ? setInterval(tick, 50) : null;
  document.addEventListener('visibilitychange', onVisibility);

  function stop() {
    if (stopped) return;
    stopped = true;
    if (id) clearInterval(id);
    document.removeEventListener('visibilitychange', onVisibility);
  }

  return {
    stop,
    elapsedMs: () => Math.round(timer.elapsedMs()),
  };
}
