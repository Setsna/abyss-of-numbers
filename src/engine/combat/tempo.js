// Zeit und Tempo-Bonus (Konzept 7.2, Architektur 6.4).
// Grenzen werden ganzzahlig verglichen: Stufe erreicht, wenn elapsedMs · den <= timeLimitMs · num.

export function judgeTempo(elapsedMs, timeLimitMs, tempoConfig) {
  if (timeLimitMs === 0) return { result: 'ok', tierId: 'normal', multiplier: 1 };
  if (elapsedMs >= timeLimitMs) return { result: 'timeout', tierId: null, multiplier: 0 };
  for (const tier of tempoConfig.tiers) {
    if (elapsedMs * tier.den <= timeLimitMs * tier.num) {
      return { result: 'ok', tierId: tier.id, multiplier: tier.multiplier };
    }
  }
  return { result: 'ok', tierId: 'normal', multiplier: 1 };
}

// Auf eine ganze Zahl gerundet, ab ,5 nach oben. Gerechnet in Zehnteln, damit 7 · 1,5 sicher 11 ergibt.
export function applyMultiplier(base, multiplier) {
  const tenths = Math.round(multiplier * 10);
  return Math.floor((base * tenths + 5) / 10);
}

// 0 heißt: ohne Zeitleiste.
// timeClass: Zeitklasse der Leiterstufe (Phase 6b, Regelwerk A-7); ohne sie die Grundzeit des Formats
// extraMs: Zusatzzeit der Stufe (Klasse 4, Zahlen über 10 000: 5 Sekunden mehr)
export function timeLimitFor(format, calm, moreTime, gameConfig, timeClass = null, extraMs = 0) {
  const factor = gameConfig.moreTime[moreTime];
  if (factor === undefined) throw new Error(`unbekannte Einstellung Mehr Zeit: ${moreTime}`);
  if (factor === 0) return 0;
  const base = timeClass ? gameConfig.timeClassMs[timeClass] : gameConfig.baseTimeMs[format];
  if (base === undefined) throw new Error(`keine Grundzeit für ${timeClass ?? format}`);
  return Math.round((base + extraMs + calm * gameConfig.stats.calmMsPerPoint) * factor);
}
