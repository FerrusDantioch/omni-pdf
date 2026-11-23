/* Point d'entrée principal d'Omni-PDF : relie store, rendu PDF, annotations, stockage et UI. */

import { StoreOmniPdf, bornerZoom } from './etat/store.js';
import {
  calculerZoomAdapte,
  chargerPdfDepuisOctets,
  creerPdfDemonstration,
  rendrePage
} from './pdf/lecteur.js';
import { exporterPdfAnnote, telechargerOctets } from './pdf/export-pdf.js';
import { redessinerCalqueAnnotations } from './annotations/moteur-rendu.js';
import { attacherInteractionsCanevas } from './annotations/interaction.js';
import {
  calculerSha256,
  chargerSession,
  sauvegarderSession
} from './stockage/indexeddb.js';
import { construireExportJson, validerEtParserJson } from './stockage/json-io.js';
import { APP_VERSION, initialiserPwa } from './pwa/mise-a-jour.js';
import { initialiserBarreOutils } from './ui/barre-outils.js';
import { initialiserMiniatures } from './ui/miniatures.js';
import { initialiserEditeurTexte } from './ui/editeur-texte.js';
import { initialiserModaleApropos } from './ui/modale-apropos.js';

const store = new StoreOmniPdf();

const elDocTitre = document.getElementById('doc-titre');
const elEspacePdf = document.getElementById('espace-pdf');
const elAccueilVide = document.getElementById('accueil-vide');
const elScenePage = document.getElementById('scene-page');
const canvasPdf = document.getElementById('canvas-pdf');
const canvasAnnotations = document.getElementById('canvas-annotations');

const inputOuvrirPdf = document.getElementById('input-ouvrir-pdf');
const btnOuvrirPdf = document.getElementById('btn-ouvrir-pdf');
const btnAccueilOuvrir = document.getElementById('btn-accueil-ouvrir');
const btnAccueilDemo = document.getElementById('btn-accueil-demo');
const btnAccueilJson = document.getElementById('btn-accueil-json');
const btnExporterPdf = document.getElementById('btn-exporter-pdf');
const btnJson = document.getElementById('btn-json');

const btnPagePrec = document.getElementById('btn-page-prec');
const btnPageSuiv = document.getElementById('btn-page-suiv');
const elIndicateurPage = document.getElementById('indicateur-page');
const btnZoomMoins = document.getElementById('btn-zoom-moins');
const btnZoomPlus = document.getElementById('btn-zoom-plus');
const btnZoomLargeur = document.getElementById('btn-zoom-largeur');
const btnZoomPage = document.getElementById('btn-zoom-page');
const elIndicateurZoom = document.getElementById('indicateur-zoom');

const elPointSauvegarde = document.getElementById('point-sauvegarde');
const elTexteSauvegarde = document.getElementById('texte-sauvegarde');
const zoneToasts = document.getElementById('zone-toasts');
const annonceLive = document.getElementById('annonce-live');

/* Modales Export PDF et JSON */
const modaleExportPdf = document.getElementById('modale-export-pdf');
const inputNomExport = document.getElementById('input-nom-export');
const optNotesNatives = document.getElementById('opt-notes-natives');
const optRecapNotes = document.getElementById('opt-recap-notes');
const msgExportPdf = document.getElementById('msg-export-pdf');
const btnFermerExportPdf = document.getElementById('btn-fermer-export-pdf');
const btnAnnulerExportPdf = document.getElementById('btn-annuler-export-pdf');
const btnLancerExportPdf = document.getElementById('btn-lancer-export-pdf');

const modaleJson = document.getElementById('modale-json');
const optJsonInclurePdf = document.getElementById('opt-json-inclure-pdf');
const btnTelechargerJson = document.getElementById('btn-telecharger-json');
const btnChoisirJson = document.getElementById('btn-choisir-json');
const inputImporterJson = document.getElementById('input-importer-json');
const msgJson = document.getElementById('msg-json');
const btnFermerJson = document.getElementById('btn-fermer-json');
const btnFermerJsonBas = document.getElementById('btn-fermer-json-bas');

let dimensionsCourantes = null;
let brouillonCourant = null;
let minuteurSauvegarde = null;
let minuteurRedim = null;
let minuteurPinch = null;
let rafDessin = 0;

