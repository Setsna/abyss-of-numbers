// Lädt alle Konfigurationsdateien. fetchJson(pfad) bekommt den Pfad relativ zu game/config/.
import { CONFIG_FILES } from '../engine/config/files.js?v=2a306128';

export async function loadConfig(fetchJson) {
  const entries = await Promise.all(
    Object.entries(CONFIG_FILES).map(async ([key, path]) => [key, await fetchJson(path)]),
  );
  return Object.fromEntries(entries);
}

export function browserFetchJson(base = 'config/') {
  return async (path) => {
    const res = await fetch(base + path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  };
}
