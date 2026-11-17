// Zeitmesser ohne Browserbezug: die Uhr wird übergeben (im Browser performance.now).
// pause() und resume() dürfen mehrfach kommen; verdeckte Zeit zählt nicht.

export function createTimer({ limitMs, now }) {
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
    },
  };
}
