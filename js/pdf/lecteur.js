/* Lecteur PDF hors-ligne basé sur PDF.js (rendu haute netteté, zoom tablette, miniatures). */

import * as pdfjsLib from '../../vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  '../../vendor/pdfjs/pdf.worker.min.mjs',
  import.meta.url
).href;

let documentActif = null;
let tacheRenduEnCours = null;

export async function chargerPdfDepuisOctets(pdfBytes) {
  if (documentActif) {
    try {
      await documentActif.destroy();
    } catch {
      /* Nettoyage silencieux de l'ancien document */
    }
    documentActif = null;
  }

  /* On passe une copie (.slice()) afin que le worker PDF.js ne détache jamais le buffer conservé dans le store. */
  const tache = pdfjsLib.getDocument({
    data: pdfBytes.slice(),
    isEvalSupported: false,
    useSystemFonts: true
  });

  documentActif = await tache.promise;
  return {
    nbPages: documentActif.numPages
  };
}

export function obtenirDocumentActif() {
  return documentActif;
}

export async function calculerZoomAdapte(numPage, mode, largeurConteneur, hauteurConteneur) {
  if (!documentActif) return 1;
  const page = await documentActif.getPage(numPage);
  const viewportBase = page.getViewport({ scale: 1 });
  const largeurDispo = Math.max(240, (largeurConteneur || 800) - 44);
  const hauteurDispo = Math.max(240, (hauteurConteneur || 600) - 44);

  if (mode === 'largeur') {
    return largeurDispo / viewportBase.width;
  }
  if (mode === 'page') {
    return Math.min(largeurDispo / viewportBase.width, hauteurDispo / viewportBase.height);
  }
  return 1;
}

export async function rendrePage(numPage, canvasPdf, zoom) {
  if (!documentActif) return null;

  if (tacheRenduEnCours) {
    try {
      tacheRenduEnCours.cancel();
    } catch {
      /* Annulation du rendu précédent si un zoom/changement de page arrive vite */
    }
    tacheRenduEnCours = null;
  }

  const page = await documentActif.getPage(numPage);
  const viewportCss = page.getViewport({ scale: zoom });
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const viewportRendu = page.getViewport({ scale: zoom * dpr });

  const largeurCss = Math.max(1, Math.round(viewportCss.width));
  const hauteurCss = Math.max(1, Math.round(viewportCss.height));

  canvasPdf.width = Math.max(1, Math.round(viewportRendu.width));
  canvasPdf.height = Math.max(1, Math.round(viewportRendu.height));
  canvasPdf.style.width = `${largeurCss}px`;
  canvasPdf.style.height = `${hauteurCss}px`;

  const contexte = canvasPdf.getContext('2d', { alpha: false });
  tacheRenduEnCours = page.render({
    canvasContext: contexte,
    viewport: viewportRendu
  });

  try {
    await tacheRenduEnCours.promise;
  } catch (err) {
    if (err && err.name === 'RenderingCancelledException') {
      return null;
    }
    throw err;
  } finally {
    tacheRenduEnCours = null;
  }

  return {
    largeurCss,
    hauteurCss,
    dpr
  };
}

export async function rendreMiniature(numPage, canvasMini, largeurCible = 136) {
  if (!documentActif) return;
  const page = await documentActif.getPage(numPage);
  const viewportBase = page.getViewport({ scale: 1 });
  const echelle = largeurCible / viewportBase.width;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const viewport = page.getViewport({ scale: echelle * dpr });

  canvasMini.width = Math.max(1, Math.round(viewport.width));
  canvasMini.height = Math.max(1, Math.round(viewport.height));
  canvasMini.style.width = `${Math.round(viewportBase.width * echelle)}px`;
  canvasMini.style.height = `${Math.round(viewportBase.height * echelle)}px`;

  const contexte = canvasMini.getContext('2d', { alpha: false });
  await page.render({
    canvasContext: contexte,
    viewport
  }).promise;
}