function afficherToast(message, type = '') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (type) toast.classList.add(type);
  toast.textContent = message;
  zoneToasts.appendChild(toast);
  annonceLive.textContent = message;
  setTimeout(() => {
    toast.remove();
  }, 4200);
}

function majIndicateurSauvegarde(etat, texte) {
  elPointSauvegarde.className = 'point-etat';
  if (etat) elPointSauvegarde.classList.add(etat);
  elTexteSauvegarde.textContent = texte;
}

function planifierSauvegardeLocale() {
  if (!store.etat.document.ouvert) return;
  majIndicateurSauvegarde('en-cours', 'Sauvegarde...');
  clearTimeout(minuteurSauvegarde);
  minuteurSauvegarde = setTimeout(async () => {
    try {
      await sauvegarderSession(store.etat);
      const heure = new Date().toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      });
      majIndicateurSauvegarde('ok', `Sauvé localement (${heure})`);
    } catch (err) {
      const msg =
        err?.name === 'QuotaExceededError'
          ? 'Espace local plein'
          : 'Sauvegarde locale impossible';
      majIndicateurSauvegarde('erreur', msg);
    }
  }, 450);
}

function planifierRedessinAnnotations() {
  if (rafDessin) return;
  rafDessin = requestAnimationFrame(() => {
    rafDessin = 0;
    redessinerCalqueAnnotations(
      canvasAnnotations,
      store.etat.annotations,
      store.etat.vue.pageCourante,
      store.etat.selectionId,
      dimensionsCourantes,
      brouillonCourant
    );
  });
}

async function rafraichirRenduPdf() {
  const { document: doc, vue } = store.etat;
  if (!doc.ouvert) return;

  let zoomUtilise = vue.zoom;
  if (vue.modeZoom === 'largeur' || vue.modeZoom === 'page') {
    zoomUtilise = bornerZoom(
      await calculerZoomAdapte(
        vue.pageCourante,
        vue.modeZoom,
        elEspacePdf.clientWidth,
        elEspacePdf.clientHeight
      )
    );
    store.etat.vue.zoom = zoomUtilise;
  }

  elIndicateurZoom.textContent = `${Math.round(zoomUtilise * 100)} %`;

  const dims = await rendrePage(vue.pageCourante, canvasPdf, zoomUtilise);
  if (!dims) return;

  dimensionsCourantes = dims;
  elScenePage.style.width = `${dims.largeurCss}px`;
  elScenePage.style.height = `${dims.hauteurCss}px`;
  planifierRedessinAnnotations();
}

function mettreAJourBarreBas() {
  const { document: doc, vue } = store.etat;
  const ouvert = doc.ouvert;

  elAccueilVide.classList.toggle('cache', ouvert);
  elScenePage.classList.toggle('cache', !ouvert);
  btnExporterPdf.disabled = !ouvert;

  elDocTitre.textContent = ouvert ? doc.nomFichier : 'Aucun document';
  elDocTitre.title = ouvert ? doc.nomFichier : 'Aucun document ouvert';

  elIndicateurPage.textContent = ouvert ? `${vue.pageCourante} / ${doc.nbPages}` : '— / —';
  elIndicateurZoom.textContent = `${Math.round(vue.zoom * 100)} %`;

  btnPagePrec.disabled = !ouvert || vue.pageCourante <= 1;
  btnPageSuiv.disabled = !ouvert || vue.pageCourante >= doc.nbPages;
  btnZoomMoins.disabled = !ouvert;
  btnZoomPlus.disabled = !ouvert;
  btnZoomLargeur.disabled = !ouvert;
  btnZoomPage.disabled = !ouvert;

  btnZoomLargeur.setAttribute('aria-pressed', String(ouvert && vue.modeZoom === 'largeur'));
  btnZoomPage.setAttribute('aria-pressed', String(ouvert && vue.modeZoom === 'page'));
}

async function ouvrirOctetsPdf(
  octets,
  nomFichier,
  { annotations = [], pageCourante = 1, zoom = 1, modeZoom = 'largeur', pdfSha256 = '' } = {}
) {
  const copie = octets instanceof Uint8Array ? octets.slice() : new Uint8Array(octets);
  const { nbPages } = await chargerPdfDepuisOctets(copie);
  const sha = pdfSha256 || (await calculerSha256(copie));

  store.chargerDocument({
    nomFichier,
    pdfBytes: copie,
    pdfSha256: sha,
    nbPages,
    annotations,
    pageCourante,
    zoom,
    modeZoom
  });
}

