// Gemeinsames Konto der Lernlagune (Phase 5, Etappe 10; Spec docs/10-konto-umbau-spec.md, D37).
// Das Kind meldet sich mit seinem Perlentaucher-Code an. Sein Spielstand liegt im Browser (konto-speicher.js,
// ein Eintrag je Code) und wird im Hintergrund mit an_stand/<code> in Firebase abgeglichen (konto-cloud.js).
// Die drei Baukasten-Module sind klassische Skripte und stehen in index.html vor main.js (window.LagunenKonto).
//
// Der Stand in an_stand/<code>:
//   spielstand  der ganze Spielstand aus engine/save/save.js als Text (JSON), höchstens 20 000 Zeichen
//   angelegt, geaendert  Zeitstempel (ms)
// Kein Name. Ob der Spielstand stimmt, prüft storage.js beim Laden (validateSave, migrateSave).
//
// Zusammenführen: Hat dieses Gerät seit dem letzten Abgleich gespielt, gilt sein Spielstand, sonst der aus der
// Datenbank (hierGeaendert). Ein Spielstand lässt sich nicht Feld für Feld vereinigen.

export const COLLECTION = 'an_stand';
// Schlüssel im Lehrerbereich des Perlentauchers (oeffentlich/plattformen, Plattform-Freigabe seit 21.11.2026).
// Steht dort abyss: false, meldet konto-cloud.js nach der Code-Eingabe { ok: false, zu: true } (Testkind ausgenommen).
export const FREIGABE = 'abyss';
export const MAX_SAVE_CHARS = 20000;
export const LOCAL_KEY = 'abyss-of-numbers-v2'; // Name der Einträge in konto-speicher.js (v1 = Stand ohne Konto)

const text = (x) => (typeof x === 'string' && x.length > 0 && x.length <= MAX_SAVE_CHARS ? x : '');

// Reine Funktionen, A = LagunenKonto.abgleich (getestet in tests/account.test.js).
export function accountRules(A) {
  const normalisiere = (roh) => ({ spielstand: text(A.karte(roh).spielstand) });

  function mische(basis, lokal, fern) {
    const b = A.karte(basis), l = A.karte(lokal), f = A.karte(fern);
    const aus = {
      spielstand: A.hierGeaendert(text(b.spielstand), text(l.spielstand), text(f.spielstand), (x) => x !== '') || '',
      geaendert: A.spaeter(l.geaendert, f.geaendert),
    };
    const angelegt = A.frueher(l.angelegt, f.angelegt);
    if (angelegt) aus.angelegt = angelegt;
    return aus;
  }

  // Nach dem Zurücksetzen durch die Lehrkraft: leer anfangen (das Spiel beginnt mit der Klassenwahl).
  const neuanfang = (lokal, jetzt) => ({ spielstand: '', angelegt: jetzt, geaendert: jetzt });

  // Bildet den Regel-Block an_stand nach (anStandGueltig, docs/10-regel-block-an_stand.md) für die Attrappe.
  // Wird ZUSAMMEN mit dem Regel-Block geändert.
  const gueltig = (d) => A.istObjekt(d)
    && Object.keys(d).every((k) => ['spielstand', 'angelegt', 'geaendert'].includes(k))
    && ['spielstand', 'angelegt', 'geaendert'].every((k) => k in d)
    && typeof d.geaendert === 'number' && d.geaendert >= 0
    && typeof d.angelegt === 'number'
    && typeof d.spielstand === 'string' && d.spielstand.length <= MAX_SAVE_CHARS;

  return { normalisiere, mische, neuanfang, gueltig };
}

// Brücke für storage.js: Der Eintrag STORAGE_KEY landet im Feld spielstand des angemeldeten Kindes,
// alles andere (z. B. ein beiseitegelegter defekter Stand) bleibt nur auf dem Gerät.
export function accountBackend(S, storageKey, local) {
  return {
    getItem(key) {
      if (key !== storageKey) return local.getItem(key);
      const k = S.aktiv();
      if (!k) throw new Error('nicht angemeldet');
      return k.spielstand || null;
    },
    setItem(key, value) {
      if (key !== storageKey) { local.setItem(key, value); return; }
      const k = S.aktiv();
      if (!k) throw new Error('nicht angemeldet');
      if (String(value).length > MAX_SAVE_CHARS) throw new Error('Spielstand zu groß');
      k.spielstand = String(value);
      if (!S.speichern()) throw new Error('Speichern auf dem Gerät fehlgeschlagen');
    },
    removeItem(key) {
      if (key !== storageKey) { local.removeItem(key); return; }
      const k = S.aktiv();
      if (k) { k.spielstand = ''; S.speichern(); }
    },
  };
}

// Speicher und Cloud-Modul einrichten. LK = window.LagunenKonto.
export function createAccount(LK, firebase) {
  const rules = accountRules(LK.abgleich);
  const S = LK.speicher({
    schluessel: LOCAL_KEY,
    leer: () => ({ spielstand: '' }),
    normalisiere: rules.normalisiere,
    mische: rules.mische,
  });
  const cloud = LK.cloud({
    firebase,
    sammlung: COLLECTION,
    speicher: S,
    mische: rules.mische,
    neuanfang: rules.neuanfang,
    freigabe: FREIGABE,
  });
  return { S, cloud, rules };
}
