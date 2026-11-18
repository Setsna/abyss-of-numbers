// Spieltexte aus config/texts/de.json. Schlüssel mit Punkten ("cards.whirlpool.name"),
// Platzhalter in geschweiften Klammern ("{n} Schaden"). Fehlt ein Text: "⟦schlüssel⟧".

export function createText(texts) {
  return function t(key, vars = {}) {
    const value = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), texts);
    if (typeof value !== 'string') return `⟦${key}⟧`;
    return value.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  };
}

let current = createText({});

export function setTexts(texts) {
  current = createText(texts);
}

export function t(key, vars) {
  return current(key, vars);
}

// Rechenweg nach einem Fehler als Satz (Phase 6b, Regelwerk 8.1): way = { key, parts } oder null
// Rechnungen mit festen Leerzeichen, damit „76 + 9 = 85“ nie umbricht (Phase 7a, D47); der Satz hat
// selbst einen Zeilenwechsel (zwei Zeilen: „Erst …,“ / „dann ….“)
export function wayText(tt, way) {
  if (!way) return null;
  return tt(`way.${way.key}`, Object.fromEntries(way.parts.map((p, i) => [i, p.replaceAll(' ', ' ')])));
}

// Satz über der richtigen Rechnung (Regelwerk 8.2): mit Fehlertyp nur dessen Hinweis (Phase 7a, D47:
// ohne „So stimmt es:“), beim Übergang mit der Stelle aus dem Spielkern (place: 10, 100 …);
// ohne Fehlertyp der bisherige Satz (askKey, zum Beispiel ask.wrong)
export function hintAsk(tt, mistakeType, askKey, place = null) {
  if (!mistakeType) return tt(askKey);
  return tt(`mistake.${mistakeType}`, { stelle: tt(`place.${place ?? 'next'}`) });
}
