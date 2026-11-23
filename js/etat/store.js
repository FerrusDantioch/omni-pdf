/* État central réactif d'Omni-PDF (document, vue, outil actif, annotations, sélection). */

import { HistoriqueAnnotations } from './historique.js';

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 3.5;

export function bornerZoom(valeur) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(valeur * 100) / 100));
}

export class StoreOmniPdf {
  constructor() {
    this.ecouteurs = new Set();
    this.historique = new HistoriqueAnnotations(80);
    this.etat = {
      document: {
        ouvert: false,
        nomFichier: '',
        pdfBytes: null,
        pdfSha256: '',
        nbPages: 0
      },
      vue: {
        pageCourante: 1,
        zoom: 1,
        modeZoom: 'largeur',
        voletMiniaturesOuvert: false
      },
      outil: {
        outilActif: 'selection',
        couleur: '#a777ff',
        epaisseur: 4,
        taillePolice: 18,
        styletUniquement: false
      },
      annotations: [],
      selectionId: null
    };
  }

  abonner(ecouteur) {
    this.ecouteurs.add(ecouteur);
    return () => this.ecouteurs.delete(ecouteur);
  }

  emettre(canal = 'tout') {
    for (const fn of this.ecouteurs) {
      fn(this.etat, canal);
    }
  }

  chargerDocument({ nomFichier, pdfBytes, pdfSha256, nbPages, annotations = [], pageCourante = 1, zoom = 1, modeZoom = 'largeur' }) {
    const pageBornee = Math.min(Math.max(1, pageCourante), Math.max(1, nbPages));
    this.etat.document = {
      ouvert: true,
      nomFichier,
      pdfBytes,
      pdfSha256,
      nbPages
    };
    this.etat.vue.pageCourante = pageBornee;
    this.etat.vue.zoom = bornerZoom(zoom);
    this.etat.vue.modeZoom = modeZoom;
    this.etat.annotations = annotations.slice();
    this.etat.selectionId = null;
    this.historique.reinitialiser(this.etat.annotations);
    this.emettre('document');
  }

  definirPage(page) {
    if (!this.etat.document.ouvert) return;
    const cible = Math.min(Math.max(1, Number(page) || 1), this.etat.document.nbPages);
    if (cible === this.etat.vue.pageCourante) return;
    this.etat.vue.pageCourante = cible;
    this.etat.selectionId = null;
    this.emettre('vue');
  }

  definirZoom(zoom, modeZoom = 'manuel') {
    const borne = bornerZoom(zoom);
    if (borne === this.etat.vue.zoom && modeZoom === this.etat.vue.modeZoom) return;
    this.etat.vue.zoom = borne;
    this.etat.vue.modeZoom = modeZoom;
    this.emettre('vue');
  }

  definirModeZoom(modeZoom) {
    this.etat.vue.modeZoom = modeZoom;
    this.emettre('vue');
  }

  basculerMiniatures(force) {
    const nouvelEtat = typeof force === 'boolean' ? force : !this.etat.vue.voletMiniaturesOuvert;
    this.etat.vue.voletMiniaturesOuvert = nouvelEtat;
    this.emettre('miniatures');
  }

  definirOutil(outilActif) {
    this.etat.outil.outilActif = outilActif;
    if (outilActif !== 'selection') {
      this.etat.selectionId = null;
    }
    this.emettre('outil');
  }

  definirCouleur(couleur) {
    this.etat.outil.couleur = couleur;
    if (this.etat.selectionId) {
      const sel = this.trouverSelection();
      if (sel && sel.couleur !== couleur) {
        this.modifierAnnotation(sel.id, { couleur });
      }
    }
    this.emettre('outil');
  }

