/* Export PDF standard via pdf-lib : intègre toutes les annotations de façon vectorielle et universelle. */

import { decouperLignesTexte, indexerNotes } from '../annotations/modele.js';
import {
  boiteNormVersPdf,
  dimensionsVisuellesPdf,
  echelleReference,
  normVersPdf
} from './coordonnees.js';

const CARACTERES_CP1252_ETENDUS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

function hexVersRgb(hex) {
  const propre = String(hex || '#a777ff').replace('#', '');
  if (propre.length !== 6) return { r: 0.65, g: 0.47, b: 1 };
  const r = parseInt(propre.slice(0, 2), 16) / 255;
  const g = parseInt(propre.slice(2, 4), 16) / 255;
  const b = parseInt(propre.slice(4, 6), 16) / 255;
  return { r, g, b };
}

/* Assure l'encodage WinAnsi sans jamais faire échouer pdf-lib sur un caractère exotique ou espace fin. */
export function assainirTexteWinAnsi(texte) {
  const normalise = String(texte || '')
    .replace(/[\u00A0\u202F\u2007]/g, ' ')
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/↔/g, '<->');

  let resultat = '';
  for (const ch of normalise) {
    const code = ch.codePointAt(0);
    if (
      ch === '\n' ||
      ch === '\r' ||
      ch === '\t' ||
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff) ||
      CARACTERES_CP1252_ETENDUS.has(ch)
    ) {
      resultat += ch;
    } else {
      resultat += '?';
    }
  }
  return resultat;
}

function ajouterAnnotationNoteNative(pdfDoc, page, ann, numero, ptPdf, c) {
  const { PDFName, PDFString, PDFArray, PDFNumber, PDFBool } = window.PDFLib;
  const titre = assainirTexteWinAnsi(
    ann.titre ? `Note ${numero} - ${ann.titre}` : `Note ${numero}`
  );
  const contenu = assainirTexteWinAnsi(ann.contenu || '(Note vide)');

  const dict = pdfDoc.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Text'),
    Rect: [ptPdf.x - 10, ptPdf.y - 10, ptPdf.x + 10, ptPdf.y + 10],
    Contents: PDFString.of(contenu),
    T: PDFString.of(titre),
    Name: PDFName.of('Comment'),
    C: [PDFNumber.of(c.r), PDFNumber.of(c.g), PDFNumber.of(c.b)],
    Open: PDFBool.False
  });

  const ref = pdfDoc.context.register(dict);
  let annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (!annots) {
    annots = pdfDoc.context.obj([]);
    page.node.set(PDFName.of('Annots'), annots);
  }
  annots.push(ref);
}

function ajouterPagesRecapitulatives(pdfDoc, annotations, indexNotes, policeTitre, policeTexte) {
  const notes = annotations
    .filter((a) => a.type === 'note')
    .slice()
    .sort((a, b) => (a.page - b.page) || (a.y - b.y) || (a.x - b.x));

  if (!notes.length) return;

  const { rgb } = window.PDFLib;
  const largeurA4 = 595.28;
  const hauteurA4 = 841.89;
  const marge = 44;
  const largeurUtile = largeurA4 - marge * 2;
  const couleurTitre = rgb(0.32, 0.19, 0.56);
  const couleurEncre = rgb(0.12, 0.1, 0.18);
  const couleurDiscret = rgb(0.4, 0.37, 0.48);

  let page = pdfDoc.addPage([largeurA4, hauteurA4]);
  let y = hauteurA4 - 52;

  const dessinerEntetePage = (estSuite) => {
    page.drawText(
      assainirTexteWinAnsi(estSuite ? 'Notes et commentaires (suite)' : 'Notes et commentaires - Omni-PDF'),
      { x: marge, y, size: 16, font: policeTitre, color: couleurTitre }
    );
    y -= 10;
    page.drawLine({
      start: { x: marge, y },
      end: { x: largeurA4 - marge, y },
      thickness: 1,
      color: couleurTitre
    });
    y -= 24;
  };

  dessinerEntetePage(false);

  for (const note of notes) {
    const numero = indexNotes.get(note.id) || '?';
    const titre = assainirTexteWinAnsi(
      note.titre ? `Note #${numero} (page ${note.page}) - ${note.titre}` : `Note #${numero} (page ${note.page})`
    );
    const corps = assainirTexteWinAnsi(note.contenu || '(Aucun commentaire saisi)');
    const lignesCorps = decouperLignesTexte(corps, largeurUtile - 16, (s) =>
      policeTexte.widthOfTextAtSize(s, 10.5)
    );

    const hauteurBloc = 24 + lignesCorps.length * 14 + 14;
    if (y - hauteurBloc < 48) {
      page = pdfDoc.addPage([largeurA4, hauteurA4]);
      y = hauteurA4 - 52;
      dessinerEntetePage(true);
    }

    const c = hexVersRgb(note.couleur);
    page.drawRectangle({
      x: marge,
      y: y - hauteurBloc + 14,
      width: largeurUtile,
      height: hauteurBloc - 6,
      borderColor: rgb(c.r, c.g, c.b),
      borderWidth: 1,
      color: rgb(0.97, 0.96, 0.99)
    });

    page.drawText(titre, {
      x: marge + 10,
      y: y - 4,
      size: 11,
      font: policeTitre,
      color: couleurEncre
    });

    let yLigne = y - 22;
    for (const ligne of lignesCorps) {
      page.drawText(ligne, {
        x: marge + 10,
        y: yLigne,
        size: 10.5,
        font: policeTexte,
        color: couleurDiscret
      });
      yLigne -= 14;
    }

    y -= hauteurBloc + 10;
  }
}

