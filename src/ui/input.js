// Eingaben: nur Tippen. Tastatur am Desktop als Zusatz (1 bis 4, Eingabe).
// Doppeltipp-Zoom verhindert touch-action: manipulation im CSS (base.css).
// Gibt eine Funktion zum Abmelden zurück.

export function bindKeys(map) {
  const onKey = (e) => {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    const fn = map[e.key];
    // Liefert die Funktion false, bleibt die Taste beim fokussierten Knopf (z. B. Eingabe auf „Zug beenden“).
    if (fn && fn() !== false) e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
