/* Rendu vectoriel 2D de toutes les annotations sur le canevas superposé au PDF. */

import { echelleReference, normaliseVersCanvas } from '../pdf/coordonnees.js';
import {
  boiteEnglobante,
  decouperLignesTexte,
  indexerNotes,
  obtenirPoigneesAnnotation
} from './modele.js';

function couleurRgba(hex, alpha) {
  const propre = String(hex || '#a777ff').replace('#', '');
  if (propre.length !== 6) return `rgba(167, 119, 255, ${alpha})`;
  const r = parseInt(propre.slice(0, 2), 16);
  const g = parseInt(propre.slice(2, 4), 16);
  const b = parseInt(propre.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function dessinerStylo(ctx, ann, largeurCss, hauteurCss) {
  const pts = ann.points || [];
  if (!pts.length) return;
  const echelle = echelleReference(largeurCss);

  ctx.save();
  ctx.strokeStyle = ann.couleur;
  ctx.lineWidth = Math.max(1.5, (ann.epaisseur || 4) * echelle);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  const p0 = normaliseVersCanvas(pts[0].x, pts[0].y, largeurCss, hauteurCss);
  ctx.moveTo(p0.x, p0.y);

  if (pts.length === 1) {
    ctx.lineTo(p0.x + 0.01, p0.y + 0.01);
  } else {
    for (let i = 1; i < pts.length - 1; i += 1) {
      const p1 = normaliseVersCanvas(pts[i].x, pts[i].y, largeurCss, hauteurCss);
      const p2 = normaliseVersCanvas(pts[i + 1].x, pts[i + 1].y, largeurCss, hauteurCss);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
    }
    const dernier = normaliseVersCanvas(pts[pts.length - 1].x, pts[pts.length - 1].y, largeurCss, hauteurCss);
    ctx.lineTo(dernier.x, dernier.y);
  }
  ctx.stroke();
  ctx.restore();
}

function dessinerSurligneur(ctx, ann, largeurCss, hauteurCss) {
  ctx.save();
  ctx.fillStyle = couleurRgba(ann.couleur, 0.36);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillRect(
    ann.x * largeurCss,
    ann.y * hauteurCss,
    ann.w * largeurCss,
    ann.h * hauteurCss
  );
  ctx.restore();
}

function dessinerRectangle(ctx, ann, largeurCss, hauteurCss) {
  const echelle = echelleReference(largeurCss);
  ctx.save();
  ctx.strokeStyle = ann.couleur;
  ctx.lineWidth = Math.max(1.5, (ann.epaisseur || 4) * echelle);
  ctx.lineJoin = 'round';
  ctx.strokeRect(
    ann.x * largeurCss,
    ann.y * hauteurCss,
    ann.w * largeurCss,
    ann.h * hauteurCss
  );
  ctx.restore();
}

function dessinerEllipse(ctx, ann, largeurCss, hauteurCss) {
  const echelle = echelleReference(largeurCss);
  const cx = (ann.x + ann.w / 2) * largeurCss;
  const cy = (ann.y + ann.h / 2) * hauteurCss;
  const rx = Math.max(1, (ann.w * largeurCss) / 2);
  const ry = Math.max(1, (ann.h * hauteurCss) / 2);

  ctx.save();
  ctx.strokeStyle = ann.couleur;
  ctx.lineWidth = Math.max(1.5, (ann.epaisseur || 4) * echelle);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function dessinerFleche(ctx, ann, largeurCss, hauteurCss) {
  const echelle = echelleReference(largeurCss);
  const x1 = ann.x1 * largeurCss;
  const y1 = ann.y1 * hauteurCss;
  const x2 = ann.x2 * largeurCss;
  const y2 = ann.y2 * hauteurCss;
  const ep = Math.max(1.5, (ann.epaisseur || 4) * echelle);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const longueurTete = Math.max(12, ep * 3.4);
  const ouverture = Math.PI / 6;

  ctx.save();
  ctx.strokeStyle = ann.couleur;
  ctx.fillStyle = ann.couleur;
  ctx.lineWidth = ep;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - Math.cos(angle) * (longueurTete * 0.65), y2 - Math.sin(angle) * (longueurTete * 0.65));
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - longueurTete * Math.cos(angle - ouverture),
    y2 - longueurTete * Math.sin(angle - ouverture)
  );
  ctx.lineTo(
    x2 - longueurTete * Math.cos(angle + ouverture),
    y2 - longueurTete * Math.sin(angle + ouverture)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function dessinerTexte(ctx, ann, largeurCss, hauteurCss, estSelectionne) {
  const echelle = echelleReference(largeurCss);
  const taille = Math.max(10, (ann.taillePolice || 18) * echelle);
  const x = ann.x * largeurCss;
  const y = ann.y * hauteurCss;
  const w = Math.max(40, (ann.w || 0.28) * largeurCss);
  const marge = 6 * echelle;
  const hauteurLigne = taille * 1.28;

  ctx.save();
  const graisse = ann.gras ? '700' : '400';
  ctx.font = `${graisse} ${taille}px Helvetica, Arial, sans-serif`;
  ctx.textBaseline = 'top';

  const lignes = decouperLignesTexte(
    ann.contenu || '',
    Math.max(24, w - marge * 2),
    (s) => ctx.measureText(s).width
  );

  if (estSelectionne) {
    const hBoite = Math.max((ann.h || 0.05) * hauteurCss, lignes.length * hauteurLigne + marge * 2);
    ctx.fillStyle = 'rgba(20, 17, 29, 0.08)';
    ctx.fillRect(x, y, w, hBoite);
  }

  ctx.fillStyle = ann.couleur;
  lignes.forEach((ligne, idx) => {
    ctx.fillText(ligne, x + marge, y + marge + idx * hauteurLigne);
  });
  ctx.restore();
}

function dessinerNote(ctx, ann, numero, largeurCss, hauteurCss, estSelectionne) {
  const cx = ann.x * largeurCss;
  const cy = ann.y * hauteurCss;
  const rayon = 14;

  ctx.save();
  ctx.shadowColor = 'rgba(10, 7, 18, 0.45)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  ctx.fillStyle = ann.couleur;
  ctx.beginPath();
  ctx.arc(cx, cy, rayon, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#14111d';
  ctx.stroke();

  ctx.fillStyle = ann.couleur === '#ffe066' || ann.couleur === '#ffffff' ? '#14111d' : '#ffffff';
  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(numero), cx, cy + 0.5);

  if (estSelectionne) {
    const resume = (ann.titre ? `${ann.titre} — ` : '') + (ann.contenu || '');
    const texteCourt = resume.length > 52 ? `${resume.slice(0, 50)}…` : resume;
    if (texteCourt) {
      ctx.font = '600 12px "Oxanium", sans-serif';
      const largeurBulle = Math.min(260, ctx.measureText(texteCourt).width + 20);
      const bx = Math.min(largeurCss - largeurBulle - 6, Math.max(6, cx + 20));
      const by = Math.max(6, cy - 16);
      ctx.fillStyle = '#1d1929';
      ctx.strokeStyle = '#a777ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(bx, by, largeurBulle, 30, 8);
      } else {
        ctx.rect(bx, by, largeurBulle, 30);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#e9e4f2';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(texteCourt, bx + 10, by + 15, largeurBulle - 20);
    }
  }
  ctx.restore();
}

function dessinerSelection(ctx, ann, largeurCss, hauteurCss) {
  const boite = boiteEnglobante(ann, largeurCss, hauteurCss);
  const x = boite.x * largeurCss - 5;
  const y = boite.y * hauteurCss - 5;
  const w = boite.w * largeurCss + 10;
  const h = boite.h * hauteurCss + 10;

  ctx.save();
  ctx.strokeStyle = '#a777ff';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  const poignees = obtenirPoigneesAnnotation(ann, largeurCss, hauteurCss);
  for (const p of poignees) {
    const px = p.x * largeurCss;
    const py = p.y * hauteurCss;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#a777ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function redessinerCalqueAnnotations(
  canvasAnnotations,
  toutesAnnotations,
  pageCourante,
  selectionId,
  dimensions,
  brouillon = null
) {
  if (!dimensions) return;
  const { largeurCss, hauteurCss, dpr } = dimensions;

  const largeurPhys = Math.max(1, Math.round(largeurCss * dpr));
  const hauteurPhys = Math.max(1, Math.round(hauteurCss * dpr));
  if (canvasAnnotations.width !== largeurPhys || canvasAnnotations.height !== hauteurPhys) {
    canvasAnnotations.width = largeurPhys;
    canvasAnnotations.height = hauteurPhys;
  }
  canvasAnnotations.style.width = `${largeurCss}px`;
  canvasAnnotations.style.height = `${hauteurCss}px`;

  const ctx = canvasAnnotations.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, largeurCss, hauteurCss);

  const indexNotes = indexerNotes(toutesAnnotations);
  const annotationsPage = toutesAnnotations.filter((a) => a.page === pageCourante);
  const liste = brouillon ? [...annotationsPage, brouillon] : annotationsPage;

  for (const ann of liste) {
    const estSel = ann.id === selectionId;
    switch (ann.type) {
      case 'stylo':
        dessinerStylo(ctx, ann, largeurCss, hauteurCss);
        break;
      case 'surligneur':
        dessinerSurligneur(ctx, ann, largeurCss, hauteurCss);
        break;
      case 'rectangle':
        dessinerRectangle(ctx, ann, largeurCss, hauteurCss);
        break;
      case 'ellipse':
        dessinerEllipse(ctx, ann, largeurCss, hauteurCss);
        break;
      case 'fleche':
        dessinerFleche(ctx, ann, largeurCss, hauteurCss);
        break;
      case 'texte':
        dessinerTexte(ctx, ann, largeurCss, hauteurCss, estSel);
        break;
      case 'note':
        dessinerNote(ctx, ann, indexNotes.get(ann.id) || '?', largeurCss, hauteurCss, estSel);
        break;
      default:
        break;
    }

    if (estSel && !brouillon) {
      dessinerSelection(ctx, ann, largeurCss, hauteurCss);
    }
  }
}