async function ouvrirFichierPdf(fichier) {
  if (!fichier) return;
  try {
    const buffer = await fichier.arrayBuffer();
    const octets = new Uint8Array(buffer);
    const entete = String.fromCharCode(...octets.subarray(0, 5));
    if (entete !== '%PDF-') {
      afficherToast('Ce fichier ne semble pas être un PDF valide.', 'erreur');
      return;
    }
    await ouvrirOctetsPdf(octets, fichier.name);
    afficherToast(`Document « ${fichier.name} » ouvert.`, 'succes');
  } catch (err) {
    afficherToast(`Impossible d'ouvrir ce PDF (${err.message}).`, 'erreur');
  }
}

function afficherMessageCadre(el, texte, type = '') {
  el.textContent = texte;
  el.className = 'cadre-message';
  if (type) el.classList.add(type);
  el.classList.remove('cache');
}

/* Initialisation des sous-modules UI */
const editeurTexte = initialiserEditeurTexte(store);

initialiserBarreOutils(store, {
  surDemandeEditionSelection: (annotation) => {
    editeurTexte.ouvrir({ mode: 'modifier', annotation });
  }
});

initialiserMiniatures(store);
initialiserModaleApropos({ afficherToast });

attacherInteractionsCanevas({
  canvasAnnotations,
  store,
  obtenirDimensions: () => dimensionsCourantes,
  surChangementBrouillon: (brouillon) => {
    brouillonCourant = brouillon;
    planifierRedessinAnnotations();
  },
  surEditionDemandee: (req) => {
    editeurTexte.ouvrir(req);
  },
  surPinchZoom: (nouveauZoom) => {
    const borne = bornerZoom(nouveauZoom);
    elIndicateurZoom.textContent = `${Math.round(borne * 100)} %`;
    clearTimeout(minuteurPinch);
    minuteurPinch = setTimeout(() => {
      store.definirZoom(borne, 'manuel');
    }, 90);
  }
});

/* Réaction aux changements d'état du store */
store.abonner((etat, canal) => {
  mettreAJourBarreBas();

  if (canal === 'document' || canal === 'vue') {
    rafraichirRenduPdf().catch((err) => {
      afficherToast(`Erreur de rendu PDF : ${err.message}`, 'erreur');
    });
  } else if (canal === 'annotations' || canal === 'selection' || canal === 'tout') {
    planifierRedessinAnnotations();
  }

  if (canal === 'document' || canal === 'annotations' || canal === 'vue') {
    planifierSauvegardeLocale();
  }
});

/* Ouverture PDF (boutons + glisser-déposer) */
btnOuvrirPdf.addEventListener('click', () => inputOuvrirPdf.click());
btnAccueilOuvrir.addEventListener('click', () => inputOuvrirPdf.click());

inputOuvrirPdf.addEventListener('change', async () => {
  const fichier = inputOuvrirPdf.files?.[0];
  inputOuvrirPdf.value = '';
  if (fichier) await ouvrirFichierPdf(fichier);
});

btnAccueilDemo.addEventListener('click', async () => {
  try {
    const octets = await creerPdfDemonstration();
    await ouvrirOctetsPdf(octets, 'omni-pdf-demonstration.pdf');
    afficherToast('PDF de démonstration prêt à être annoté !', 'succes');
  } catch (err) {
    afficherToast(`Impossible de créer la démo : ${err.message}`, 'erreur');
  }
});

elEspacePdf.addEventListener('dragover', (e) => {
  e.preventDefault();
  elEspacePdf.classList.add('depot-actif');
});

elEspacePdf.addEventListener('dragleave', () => {
  elEspacePdf.classList.remove('depot-actif');
});

elEspacePdf.addEventListener('drop', async (e) => {
  e.preventDefault();
  elEspacePdf.classList.remove('depot-actif');
  const fichier = e.dataTransfer?.files?.[0];
  if (!fichier) return;
  if (fichier.name.toLowerCase().endsWith('.json')) {
    await traiterFichierJson(fichier);
  } else {
    await ouvrirFichierPdf(fichier);
  }
});

/* Navigation & Zoom */
btnPagePrec.addEventListener('click', () => {
  store.definirPage(store.etat.vue.pageCourante - 1);
});

btnPageSuiv.addEventListener('click', () => {
  store.definirPage(store.etat.vue.pageCourante + 1);
});

