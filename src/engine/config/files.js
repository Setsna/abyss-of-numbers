// Alle Konfigurationsdateien: Schlüssel → Pfad relativ zu game/config/.
// Jede Etappe ergänzt hier ihre Dateien.
export const CONFIG_FILES = {
  game: 'game.json',
  texts: 'texts/de.json',
  class3: 'curricula/class3.json',
  class4: 'curricula/class4.json',
  cards: 'cards/cards.json',
  decks: 'cards/decks.json',
  enemies: 'enemies/enemies.json',
  bosses: 'enemies/bosses.json',
  elites: 'enemies/elites.json', // Elitegegner (Phase 9, Etappe 2)
  areas: 'dungeons/areas.json',
  events: 'dungeons/events.json', // Ereignisräume (Phase 9, Etappe 2)
  riddles: 'dungeons/riddles.json', // Rätselraum im Tempel (Phase 9, Etappe 7)
  levels: 'progression/levels.json',
  rewards: 'progression/rewards.json',
  depths: 'progression/depths.json', // Jahresausbau (Phase 9)
  station: 'progression/station.json', // Station ausbauen (Phase 9, Etappe 8)
  heroes: 'heroes/heroes.json',
  talents: 'heroes/talents.json', // Talente (Phase 9, Etappe 3)
  items: 'items/items.json',
  sounds: 'audio/sounds.json',
};
