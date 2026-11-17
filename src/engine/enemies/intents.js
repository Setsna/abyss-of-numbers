// Absichten der Gegner: ein festes Muster, das sich wiederholt (Konzept 7.3).

export function intentFor(enemy) {
  const step = enemy.pattern[enemy.patternIndex % enemy.pattern.length];
  return { type: step.type, amount: step.amount };
}

export function advancePattern(enemy) {
  enemy.patternIndex = (enemy.patternIndex + 1) % enemy.pattern.length;
}
