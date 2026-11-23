/* Modèle de données des annotations, fabrique, hit-testing et manipulations géométriques. */

import { borner01, echelleReference } from '../pdf/coordonnees.js';

export const TYPES_ANNOTATIONS = [
  'stylo',
  'surligneur',
  'rectangle',
  'ellipse',
  'fleche',
  'texte',
  'note'
];

export function genererIdAnnotation() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function creerAnnotation(type, props) {
  const maintenant = new Date().toISOString();
  return {
    id: genererIdAnnotation(),
    type,
    page: props.page || 1,
    couleur: props.couleur || '#a777ff',
    creeLe: maintenant,
    modifieLe: maintenant,
    ...props
  };
}

/* Découpe un texte multi-lignes selon une largeur maximale, avec mesure fournie (Canvas ou pdf-lib). */
export function decouperLignesTexte(texte, largeurMax, mesurerLargeur) {
  const paragraphes = String(texte || '').replace(/\r\n/g, '\n').split('\n');
  const lignes = [];

  for (const para of paragraphes) {
    if (!para) {
      lignes.push('');
      continue;
    }
    const mots = para.split(/\s+/);
    let ligneCourante = '';

    for (const mot of mots) {
      if (!mot) continue;
      const candidat = ligneCourante ? `${ligneCourante} ${mot}` : mot;
      if (mesurerLargeur(candidat) <= largeurMax || !ligneCourante) {
        if (mesurerLargeur(candidat) > largeurMax && !ligneCourante) {
          /* Mot plus large que la boîte : découpe caractère par caractère */
          let morceau = '';
          for (const ch of mot) {
            if (mesurerLargeur(morceau + ch) > largeurMax && morceau) {
              lignes.push(morceau);
              morceau = ch;
            } else {
              morceau += ch;
            }
          }
          ligneCourante = morceau;
        } else {
          ligneCourante = candidat;
        }
      } else {
        lignes.push(ligneCourante);
        ligneCourante = mot;
      }
    }
    if (ligneCourante) {
      lignes.push(ligneCourante);
    }
  }

  return lignes.length ? lignes : [''];
}

/* Numérotation déterministe de toutes les notes (1, 2, 3...) ordonnées par page puis position. */
export function indexerNotes(annotations) {
  const notes = annotations
    .filter((a) => a.type === 'note')
    .slice()
    .sort((a, b) => (a.page - b.page) || (a.y - b.y) || (a.x - b.x));
  const map = new Map();
  notes.forEach((note, index) => {
    map.set(note.id, index + 1);
  });
  return map;
}

/* Boîte englobante normalisée { x, y, w, h } pour sélection et affichage des poignées. */
export function boiteEnglobante(ann, largeurCss = 800, hauteurCss = 1130) {
  switch (ann.type) {
    case 'stylo': {
      const pts = ann.points || [];
      if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = 1;
      let minY = 1;
      let maxX = 0;
      let maxY = 0;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return {
        x: minX,
        y: minY,
        w: Math.max(0.015, maxX - minX),
        h: Math.max(0.015, maxY - minY)
      };
    }
    case 'fleche': {
      const minX = Math.min(ann.x1, ann.x2);
      const minY = Math.min(ann.y1, ann.y2);
      return {
        x: minX,
        y: minY,
        w: Math.max(0.015, Math.abs(ann.x2 - ann.x1)),
        h: Math.max(0.015, Math.abs(ann.y2 - ann.y1))
      };
    }
    case 'note': {
      const rX = 16 / Math.max(1, largeurCss);
      const rY = 16 / Math.max(1, hauteurCss);
      return {
        x: borner01(ann.x - rX),
        y: borner01(ann.y - rY),
        w: rX * 2,
        h: rY * 2
      };
    }
    case 'texte': {
      const echelle = echelleReference(largeurCss);
      const hauteurLigne = (ann.taillePolice || 18) * echelle * 1.3;
      const nbLignesEstime = Math.max(1, String(ann.contenu || '').split('\n').length);
      const hMin = (nbLignesEstime * hauteurLigne + 10) / Math.max(1, hauteurCss);
      return {
        x: ann.x,
        y: ann.y,
        w: Math.max(0.06, ann.w || 0.28),
        h: Math.max(hMin, ann.h || 0.05)
      };
    }
    case 'surligneur':
    case 'rectangle':
    case 'ellipse':
    default:
      return {
        x: ann.x,
        y: ann.y,
        w: ann.w,
        h: ann.h
      };
  }
}

function distancePointSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/* Teste si le point (xn, yn) touche une annotation donnée. */
export function testerPointAnnotation(ann, xn, yn, largeurCss, hauteurCss) {
  const tolX = 14 / Math.max(1, largeurCss);
  const tolY = 14 / Math.max(1, hauteurCss);
  const tol = Math.max(tolX, tolY);

  if (ann.type === 'note') {
    const dx = (xn - ann.x) * largeurCss;
    const dy = (yn - ann.y) * hauteurCss;
    return Math.hypot(dx, dy) <= 24;
  }

  if (ann.type === 'fleche') {
    return distancePointSegment(xn, yn, ann.x1, ann.y1, ann.x2, ann.y2) <= tol;
  }

  if (ann.type === 'stylo') {
    const pts = ann.points || [];
    if (pts.length === 1) {
      return Math.hypot(xn - pts[0].x, yn - pts[0].y) <= tol;
    }
    for (let i = 1; i < pts.length; i += 1) {
      if (distancePointSegment(xn, yn, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= tol) {
        return true;
      }
    }
    return false;
  }

  const boite = boiteEnglobante(ann, largeurCss, hauteurCss);
  return (
    xn >= boite.x - tolX &&
    xn <= boite.x + boite.w + tolX &&
    yn >= boite.y - tolY &&
    yn <= boite.y + boite.h + tolY
  );
}

/* Retourne la liste des poignées interactives de l'annotation sélectionnée. */
export function obtenirPoigneesAnnotation(ann, largeurCss, hauteurCss) {
  if (!ann) return [];
  if (ann.type === 'fleche') {
    return [
      { id: 'p1', x: ann.x1, y: ann.y1 },
      { id: 'p2', x: ann.x2, y: ann.y2 }
    ];
  }
  if (ann.type === 'surligneur' || ann.type === 'rectangle' || ann.type === 'ellipse' || ann.type === 'texte') {
    const b = boiteEnglobante(ann, largeurCss, hauteurCss);
    return [
      { id: 'tl', x: b.x, y: b.y },
      { id: 'br', x: b.x + b.w, y: b.y + b.h }
    ];
  }
  return [];
}

export function testerPoigneeAnnotation(ann, xn, yn, largeurCss, hauteurCss) {
  const poignees = obtenirPoigneesAnnotation(ann, largeurCss, hauteurCss);
  for (const p of poignees) {
    const dx = (xn - p.x) * largeurCss;
    const dy = (yn - p.y) * hauteurCss;
    if (Math.hypot(dx, dy) <= 18) {
      return p.id;
    }
  }
  return null;
}

export function deplacerAnnotation(ann, dx, dy) {
  if (ann.type === 'stylo') {
    const pts = ann.points || [];
    return {
      ...ann,
      points: pts.map((p) => ({
        x: borner01(p.x + dx),
        y: borner01(p.y + dy)
      }))
    };
  }
  if (ann.type === 'fleche') {
    return {
      ...ann,
      x1: borner01(ann.x1 + dx),
      y1: borner01(ann.y1 + dy),
      x2: borner01(ann.x2 + dx),
      y2: borner01(ann.y2 + dy)
    };
  }
  if (ann.type === 'note') {
    return {
      ...ann,
      x: borner01(ann.x + dx),
      y: borner01(ann.y + dy)
    };
  }
  return {
    ...ann,
    x: borner01(Math.min(1 - (ann.w || 0.05), ann.x + dx)),
    y: borner01(Math.min(1 - (ann.h || 0.03), ann.y + dy))
  };
}

export function redimensionnerAnnotation(ann, poignee, xn, yn) {
  const cx = borner01(xn);
  const cy = borner01(yn);
  if (ann.type === 'fleche') {
    if (poignee === 'p1') return { ...ann, x1: cx, y1: cy };
    if (poignee === 'p2') return { ...ann, x2: cx, y2: cy };
    return ann;
  }

  const minTaille = 0.02;
  if (poignee === 'br') {
    return {
      ...ann,
      w: Math.max(minTaille, cx - ann.x),
      h: Math.max(minTaille, cy - ann.y)
    };
  }
  if (poignee === 'tl') {
    const droite = ann.x + ann.w;
    const bas = ann.y + ann.h;
    const nouveauX = Math.min(cx, droite - minTaille);
    const nouveauY = Math.min(cy, bas - minTaille);
    return {
      ...ann,
      x: nouveauX,
      y: nouveauY,
      w: droite - nouveauX,
      h: bas - nouveauY
    };
  }
  return ann;
}