export async function exporterPdfAnnote(pdfBytes, annotations, options = {}) {
  if (!window.PDFLib) {
    throw new Error('La bibliothèque pdf-lib n\'est pas chargée.');
  }

  const { PDFDocument, StandardFonts, rgb, degrees, LineCapStyle } = window.PDFLib;
  const pdfDoc = await PDFDocument.load(pdfBytes.slice(), { ignoreEncryption: false });
  const policeTexte = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const policeGras = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();
  const indexNotes = indexerNotes(annotations);

  for (let i = 0; i < pages.length; i += 1) {
    const numPage = i + 1;
    const annotationsPage = annotations.filter((a) => a.page === numPage);
    if (!annotationsPage.length) continue;

    const page = pages[i];
    const cropBox = page.getCropBox() || page.getMediaBox();
    const rot = page.getRotation().angle || 0;
    const visuel = dimensionsVisuellesPdf(cropBox, rot);
    const echelle = echelleReference(visuel.largeur);

    for (const ann of annotationsPage) {
      const c = hexVersRgb(ann.couleur);
      const couleurPdf = rgb(c.r, c.g, c.b);

      if (ann.type === 'surligneur') {
        const b = boiteNormVersPdf(ann.x, ann.y, ann.w, ann.h, cropBox, rot);
        page.drawRectangle({
          x: b.x,
          y: b.y,
          width: Math.max(1, b.width),
          height: Math.max(1, b.height),
          color: couleurPdf,
          opacity: 0.35
        });
        continue;
      }

      if (ann.type === 'rectangle') {
        const b = boiteNormVersPdf(ann.x, ann.y, ann.w, ann.h, cropBox, rot);
        page.drawRectangle({
          x: b.x,
          y: b.y,
          width: Math.max(1, b.width),
          height: Math.max(1, b.height),
          borderColor: couleurPdf,
          borderWidth: Math.max(1, (ann.epaisseur || 4) * echelle)
        });
        continue;
      }

      if (ann.type === 'ellipse') {
        const b = boiteNormVersPdf(ann.x, ann.y, ann.w, ann.h, cropBox, rot);
        page.drawEllipse({
          x: b.x + b.width / 2,
          y: b.y + b.height / 2,
          xScale: Math.max(1, b.width / 2),
          yScale: Math.max(1, b.height / 2),
          borderColor: couleurPdf,
          borderWidth: Math.max(1, (ann.epaisseur || 4) * echelle)
        });
        continue;
      }

      if (ann.type === 'fleche') {
        const p1 = normVersPdf(ann.x1, ann.y1, cropBox, rot);
        const p2 = normVersPdf(ann.x2, ann.y2, cropBox, rot);
        const ep = Math.max(1.2, (ann.epaisseur || 4) * echelle);
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const tete = Math.max(10, ep * 3.2);
        const ouv = Math.PI / 6;

        page.drawLine({
          start: p1,
          end: p2,
          thickness: ep,
          color: couleurPdf,
          lineCap: LineCapStyle.Round
        });
        page.drawLine({
          start: p2,
          end: { x: p2.x - tete * Math.cos(angle - ouv), y: p2.y - tete * Math.sin(angle - ouv) },
          thickness: ep,
          color: couleurPdf,
          lineCap: LineCapStyle.Round
        });
        page.drawLine({
          start: p2,
          end: { x: p2.x - tete * Math.cos(angle + ouv), y: p2.y - tete * Math.sin(angle + ouv) },
          thickness: ep,
          color: couleurPdf,
          lineCap: LineCapStyle.Round
        });
        continue;
      }

      if (ann.type === 'stylo') {
        const pts = ann.points || [];
        if (pts.length < 2) continue;
        const ep = Math.max(1.2, (ann.epaisseur || 4) * echelle);
        for (let k = 1; k < pts.length; k += 1) {
          const pA = normVersPdf(pts[k - 1].x, pts[k - 1].y, cropBox, rot);
          const pB = normVersPdf(pts[k].x, pts[k].y, cropBox, rot);
          page.drawLine({
            start: pA,
            end: pB,
            thickness: ep,
            color: couleurPdf,
            lineCap: LineCapStyle.Round
          });
        }
        continue;
      }

      if (ann.type === 'texte') {
        const taille = Math.max(8, (ann.taillePolice || 18) * echelle);
        const margeNormX = (6 * echelle) / visuel.largeur;
        const margeNormY = (6 * echelle) / visuel.hauteur;
        const largeurBlocPdf = Math.max(24, ((ann.w || 0.28) * visuel.largeur) - 12 * echelle);
        const contenuPropre = assainirTexteWinAnsi(ann.contenu || '');
        const lignes = decouperLignesTexte(contenuPropre, largeurBlocPdf, (s) =>
          policeGras.widthOfTextAtSize(s, taille)
        );
        const hauteurLigne = taille * 1.28;

        lignes.forEach((ligne, idx) => {
          const ynLigne = ann.y + margeNormY + (taille * 0.85 + idx * hauteurLigne) / visuel.hauteur;
          const ptPdf = normVersPdf(ann.x + margeNormX, ynLigne, cropBox, rot);
          page.drawText(ligne, {
            x: ptPdf.x,
            y: ptPdf.y,
            size: taille,
            font: policeGras,
            color: couleurPdf,
            rotate: degrees(visuel.rotation)
          });
        });
        continue;
      }

      if (ann.type === 'note') {
        const ptPdf = normVersPdf(ann.x, ann.y, cropBox, rot);
        const rayon = 10 * echelle;
        const numero = String(indexNotes.get(ann.id) || '?');

        page.drawCircle({
          x: ptPdf.x,
          y: ptPdf.y,
          size: rayon,
          color: couleurPdf,
          borderColor: rgb(0.08, 0.07, 0.11),
          borderWidth: 1.5 * echelle
        });

        const texteBlanc = ann.couleur !== '#ffe066' && ann.couleur !== '#ffffff';
        const tailleNum = 9.5 * echelle;
        const lNum = policeGras.widthOfTextAtSize(numero, tailleNum);
        const ptNum = normVersPdf(
          ann.x - (lNum / 2) / visuel.largeur,
          ann.y + (tailleNum * 0.35) / visuel.hauteur,
          cropBox,
          rot
        );
        page.drawText(numero, {
          x: ptNum.x,
          y: ptNum.y,
          size: tailleNum,
          font: policeGras,
          color: texteBlanc ? rgb(1, 1, 1) : rgb(0.08, 0.07, 0.11),
          rotate: degrees(visuel.rotation)
        });

        if (options.notesNatives !== false) {
          ajouterAnnotationNoteNative(pdfDoc, page, ann, numero, ptPdf, c);
        }
      }
    }
  }

  if (options.pageRecapNotes !== false) {
    ajouterPagesRecapitulatives(pdfDoc, annotations, indexNotes, policeGras, policeTexte);
  }

  const octetsFinaux = await pdfDoc.save();
  return new Uint8Array(octetsFinaux);
}

export function telechargerOctets(octets, nomFichier, typeMime) {
  const blob = new Blob([octets], { type: typeMime });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
