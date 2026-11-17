// Asset-Manager: Im Code stehen nur Schlüssel ("enemy.crab"), die Pfade in assets/manifest.json.
// Fehlt ein Bild, erscheint ein Platzhalter mit dem Namen (Alt-Text) als Beschriftung, sonst dem Schlüssel.

let manifest = {};

export function setManifest(m) {
  manifest = m ?? {};
}

export function assetUrl(key) {
  return manifest[key] ?? null;
}

function placeholder(key, label) {
  const d = document.createElement('div');
  d.className = 'ph';
  d.textContent = label || key;
  d.dataset.key = key;
  return d;
}

export function renderAsset(key, altText = '') {
  const src = assetUrl(key);
  if (!src) return placeholder(key, altText);
  const img = new Image();
  img.src = src;
  img.alt = altText;
  img.decoding = 'async';
  img.draggable = false;
  img.addEventListener('error', () => img.replaceWith(placeholder(key, altText)), { once: true });
  return img;
}