/* Génère un PDF d'exemple de 2 pages 100 % hors-ligne via pdf-lib pour tester immédiatement l'application. */
export async function creerPdfDemonstration() {
  if (!window.PDFLib) {
    throw new Error('La bibliothèque pdf-lib n\'est pas encore prête.');
  }
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const policeTitre = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const policeTexte = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const violet = rgb(0.32, 0.19, 0.56);
  const encre = rgb(0.12, 0.1, 0.18);
  const gris = rgb(0.38, 0.35, 0.45);
  const fondEncart = rgb(0.95, 0.94, 0.98);

  const page1 = pdfDoc.addPage([595.28, 841.89]);
  page1.drawRectangle({ x: 42, y: 745, width: 511, height: 54, color: violet });
  page1.drawText('OMNI-PDF - DOCUMENT DE DEMONSTRATION', {
    x: 58,
    y: 766,
    size: 16,
    font: policeTitre,
    color: rgb(1, 1, 1)
  });

  page1.drawText('Bienvenue dans ton espace de travail PDF hors-ligne (Omni-Systeme)', {
    x: 42,
    y: 705,
    size: 14,
    font: policeTitre,
    color: encre
  });

  const paragraphes = [
    'Ce fichier a ete genere localement dans ton navigateur, sans aucune connexion.',
    'Tu peux tester librement tous les outils sur ces deux pages :',
    '- Stylo : trace librement au doigt ou au stylet (active "Stylet seul" si besoin).',
    '- Surligneur : mets en valeur une phrase ou une zone importante.',
    '- Formes : trace des rectangles, ellipses et fleches redimensionnables.',
    '- Texte & Note : ajoute des blocs de texte et des commentaires numerotes.',
    '- Selection : deplace, redimensionne, modifie ou supprime une annotation.'
  ];

  let y = 665;
  for (const ligne of paragraphes) {
    page1.drawText(ligne, { x: 42, y, size: 11.5, font: policeTexte, color: encre });
    y -= 24;
  }

  page1.drawRectangle({
    x: 42,
    y: 355,
    width: 511,
    height: 115,
    color: fondEncart,
    borderColor: violet,
    borderWidth: 1.5
  });
  page1.drawText('Zone d\'essai : surligne cette ligne ou depose une note ici !', {
    x: 60,
    y: 432,
    size: 12,
    font: policeTitre,
    color: violet
  });
  page1.drawText('Exporte ensuite le PDF ou sauvegarde ton etat complet en JSON.', {
    x: 60,
    y: 404,
    size: 11,
    font: policeTexte,
    color: gris
  });

  page1.drawText('Page 1 / 2 - Omni-Systeme', { x: 42, y: 40, size: 10, font: policeTexte, color: gris });

  const page2 = pdfDoc.addPage([595.28, 841.89]);
  page2.drawText('Page 2 : Schema libre et prise de notes', {
    x: 42,
    y: 780,
    size: 16,
    font: policeTitre,
    color: violet
  });
  page2.drawText('Utilise la barre du bas ou les miniatures pour naviguer entre les pages.', {
    x: 42,
    y: 750,
    size: 11.5,
    font: policeTexte,
    color: encre
  });

  /* Grille légere d'exercice */
  for (let gx = 42; gx <= 553; gx += 42.5) {
    page2.drawLine({
      start: { x: gx, y: 120 },
      end: { x: gx, y: 710 },
      thickness: 0.5,
      color: rgb(0.88, 0.87, 0.92)
    });
  }
  for (let gy = 120; gy <= 710; gy += 42.5) {
    page2.drawLine({
      start: { x: 42, y: gy },
      end: { x: 553, y: gy },
      thickness: 0.5,
      color: rgb(0.88, 0.87, 0.92)
    });
  }
  page2.drawText('Page 2 / 2 - Omni-Systeme', { x: 42, y: 40, size: 10, font: policeTexte, color: gris });

  const octets = await pdfDoc.save();
  return new Uint8Array(octets);
}
