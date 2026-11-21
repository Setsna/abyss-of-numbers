// Lokaler Speicher für den Spielstand. Einzige Stelle, die den Stand aus Text liest.
// Ein ungültiger Stand wird nicht gelöscht, sondern unter "<Schlüssel>.defekt" aufbewahrt.
// Ein Stand aus einer NEUEREN Fassung des Spiels (höhere Versionsnummer) ist nicht defekt: Dieses Gerät hat
// nur noch die ältere Fassung geladen. Er bleibt unberührt, Status "newer" (Update-Sicherheit, 20.11.2026).
import { validateSave, migrateSave, repairSave, SAVE_VERSION } from '../engine/save/save.js?v=b0dbf0d6';

export const STORAGE_KEY = 'abyss-of-numbers-v1';
const BROKEN_KEY = `${STORAGE_KEY}.defekt`;

// Was nach dem Laden geschehen darf:
//   'play'    spielen (auch ohne Stand oder ohne Speicher),
//   'reload'  der Stand stammt aus einer neueren Fassung: Seite neu laden, kein neues Spiel,
//   'blocked' der Stand im gemeinsamen Konto lässt sich nicht lesen: kein neues Spiel, denn ein neuer Held
//             würde den Stand in der Datenbank überschreiben. Ohne Konto (nur auf dem eigenen Rechner) bleibt
//             es beim alten Verhalten: neu anfangen, die Kopie liegt unter "<Schlüssel>.defekt".
export function loadVerdict(status, hasAccount) {
  if (status === 'newer') return 'reload';
  if (status === 'corrupt' && hasAccount) return 'blocked';
  return 'play';
}

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
      if (Number.isInteger(parsed?.version) && parsed.version > SAVE_VERSION) return { save: null, status: 'newer' };
      let save;
      let notes;
      try {
        ({ save, notes } = migrateSave(parsed, config));
        // Reparieren statt ablehnen: Leben 0 und ein unpassendes offenes Rätsel (siehe repairSave)
        notes = [...notes, ...repairSave(save, config)];
        if (validateSave(save, config).length > 0) throw new Error('ungültig');
      } catch {
        keepBroken(raw);
        return { save: null, status: 'corrupt' };
      }
      return { save, status: 'ok', notes };
    },
    // Schreibt nie einen Stand, den das Spiel beim nächsten Laden ablehnen würde (zweite Durchsicht, 20.11.2026):
    // Ein Fehler im Spiel soll höchstens den Fortschritt seit dem letzten gültigen Stand kosten, nicht den Stand.
    write(save) {
      try {
        let raw = JSON.stringify(save);
        const copy = JSON.parse(raw);
        let errors = validateSave(copy, config);
        // Eine fehlerhafte Zählung der Lernübersicht kostet nur die Zählung, nie den Spielstand (Review Phase 10, Etappe 1).
        // Jeder andere Fehler: nichts schreiben, der letzte gültige Stand bleibt liegen.
        if (errors.length > 0 && errors.every((e) => e.startsWith('statistik'))) {
          delete copy.statistik;
          raw = JSON.stringify(copy);
          errors = validateSave(copy, config);
        }
        if (errors.length > 0) return false;
        backend.setItem(STORAGE_KEY, raw);
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
