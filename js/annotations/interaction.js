/* Gestion unifiée des gestes tactiles, stylet et souris (Pointer Events + pinch-to-zoom). */

import { borner01, clientVersNormalise } from '../pdf/coordonnees.js';
import {
  creerAnnotation,
  deplacerAnnotation,
  redimensionnerAnnotation,
  testerPoigneeAnnotation,
  testerPointAnnotation
} from './modele.js';

export function attacherInteractionsCanevas({
  canvasAnnotations,
  store,
  obtenirDimensions,
  surChangementBrouillon,
  surEditionDemandee,
  surPinchZoom
}) {
  const pointeursActifs = new Map();
  let pinchEtat = null;
  let actionActive = null;
  let dernierTap = { temps: 0, id: null, x: 0, y: 0 };

  function distanceEntrePointeurs() {
    const pts = [...pointeursActifs.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
  }

  function trouverAnnotationSousPoint(xn, yn, dims) {
    const liste = store.annotationsDeLaPage();
    for (let i = liste.length - 1; i >= 0; i -= 1) {
      if (testerPointAnnotation(liste[i], xn, yn, dims.largeurCss, dims.hauteurCss)) {
        return liste[i];
      }
    }
    return null;
  }

  function terminerActionEnCours() {
    actionActive = null;
    surChangementBrouillon(null);
  }

  canvasAnnotations.addEventListener('pointerdown', (e) => {
    const dims = obtenirDimensions();
    if (!dims || !store.etat.document.ouvert) return;

    pointeursActifs.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    /* Passage en zoom par pincement dès qu'un 2e doigt touche l'écran */
    if (pointeursActifs.size === 2) {
      terminerActionEnCours();
      pinchEtat = {
        distanceInitiale: Math.max(10, distanceEntrePointeurs()),
        zoomInitial: store.etat.vue.zoom
      };
      return;
    }

    if (pointeursActifs.size > 2) return;

    const { outilActif, couleur, epaisseur, taillePolice, styletUniquement } = store.etat.outil;
    if (outilActif !== 'selection' && styletUniquement && e.pointerType === 'touch') {
      return;
    }

    try {
      canvasAnnotations.setPointerCapture(e.pointerId);
    } catch {
      /* Certains environnements tactiles refusent la capture sur pointeur synthétique */
    }

    const pt = clientVersNormalise(e.clientX, e.clientY, canvasAnnotations);

    if (outilActif === 'selection') {
      const sel = store.trouverSelection();
      if (sel) {
        const poignee = testerPoigneeAnnotation(sel, pt.x, pt.y, dims.largeurCss, dims.hauteurCss);
        if (poignee) {
          actionActive = {
            mode: 'redimension',
            pointerId: e.pointerId,
            id: sel.id,
            poignee,
            aBouge: false
          };
          return;
        }
      }

      const touchee = trouverAnnotationSousPoint(pt.x, pt.y, dims);
      if (touchee) {
        const maintenant = performance.now();
        const estDoubleTap =
          dernierTap.id === touchee.id &&
          maintenant - dernierTap.temps < 340 &&
          Math.hypot(e.clientX - dernierTap.x, e.clientY - dernierTap.y) < 24;

        dernierTap = { temps: maintenant, id: touchee.id, x: e.clientX, y: e.clientY };
        store.selectionner(touchee.id);

        if (estDoubleTap && (touchee.type === 'texte' || touchee.type === 'note')) {
          surEditionDemandee({ mode: 'modifier', annotation: touchee });
          return;
        }

        actionActive = {
          mode: 'deplacement',
          pointerId: e.pointerId,
          id: touchee.id,
          dernierX: pt.x,
          dernierY: pt.y,
          aBouge: false
        };
      } else {
        store.selectionner(null);
      }
      return;
    }

    if (outilActif === 'texte' || outilActif === 'note') {
      const brouillon =
        outilActif === 'note'
          ? creerAnnotation('note', {
              page: store.etat.vue.pageCourante,
              couleur,
              x: pt.x,
              y: pt.y,
              titre: '',
              contenu: ''
            })
          : creerAnnotation('texte', {
              page: store.etat.vue.pageCourante,
              couleur,
              x: Math.min(pt.x, 0.72),
              y: Math.min(pt.y, 0.92),
              w: 0.28,
              h: 0.06,
              taillePolice,
              contenu: ''
            });
      surEditionDemandee({ mode: 'creer', annotation: brouillon });
      return;
    }

    if (outilActif === 'stylo') {
      const brouillon = creerAnnotation('stylo', {
        page: store.etat.vue.pageCourante,
        couleur,
        epaisseur,
        points: [{ x: pt.x, y: pt.y }]
      });
      actionActive = { mode: 'dessin', pointerId: e.pointerId, brouillon };
      surChangementBrouillon(brouillon);
      return;
    }

    if (outilActif === 'fleche') {
      const brouillon = creerAnnotation('fleche', {
        page: store.etat.vue.pageCourante,
        couleur,
        epaisseur,
        x1: pt.x,
        y1: pt.y,
        x2: pt.x,
        y2: pt.y
      });
      actionActive = { mode: 'dessin', pointerId: e.pointerId, brouillon };
      surChangementBrouillon(brouillon);
      return;
    }

    if (outilActif === 'surligneur' || outilActif === 'rectangle' || outilActif === 'ellipse') {
      const brouillon = creerAnnotation(outilActif, {
        page: store.etat.vue.pageCourante,
        couleur,
        epaisseur: outilActif === 'surligneur' ? 0 : epaisseur,
        x: pt.x,
        y: pt.y,
        w: 0,
        h: 0,
        origineX: pt.x,
        origineY: pt.y
      });
      actionActive = { mode: 'dessin', pointerId: e.pointerId, brouillon };
      surChangementBrouillon(brouillon);
    }
  });

  canvasAnnotations.addEventListener('pointermove', (e) => {
    if (pointeursActifs.has(e.pointerId)) {
      pointeursActifs.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    }

    if (pinchEtat && pointeursActifs.size === 2) {
      const dist = distanceEntrePointeurs();
      const facteur = dist / pinchEtat.distanceInitiale;
      surPinchZoom(pinchEtat.zoomInitial * facteur);
      return;
    }

    if (!actionActive || actionActive.pointerId !== e.pointerId) return;
    const dims = obtenirDimensions();
    if (!dims) return;

    const pt = clientVersNormalise(e.clientX, e.clientY, canvasAnnotations);

    if (actionActive.mode === 'deplacement') {
      const dx = pt.x - actionActive.dernierX;
      const dy = pt.y - actionActive.dernierY;
      if (Math.abs(dx) < 0.0005 && Math.abs(dy) < 0.0005) return;
      const cible = store.trouverSelection();
      if (!cible) return;
      const deplacee = deplacerAnnotation(cible, dx, dy);
      actionActive.dernierX = pt.x;
      actionActive.dernierY = pt.y;
      actionActive.aBouge = true;
      store.modifierAnnotation(cible.id, deplacee, false);
      return;
    }

    if (actionActive.mode === 'redimension') {
      const cible = store.trouverSelection();
      if (!cible) return;
      const redim = redimensionnerAnnotation(cible, actionActive.poignee, pt.x, pt.y);
      actionActive.aBouge = true;
      store.modifierAnnotation(cible.id, redim, false);
      return;
    }

    if (actionActive.mode === 'dessin') {
      const b = actionActive.brouillon;
      if (b.type === 'stylo') {
        const dernier = b.points[b.points.length - 1];
        const distPx = Math.hypot((pt.x - dernier.x) * dims.largeurCss, (pt.y - dernier.y) * dims.hauteurCss);
        if (distPx >= 2.2) {
          b.points.push({ x: pt.x, y: pt.y });
          surChangementBrouillon(b);
        }
      } else if (b.type === 'fleche') {
        b.x2 = pt.x;
        b.y2 = pt.y;
        surChangementBrouillon(b);
      } else {
        const ox = b.origineX;
        const oy = b.origineY;
        b.x = Math.min(ox, pt.x);
        b.y = Math.min(oy, pt.y);
        b.w = Math.abs(pt.x - ox);
        b.h = Math.abs(pt.y - oy);
        surChangementBrouillon(b);
      }
    }
  });

  function relacherPointeur(e) {
    pointeursActifs.delete(e.pointerId);
    if (pointeursActifs.size < 2) {
      pinchEtat = null;
    }

    if (!actionActive || actionActive.pointerId !== e.pointerId) return;

    if (actionActive.mode === 'deplacement' || actionActive.mode === 'redimension') {
      if (actionActive.aBouge) {
        store.validerEtatHistorique();
      }
      actionActive = null;
      return;
    }

    if (actionActive.mode === 'dessin') {
      const b = actionActive.brouillon;
      const dims = obtenirDimensions();
      actionActive = null;
      surChangementBrouillon(null);

      if (!dims) return;

      if (b.type === 'stylo') {
        if (b.points.length >= 2) {
          store.ajouterAnnotation(b, false);
        }
        return;
      }

      if (b.type === 'fleche') {
        const lenPx = Math.hypot((b.x2 - b.x1) * dims.largeurCss, (b.y2 - b.y1) * dims.hauteurCss);
        if (lenPx >= 10) {
          store.ajouterAnnotation(b, true);
        }
        return;
      }

      const wPx = b.w * dims.largeurCss;
      const hPx = b.h * dims.hauteurCss;
      if (wPx >= 8 && hPx >= 6) {
        const finale = { ...b };
        delete finale.origineX;
        delete finale.origineY;
        finale.x = borner01(finale.x);
        finale.y = borner01(finale.y);
        store.ajouterAnnotation(finale, true);
      }
    }
  }

  canvasAnnotations.addEventListener('pointerup', relacherPointeur);
  canvasAnnotations.addEventListener('pointercancel', relacherPointeur);
}
