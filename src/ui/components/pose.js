// Kampfposen der Helden (D36, Weg 2; 18.11.2026): reine Rechnungen ohne Browser, damit sie testbar sind
// und in Godot gleich nachgebaut werden können.
//
// Ein Posenbild (Angriff, Treffer) liegt kurz über dem Grundbild. Es ist im selben Maßstab gezeichnet wie
// das Grundbild (gleiche Pixel je Figur), seine Hüfte sitzt genau in der Bildmitte, die Füße am unteren Rand.
// Die Hüfte des Grundbilds steht als Anteil der Breite in den Heldendaten (poseAnchor).

// base: angezeigte Lage des Grundbilds {left, bottom, width, height}; baseNatural/poseNatural: Pixelmaße
export function poseBox(base, baseNatural, poseNatural, anchor = 0.5) {
  const scale = base.height / baseNatural.height;
  const width = poseNatural.width * scale;
  const height = poseNatural.height * scale;
  return { left: base.left + anchor * base.width - width / 2, bottom: base.bottom, width, height };
}

// Weg, den eine Figur läuft, bis sie den Gegner erreicht. dir 1 = nach rechts, -1 = nach links.
// overlap: Anteil der Zielbreite, den die Figur in das Ziel hineinläuft (sie soll es berühren, nicht davor halten).
export function dashDistance(mover, target, dir = 1, overlap = 0.2) {
  const width = target.right - target.left;
  const gap = dir === 1 ? target.left - mover.right : mover.left - target.right;
  return dir * Math.max(0, gap + overlap * width);
}
