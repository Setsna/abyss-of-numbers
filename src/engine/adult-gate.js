// Sperre vor dem Erwachsenenbereich (Phase 4, Etappe 8; geändert in Phase 5, Etappe 1, D26):
// Eine Zahl von 10 000 bis 99 999 steht in Worten da und muss als Ziffern eingetippt werden.
// Kinder der Klasse 3 rechnen bis 1000, Erwachsene brauchen dafür Sekunden. Das ist nur eine
// Hürde gegen versehentliches Tippen; ab dem Firebase-Anschluss (Etappe 10) ziehen Zurücksetzen
// und „Mehr Zeit“ in den Lehrerbereich mit Google-Anmeldung. Die Zahlwörter sind Teil der Regel, keine
// Spieltexte, deshalb stehen sie hier und nicht in de.json.

const ONES = ['', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];
const TEENS = ['zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

function belowHundred(n) {
  if (n === 0) return '';
  if (n === 1) return 'eins';
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t] : `${ONES[o]}und${TENS[t]}`;
}

function belowThousand(n) {
  const h = Math.floor(n / 100);
  return `${h > 0 ? `${ONES[h]}hundert` : ''}${belowHundred(n % 100)}`;
}

export function numberToGermanWords(n) {
  if (!Number.isInteger(n) || n < 1 || n > 99999) throw new Error(`nur ganze Zahlen von 1 bis 99 999: ${n}`);
  if (n === 1) return 'eins';
  const th = Math.floor(n / 1000);
  const rest = belowThousand(n % 1000);
  if (th === 0) return belowThousand(n);
  const thWord = th === 1 ? 'ein' : belowHundred(th);
  return `${thWord}tausend${rest}`;
}

export const GATE_DIGITS = 5;

export function createGateChallenge(rng) {
  const n = rng.nextInt(10000, 99999);
  return { words: numberToGermanWords(n), digits: String(n) };
}
