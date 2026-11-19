// Tiefenstufen und Seesterne (Phase 9, Jahresausbau; Konzept docs/superpowers/specs/2026-11-19-jahresausbau-design.md,
// Abschnitt 7 und 9). Reine Rechenregeln ohne Spielzustand; Werte aus config/progression/depths.json.
// Die Tiefe macht nur den Kampf schwerer, nie die Aufgaben (Konzept 15).

const round2 = (x) => Math.round(x * 100) / 100;

// Faktor für Leben und Angriff der Gegner: Tiefe 1 = 1, je Tiefe darüber + enemyPerDepth.
export function depthPower(depth, depths) {
  return round2(1 + depths.enemyPerDepth * (depth - 1));
}

// Faktor für Erfahrung und Perlen im Kampf.
export function rewardFactor(depth, depths) {
  return round2(1 + depths.rewardPerDepth * (depth - 1));
}

// Seesterne = Summe der geschafften Tiefen über alle Gebiete. Sie werden nicht gespeichert und nicht ausgegeben.
export function starCount(save) {
  return Object.values(save.gebiete ?? {}).reduce((sum, g) => sum + (Number.isInteger(g?.tiefe) ? g.tiefe : 0), 0);
}

// Höchste wählbare Tiefe eines Gebiets: eine über der geschafften.
export function openDepths(save, areaId) {
  return (save.gebiete?.[areaId]?.tiefe ?? 0) + 1;
}

// Gebiete in der Reihenfolge der Konfiguration, die noch nicht offen sind und deren Preis erreicht ist.
// Offen bleibt offen: Wer schon offen ist, taucht hier nie auf (Konzept 9).
export function areasToOpen(save, config) {
  const stars = starCount(save);
  return config.areas.order.filter((id) => {
    const area = config.areas.areas[id];
    return !save.gebiete?.[id]?.offen && !area.comingSoon && area.price <= stars;
  });
}
