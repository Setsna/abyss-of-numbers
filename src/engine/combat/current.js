// Mitwachsende Gegner, im Spiel „Strömung“ (D33, nach Ingos Probespiel 17.11.2026).
// Nach jedem gewonnenen Kampf zählen die letzten `recentAnswers` Antworten des Tauchgangs:
// fast fehlerfrei UND überwiegend schnell → eine Stufe stärker; viele Fehler → eine Stufe schwächer.
// Langsam, aber richtig → bleibt. Gegner bekommen Leben und Angriff × Strömung.
// Konfiguration: game.json → current. Vorläufige Fassung; Phase 6a verfeinert die Anpassung (A5).

// Antwort aus dem Ereignis answerJudged: s = schnell richtig, r = richtig ohne Tempo-Bonus, f = falsch/Zeit abgelaufen.
export function answerCode({ outcome, tierId }) {
  if (outcome !== 'correct') return 'f';
  return tierId === 'lightning' || tierId === 'fast' ? 's' : 'r';
}

const round2 = (x) => Math.round(x * 100) / 100;

export function nextCurrent(level, answers, cfg) {
  const recent = answers.slice(-cfg.recentAnswers);
  if (recent.length < cfg.minAnswers) return level;
  const correct = recent.filter((a) => a !== 'f').length / recent.length;
  const fast = recent.filter((a) => a === 's').length / recent.length;
  if (correct >= cfg.upAccuracy && fast > cfg.upFastShare) return round2(Math.min(cfg.max, level + cfg.step));
  if (correct < cfg.downAccuracy) return round2(Math.max(cfg.min, level - cfg.step));
  return level;
}
