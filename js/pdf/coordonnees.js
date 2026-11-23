/* Conversions entre coordonnées écran/tablette, repère normalisé [0..1] et points PDF natifs. */

export const LARGEUR_REFERENCE = 800;

export function borner01(valeur) {
  return Math.min(1, Math.max(0, valeur));
}

/* Convertit une position pointeur client (viewport) en coordonnées normalisées [0..1] sur la page. */
export function clientVersNormalise(clientX, clientY, elementCanevas) {
  const rect = elementCanevas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return { x: 0, y: 0 };
  }
  return {
    x: borner01((clientX - rect.left) / rect.width),
    y: borner01((clientY - rect.top) / rect.height)
  };
}

/* Convertit une coordonnée normalisée en pixels CSS du canevas. */
export function normaliseVersCanvas(xn, yn, largeurCss, hauteurCss) {
  return {
    x: xn * largeurCss,
    y: yn * hauteurCss
  };
}

/* Facteur d'échelle proportionnel à la largeur de page pour garder la même épaisseur écran / PDF. */
export function echelleReference(largeurVisuelle) {
  return (largeurVisuelle || LARGEUR_REFERENCE) / LARGEUR_REFERENCE;
}

/* Normalise l'angle de rotation d'une page PDF dans {0, 90, 180, 270}. */
export function normaliserRotationPdf(angle) {
  const mod = ((Math.round(angle || 0) % 360) + 360) % 360;
  if (mod === 90 || mod === 180 || mod === 270) return mod;
  return 0;
}

/* Dimensions visuelles d'une page PDF une fois sa rotation appliquée. */
export function dimensionsVisuellesPdf(cropBox, rotation) {
  const rot = normaliserRotationPdf(rotation);
  if (rot === 90 || rot === 270) {
    return { largeur: cropBox.height, hauteur: cropBox.width, rotation: rot };
  }
  return { largeur: cropBox.width, hauteur: cropBox.height, rotation: rot };
}

/*
 * Projette un point normalisé visuel (x: 0 gauche -> 1 droite, y: 0 haut -> 1 bas)
 * vers les coordonnées natives PDF (origine en bas à gauche de la page non tournée).
 */
export function normVersPdf(xn, yn, cropBox, rotation = 0) {
  const rot = normaliserRotationPdf(rotation);
  const { x, y, width, height } = cropBox;

  switch (rot) {
    case 90:
      return {
        x: x + yn * width,
        y: y + xn * height
      };
    case 180:
      return {
        x: x + (1 - xn) * width,
        y: y + yn * height
      };
    case 270:
      return {
        x: x + (1 - yn) * width,
        y: y + (1 - xn) * height
      };
    case 0:
    default:
      return {
        x: x + xn * width,
        y: y + (1 - yn) * height
      };
  }
}

/* Projette un rectangle normalisé visuel vers la boîte [minX, minY, maxX, maxY] en coordonnées PDF natives. */
export function boiteNormVersPdf(xn, yn, wn, hn, cropBox, rotation = 0) {
  const p1 = normVersPdf(xn, yn, cropBox, rotation);
  const p2 = normVersPdf(xn + wn, yn + hn, cropBox, rotation);
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}