btnZoomMoins.addEventListener('click', () => {
  store.definirZoom(store.etat.vue.zoom - 0.2, 'manuel');
});

btnZoomPlus.addEventListener('click', () => {
  store.definirZoom(store.etat.vue.zoom + 0.2, 'manuel');
});

btnZoomLargeur.addEventListener('click', () => {
  store.definirModeZoom('largeur');
});

btnZoomPage.addEventListener('click', () => {
  store.definirModeZoom('page');
});

window.addEventListener('resize', () => {
  if (!store.etat.document.ouvert) return;
  clearTimeout(minuteurRedim);
  minuteurRedim = setTimeout(() => {
    if (store.etat.vue.modeZoom === 'largeur' || store.etat.vue.modeZoom === 'page') {
      rafraichirRenduPdf().catch(() => {});
    }
  }, 150);
});

/* Raccourcis clavier (pratique si clavier attaché à la tablette) */
window.addEventListener('keydown', (e) => {
  const cible = e.target;
  const dansChamp =
    cible instanceof HTMLElement &&
    (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.tagName === 'SELECT');
  if (dansChamp) return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault();
    store.annuler();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
    e.preventDefault();
    store.retablir();
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && store.etat.selectionId) {
    e.preventDefault();
    store.supprimerAnnotation();
    return;
  }
  if (e.key === 'Escape' && store.etat.selectionId) {
    store.selectionner(null);
    return;
  }
  if (e.key === 'ArrowLeft' && store.etat.document.ouvert) {
    store.definirPage(store.etat.vue.pageCourante - 1);
  } else if (e.key === 'ArrowRight' && store.etat.document.ouvert) {
    store.definirPage(store.etat.vue.pageCourante + 1);
  }
});

/* Modale Export PDF */
btnExporterPdf.addEventListener('click', () => {
  if (!store.etat.document.ouvert) return;
  const base = store.etat.document.nomFichier.replace(/\.pdf$/i, '') || 'document';
  inputNomExport.value = `${base}-annote.pdf`;
  msgExportPdf.classList.add('cache');
  modaleExportPdf.showModal();
});

btnFermerExportPdf.addEventListener('click', () => modaleExportPdf.close());
btnAnnulerExportPdf.addEventListener('click', () => modaleExportPdf.close());

btnLancerExportPdf.addEventListener('click', async () => {
  if (!store.etat.document.ouvert) return;
  btnLancerExportPdf.disabled = true;
  afficherMessageCadre(msgExportPdf, 'Génération du PDF en cours...', '');

  try {
    const octets = await exporterPdfAnnote(
      store.etat.document.pdfBytes,
      store.etat.annotations,
      {
        notesNatives: optNotesNatives.checked,
        pageRecapNotes: optRecapNotes.checked
      }
    );
    let nom = inputNomExport.value.trim() || 'document-annote.pdf';
    if (!nom.toLowerCase().endsWith('.pdf')) nom += '.pdf';
    telechargerOctets(octets, nom, 'application/pdf');
    modaleExportPdf.close();
    afficherToast(`PDF exporté : ${nom}`, 'succes');
  } catch (err) {
    afficherMessageCadre(
      msgExportPdf,
      `Échec de l'export PDF : ${err.message}`,
      'erreur'
    );
  } finally {
    btnLancerExportPdf.disabled = false;
  }
});

/* Modale Sauvegarde & Restauration JSON */
function ouvrirModaleJson() {
  msgJson.classList.add('cache');
  btnTelechargerJson.disabled = !store.etat.document.ouvert;
  modaleJson.showModal();
}

btnJson.addEventListener('click', ouvrirModaleJson);
btnAccueilJson.addEventListener('click', ouvrirModaleJson);
btnFermerJson.addEventListener('click', () => modaleJson.close());
btnFermerJsonBas.addEventListener('click', () => modaleJson.close());

btnTelechargerJson.addEventListener('click', () => {
  if (!store.etat.document.ouvert) {
    afficherMessageCadre(msgJson, 'Ouvre d\'abord un PDF avant d\'exporter un JSON.', 'erreur');
    return;
  }
  try {
    const jsonTexte = construireExportJson(
      store.etat,
      APP_VERSION,
      optJsonInclurePdf.checked
    );
    const base = store.etat.document.nomFichier.replace(/\.pdf$/i, '') || 'omni-pdf';
    const horodatage = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const nom = `${base}-sauvegarde-${horodatage}.json`;
    telechargerOctets(
      new TextEncoder().encode(jsonTexte),
      nom,
      'application/json;charset=utf-8'
    );
    afficherMessageCadre(msgJson, `Sauvegarde JSON créée : ${nom}`, 'succes');
  } catch (err) {
    afficherMessageCadre(msgJson, `Erreur lors de l'export JSON : ${err.message}`, 'erreur');
  }
});

