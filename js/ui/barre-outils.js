/* Gestion de la barre d'outils tactile : outils, couleurs, trait, stylet, Undo/Redo, sélection. */

import {
  TAILLE_POLICE_MAX,
  TAILLE_POLICE_MIN,
  bornerTaillePolice
} from '../etat/store.js';

export function initialiserBarreOutils(store, { surDemandeEditionSelection }) {
  const boutonsOutils = [...document.querySelectorAll('[data-outil]')];
  const pastillesCouleur = [...document.querySelectorAll('[data-couleur]')];
  const selectEpaisseur = document.getElementById('select-epaisseur');
  const inputTaillePolice = document.getElementById('input-taille-police');
  const btnTexteGras = document.getElementById('btn-texte-gras');
  const btnStyletSeul = document.getElementById('btn-stylet-seul');
  const btnAnnuler = document.getElementById('btn-annuler');
  const btnRetablir = document.getElementById('btn-retablir');
  const btnEditerSelection = document.getElementById('btn-editer-selection');
  const btnSupprimerSelection = document.getElementById('btn-supprimer-selection');
  const btnToggleMiniatures = document.getElementById('btn-toggle-miniatures');
  const canvasAnnotations = document.getElementById('canvas-annotations');

  boutonsOutils.forEach((btn) => {
    btn.addEventListener('click', () => {
      store.definirOutil(btn.dataset.outil);
    });
  });

  pastillesCouleur.forEach((btn) => {
    btn.addEventListener('click', () => {
      store.definirCouleur(btn.dataset.couleur);
    });
  });

  selectEpaisseur.addEventListener('change', () => {
    store.definirEpaisseur(selectEpaisseur.value);
  });

  inputTaillePolice.addEventListener('input', () => {
    const brut = Number(inputTaillePolice.value);
    if (Number.isFinite(brut) && brut >= TAILLE_POLICE_MIN && brut <= TAILLE_POLICE_MAX) {
      store.definirTaillePolice(brut);
    }
  });

  const validerTailleBarre = () => {
    const borne = bornerTaillePolice(inputTaillePolice.value);
    inputTaillePolice.value = String(borne);
    store.definirTaillePolice(borne);
  };

  inputTaillePolice.addEventListener('change', validerTailleBarre);
  inputTaillePolice.addEventListener('blur', validerTailleBarre);

  btnTexteGras.addEventListener('click', () => {
    store.basculerGras();
  });

  btnStyletSeul.addEventListener('click', () => {
    store.basculerStyletUniquement();
  });

  btnAnnuler.addEventListener('click', () => {
    store.annuler();
  });

  btnRetablir.addEventListener('click', () => {
    store.retablir();
  });

  btnEditerSelection.addEventListener('click', () => {
    const sel = store.trouverSelection();
    if (sel && (sel.type === 'texte' || sel.type === 'note')) {
      surDemandeEditionSelection(sel);
    }
  });

  btnSupprimerSelection.addEventListener('click', () => {
    store.supprimerAnnotation();
  });

  btnToggleMiniatures.addEventListener('click', () => {
    store.basculerMiniatures();
  });

  function synchroniser(etat) {
    const { outilActif, couleur, epaisseur, taillePolice, gras, styletUniquement } = etat.outil;
    const docOuvert = etat.document.ouvert;
    const sel = store.trouverSelection();
    const estTexteSel = Boolean(sel && sel.type === 'texte');
    const tailleCourante = estTexteSel ? bornerTaillePolice(sel.taillePolice) : taillePolice;
    const grasCourant = estTexteSel ? Boolean(sel.gras) : Boolean(gras);

    boutonsOutils.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.outil === outilActif));
      btn.disabled = !docOuvert;
    });

    pastillesCouleur.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.couleur === couleur));
    });

    selectEpaisseur.value = String(epaisseur);
    if (document.activeElement !== inputTaillePolice) {
      inputTaillePolice.value = String(tailleCourante);
    }
    btnTexteGras.setAttribute('aria-pressed', String(grasCourant));
    btnStyletSeul.setAttribute('aria-pressed', String(styletUniquement));

    btnAnnuler.disabled = !docOuvert || !store.peutAnnuler();
    btnRetablir.disabled = !docOuvert || !store.peutRetablir();
    btnSupprimerSelection.disabled = !docOuvert || !sel;
    btnEditerSelection.disabled = !docOuvert || !sel || (sel.type !== 'texte' && sel.type !== 'note');
    btnToggleMiniatures.disabled = !docOuvert;
    btnToggleMiniatures.setAttribute('aria-pressed', String(etat.vue.voletMiniaturesOuvert));

    canvasAnnotations.classList.toggle('outil-selection', outilActif === 'selection');
  }

  store.abonner(synchroniser);
  synchroniser(store.etat);
}