  definirEpaisseur(epaisseur) {
    this.etat.outil.epaisseur = Number(epaisseur) || 4;
    if (this.etat.selectionId) {
      const sel = this.trouverSelection();
      if (sel && 'epaisseur' in sel && sel.epaisseur !== this.etat.outil.epaisseur) {
        this.modifierAnnotation(sel.id, { epaisseur: this.etat.outil.epaisseur });
      }
    }
    this.emettre('outil');
  }

  definirTaillePolice(taillePolice) {
    this.etat.outil.taillePolice = Number(taillePolice) || 18;
    if (this.etat.selectionId) {
      const sel = this.trouverSelection();
      if (sel && sel.type === 'texte' && sel.taillePolice !== this.etat.outil.taillePolice) {
        this.modifierAnnotation(sel.id, { taillePolice: this.etat.outil.taillePolice });
      }
    }
    this.emettre('outil');
  }

  basculerStyletUniquement() {
    this.etat.outil.styletUniquement = !this.etat.outil.styletUniquement;
    this.emettre('outil');
  }

  selectionner(id) {
    if (this.etat.selectionId === id) return;
    this.etat.selectionId = id || null;
    this.emettre('selection');
  }

  trouverSelection() {
    if (!this.etat.selectionId) return null;
    return this.etat.annotations.find((a) => a.id === this.etat.selectionId) || null;
  }

  annotationsDeLaPage(numPage = this.etat.vue.pageCourante) {
    return this.etat.annotations.filter((a) => a.page === numPage);
  }

  ajouterAnnotation(annotation, selectionnerEnsuite = true) {
    const liste = [...this.etat.annotations, annotation];
    this.etat.annotations = liste;
    this.historique.enregistrer(liste);
    if (selectionnerEnsuite) {
      this.etat.selectionId = annotation.id;
    }
    this.emettre('annotations');
  }

  modifierAnnotation(id, champs, avecHistorique = true) {
    const index = this.etat.annotations.findIndex((a) => a.id === id);
    if (index === -1) return;
    const maj = {
      ...this.etat.annotations[index],
      ...champs,
      modifieLe: new Date().toISOString()
    };
    const liste = this.etat.annotations.slice();
    liste[index] = maj;
    this.etat.annotations = liste;
    if (avecHistorique) {
      this.historique.enregistrer(liste);
    }
    this.emettre('annotations');
  }

  validerEtatHistorique() {
    this.historique.enregistrer(this.etat.annotations);
    this.emettre('annotations');
  }

  supprimerAnnotation(id = this.etat.selectionId) {
    if (!id) return;
    const liste = this.etat.annotations.filter((a) => a.id !== id);
    if (liste.length === this.etat.annotations.length) return;
    this.etat.annotations = liste;
    if (this.etat.selectionId === id) {
      this.etat.selectionId = null;
    }
    this.historique.enregistrer(liste);
    this.emettre('annotations');
  }

  remplacerAnnotations(nouvellesAnnotations, garderHistorique = true) {
    this.etat.annotations = nouvellesAnnotations.slice();
    this.etat.selectionId = null;
    if (garderHistorique) {
      this.historique.enregistrer(this.etat.annotations);
    } else {
      this.historique.reinitialiser(this.etat.annotations);
    }
    this.emettre('annotations');
  }

  annuler() {
    const precedentes = this.historique.annuler();
    if (!precedentes) return false;
    this.etat.annotations = precedentes;
    if (this.etat.selectionId && !precedentes.some((a) => a.id === this.etat.selectionId)) {
      this.etat.selectionId = null;
    }
    this.emettre('annotations');
    return true;
  }

  retablir() {
    const suivantes = this.historique.retablir();
    if (!suivantes) return false;
    this.etat.annotations = suivantes;
    if (this.etat.selectionId && !suivantes.some((a) => a.id === this.etat.selectionId)) {
      this.etat.selectionId = null;
    }
    this.emettre('annotations');
    return true;
  }

  peutAnnuler() {
    return this.historique.peutAnnuler();
  }

  peutRetablir() {
    return this.historique.peutRetablir();
  }
}
