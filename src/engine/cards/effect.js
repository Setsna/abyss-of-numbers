// Kartenstufen (Phase 5, Etappe 8, M38 ohne Verschmelzen): Stufe 1 ist die Wirkung aus
// cards.json, Stufe 2 und 3 überschreiben einzelne Werte aus "upgrades" (upgrades[0] = Stufe 2).

export function maxCardLevel(def) {
  return 1 + (def?.upgrades?.length ?? 0);
}

export function cardEffect(def, level = 1) {
  const upto = Math.min(Math.max(1, level), maxCardLevel(def)) - 1;
  let effect = def.effect;
  for (let i = 0; i < upto; i++) effect = { ...effect, ...def.upgrades[i] };
  return effect;
}
