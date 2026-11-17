// Schreibweise von Aufgaben: Zeichen wie im Unterricht (Plan, Allgemeine Vorgaben).
export const OPERATOR_SIGN = { add: '+', sub: '−', mul: '·', div: ':' };

export function formatExpression(operation, a, b) {
  return `${a} ${OPERATOR_SIGN[operation]} ${b}`;
}

export function formatEquation(operation, a, b, result) {
  return `${formatExpression(operation, a, b)} = ${result}`;
}
