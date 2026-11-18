// Lokaler Speicher für den Spielstand. Einzige Stelle, die den Stand aus Text liest.
// Ein ungültiger Stand wird nicht gelöscht, sondern unter "<Schlüssel>.defekt" aufbewahrt.
import { validateSave, migrateSave } from '../engine/save/save.js?v=a8133bc4';

export const STORAGE_KEY = 'abyss-of-numbers-v1';
const BROKEN_KEY = `${STORAGE_KEY}.defekt`;

export function createStorage(backend, config) {
  function keepBroken(raw) {
    try { backend.setItem(BROKEN_KEY, raw); } catch { /* Speicher voll: nichts zu machen */ }
  }

  return {
    load() {
      let raw;
      try {
        raw = backend.getItem(STORAGE_KEY);
      } catch {
        return { save: null, status: 'unavailable' };
      }
      if (raw === null || raw === undefined) return { save: null, status: 'empty' };
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        keepBroken(raw);
        return { save: null, status: 'corrupt' };
      }
      const { save, notes } = migrateSave(parsed, config);
      if (validateSave(save, config).length > 0) {
        keepBroken(raw);
        return { save: null, status: 'corrupt' };
      }
      return { save, status: 'ok', notes };
    },
    write(save) {
      try {
        backend.setItem(STORAGE_KEY, JSON.stringify(save));
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      try { backend.removeItem(STORAGE_KEY); } catch { /* nichts zu tun */ }
    },
  };
}