btnChoisirJson.addEventListener('click', () => inputImporterJson.click());

async function traiterFichierJson(fichier) {
  let texte;
  try {
    texte = await fichier.text();
  } catch {
    afficherMessageCadre(msgJson, 'Impossible de lire ce fichier sur ton appareil.', 'erreur');
    return;
  }

  const verdict = validerEtParserJson(texte);
  if (!verdict.ok) {
    if (!modaleJson.open) modaleJson.showModal();
    afficherMessageCadre(
      msgJson,
      `Fichier JSON refusé :\n• ${verdict.erreurs.join('\n• ')}`,
      'erreur'
    );
    return;
  }

  const { document: docJson, etat: etatJson, horodatage } = verdict.donnees;

  try {
    if (docJson.pdfBytes) {
      await ouvrirOctetsPdf(docJson.pdfBytes, docJson.nomFichier, {
        annotations: etatJson.annotations,
        pageCourante: etatJson.pageCourante,
        zoom: etatJson.zoom,
        modeZoom: etatJson.modeZoom,
        pdfSha256: docJson.sha256
      });
      modaleJson.close();
      afficherToast(
        `Sauvegarde du ${new Date(horodatage).toLocaleString('fr-FR')} restaurée.`,
        'succes'
      );
      return;
    }

    if (!store.etat.document.ouvert) {
      if (!modaleJson.open) modaleJson.showModal();
      afficherMessageCadre(
        msgJson,
        `Ce JSON ne contient que les annotations (sans le PDF d'origine « ${docJson.nomFichier} »). Ouvre d'abord ce PDF puis réimporte ce fichier JSON.`,
        'avertissement'
      );
      return;
    }

    const nbPagesActuel = store.etat.document.nbPages;
    const annotationsFiltrees = etatJson.annotations.filter((a) => a.page <= nbPagesActuel);
    const ignorees = etatJson.annotations.length - annotationsFiltrees.length;
    const memeEmpreinte =
      !docJson.sha256 ||
      !store.etat.document.pdfSha256 ||
      docJson.sha256 === store.etat.document.pdfSha256;

    store.remplacerAnnotations(annotationsFiltrees, true);
    store.definirPage(Math.min(etatJson.pageCourante, nbPagesActuel));

    if (!memeEmpreinte || ignorees > 0) {
      afficherMessageCadre(
        msgJson,
        `Annotations importées (${annotationsFiltrees.length}), mais ce PDF semble différent du document d'origine (${ignorees} annotation(s) hors pages ignorée(s)).`,
        'avertissement'
      );
    } else {
      modaleJson.close();
      afficherToast(`${annotationsFiltrees.length} annotation(s) restaurée(s).`, 'succes');
    }
  } catch (err) {
    if (!modaleJson.open) modaleJson.showModal();
    afficherMessageCadre(msgJson, `Erreur pendant la restauration : ${err.message}`, 'erreur');
  }
}

inputImporterJson.addEventListener('change', async () => {
  const fichier = inputImporterJson.files?.[0];
  inputImporterJson.value = '';
  if (fichier) await traiterFichierJson(fichier);
});

/* Démarrage : PWA + restauration automatique de la dernière session IndexedDB */
async function demarrer() {
  mettreAJourBarreBas();
  initialiserPwa();

  try {
    const session = await chargerSession();
    if (session && session.pdfBytes?.length) {
      await ouvrirOctetsPdf(session.pdfBytes, session.nomFichier || 'document.pdf', {
        annotations: Array.isArray(session.annotations) ? session.annotations : [],
        pageCourante: session.pageCourante || 1,
        zoom: session.zoom || 1,
        modeZoom: session.modeZoom || 'largeur',
        pdfSha256: session.pdfSha256 || ''
      });
      majIndicateurSauvegarde('ok', 'Session restaurée');
    }
  } catch {
    majIndicateurSauvegarde('', 'Prêt hors-ligne');
  }
}

demarrer();
