// Spielwelt hinter den Menüs (Phase 5, Etappe 9, D25): das gemalte Gebietsbild füllt den
// Bildschirm, das Menüpanel liegt darauf. Fehlt ein Bild, bleibt der Grund papierweiß
// (ein gestreifter Platzhalter über den ganzen Bildschirm wäre zu unruhig).
import { renderAsset, assetUrl } from '../assets.js?v=2a306128';

// Gebiet, das hinter Station und Menüs steht: der laufende Tauchgang, sonst das tiefste
// offene, spielbare Gebiet, sonst das erste Gebiet.
export function homeAreaId(config, profile, run) {
  if (run?.areaId) return run.areaId;
  const open = (profile?.areas ?? []).filter((a) => a.open && !a.comingSoon).map((a) => a.id);
  return open.at(-1) ?? config.areas.order[0];
}

export function worldLayer(key, className = 'world-bg') {
  const bg = document.createElement('div');
  bg.className = className;
  bg.setAttribute('aria-hidden', 'true');
  if (assetUrl(key)) bg.append(renderAsset(key, ''));
  return bg;
}

// Legt das Bild hinter einen Menübildschirm (<main class="screen …">).
export function addWorld(screen, key) {
  screen.classList.add('is-world');
  screen.prepend(worldLayer(key));
}

// Boss eines Gebiets: der letzte Gegner der Boss-Begegnung (beim Kraken der Körper).
export function bossOfArea(config, areaId) {
  const area = config.areas.areas[areaId];
  for (const layer of area?.layers ?? []) {
    for (const room of layer.rooms ?? []) {
      if (room.type === 'boss' || room.choices?.includes('boss')) return config.bosses.encounters[room.encounter]?.at(-1) ?? null;
    }
  }
  return null;
}
