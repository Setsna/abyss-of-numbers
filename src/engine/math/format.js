// Schreibweise von Aufgaben: Zeichen wie im Unterricht (Plan, Allgemeine Vorgaben).
export const OPERATOR_SIGN = { add: '+', sub: '−', mul: '·', div: ':' };

// Zahlen ab 10 000 in Dreiergruppen mit Schmal-Leerzeichen (U+202F), wie im Buch: 323 000, 1 000 000.
// Bis 9999 ohne Trenner (Phase 6b, Etappe 6; Regelwerk 6).
export function formatNumber(n) {
  if (!Number.isInteger(n) || Math.abs(n) < 10000) return String(n);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
}

export function formatExpression(operation, a, b) {
  return `${formatNumber(a)} ${OPERATOR_SIGN[operation]} ${formatNumber(b)}`;
}

export function formatEquation(operation, a, b, result) {
  return `${formatExpression(operation, a, b)} = ${formatNumber(result)}`;
}
