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
