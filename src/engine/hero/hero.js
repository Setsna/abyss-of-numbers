// Werte des Helden (Konzept 10): Kraft, Ruhe, Leben. Punkte kommen aus den Stufen
// und lassen sich jederzeit neu verteilen. Seit Phase 5, Etappe 7 dazu die Stärke der Figur
// (heroes.json, perk) und angelegte Ausrüstung (items.json); heroStats fasst alles zusammen.

export const STATS = ['kraft', 'ruhe', 'leben'];
export const SLOTS = ['kopf', 'koerper', 'hand'];
// Wirkungsschlüssel aus heroes.json (perk) und items.json (effect)
export const EFFECT_KEYS = ['maxHp', 'strength', 'calmMs', 'startBlock', 'healBonus', 'discards', 'extraPearls',
  // Talente (Phase 9, Etappe 3)
  'firstTurnEnergy', 'healAfterWin', 'streakMaxBonus', 'restHealShare', 'secondWind', 'handSize'];
export const TALENT_LEVELS = ['5', '10', '15', '20'];

// Wirkung eines gewählten Talents (oder null).
export function talentEffect(level, id, config) {
  return config.talents?.[level]?.find((x) => x.id === id)?.effect ?? null;
}

export function heroStats(save, config) {
  const g = config.game;
  const bonus = Object.fromEntries(EFFECT_KEYS.map((k) => [k, 0]));
  const add = (effect) => { for (const [k, v] of Object.entries(effect ?? {})) bonus[k] += v; };
  add(config.heroes.figures[save.held.figur]?.perk);
  for (const id of Object.values(save.ausruestung?.angelegt ?? {})) if (id) add(config.items?.[id]?.effect);
  for (const [level, id] of Object.entries(save.talente ?? {})) if (id && save.stufe >= Number(level)) add(talentEffect(level, id, config));
  return {
    maxHp: g.hero.maxHp + save.punkte.leben * g.stats.hpPerPoint + bonus.maxHp,
    strength: save.punkte.kraft + bonus.strength,
    // Ruhe in Punkten: jeder Punkt eine Sekunde (stats.calmMsPerPoint)
    calm: save.punkte.ruhe + bonus.calmMs / g.stats.calmMsPerPoint,
    startBlock: bonus.startBlock,
    healBonus: bonus.healBonus,
    discards: g.hero.discardsPerTurn + bonus.discards,
    extraPearls: bonus.extraPearls,
    firstTurnEnergy: bonus.firstTurnEnergy,
    healAfterWin: bonus.healAfterWin,
    streakMaxBonus: bonus.streakMaxBonus,
    restHealShare: Math.min(1, bonus.restHealShare),
    secondWind: bonus.secondWind,
    handSize: g.hero.handSize + bonus.handSize,
  };
}

export function maxHp(save, config) {
  return heroStats(save, config).maxHp;
}

export function freePoints(save, config) {
  const earned = (save.stufe - 1) * config.levels.pointsPerLevel;
  const spent = STATS.reduce((sum, k) => sum + save.punkte[k], 0);
  return Math.max(0, earned - spent);
}

export function spendPoint(save, stat, config) {
  if (!STATS.includes(stat) || freePoints(save, config) <= 0) return false;
  if (save.punkte[stat] >= (config.levels.maxPointsPerStat ?? Infinity)) return false; // Deckel (Phase 9, Konzept 10)
  save.punkte[stat] += 1;
  return true;
}

export function resetPoints(save) {
  for (const k of STATS) save.punkte[k] = 0;
}

// Name aus zwei Wortlisten (Konzept 10), zum Beispiel „Mutiger Rochen“. Keine freie Eingabe.
export function heroName(save, config) {
  const { nameA, nameB } = config.heroes;
  return `${nameA[save.held.nameA]} ${nameB[save.held.nameB]}`;
}
