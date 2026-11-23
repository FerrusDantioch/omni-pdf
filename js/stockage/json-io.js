/* Sauvegarde et restauration JSON versionnée, horodatée et validée strictement. */

import { TYPES_ANNOTATIONS, genererIdAnnotation } from '../annotations/modele.js';

export const SCHEMA_VERSION = 1;

function octetsVersBase64(uint8Array) {
  const tailleTranche = 0x8000;
  const morceaux = [];
  for (let i = 0; i < uint8Array.length; i += tailleTranche) {
    const tranche = uint8Array.subarray(i, i + tailleTranche);
    morceaux.push(String.fromCharCode(...tranche));
  }
  return btoa(morceaux.join(''));
}

function base64VersOctets(b64) {
  const binaire = atob(b64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) {
    octets[i] = binaire.charCodeAt(i);
  }
  return octets;
}

function estNombreValide(v, min = -Infinity, max = Infinity) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

function validerAnnotation(ann, index) {
  if (!ann || typeof ann !== 'object') {
    return `Annotation #${index + 1} invalide : objet attendu.`;
  }
  if (!TYPES_ANNOTATIONS.includes(ann.type)) {
    return `Annotation #${index + 1} : type inconnu ("${String(ann.type)}").`;
  }
  if (!Number.isInteger(ann.page) || ann.page < 1) {
    return `Annotation #${index + 1} : numéro de page invalide.`;
  }
  if (typeof ann.couleur !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(ann.couleur)) {
    return `Annotation #${index + 1} : couleur hexadécimale invalide.`;
  }

  if (ann.type === 'stylo') {
    if (!Array.isArray(ann.points) || ann.points.length < 1) {
      return `Annotation stylo #${index + 1} : points manquants.`;
    }
    for (const p of ann.points) {
      if (!p || !estNombreValide(p.x, 0, 1) || !estNombreValide(p.y, 0, 1)) {
        return `Annotation stylo #${index + 1} : coordonnées de tracé hors limites [0..1].`;
      }
    }
  } else if (ann.type === 'fleche') {
    if (
      !estNombreValide(ann.x1, 0, 1) ||
      !estNombreValide(ann.y1, 0, 1) ||
      !estNombreValide(ann.x2, 0, 1) ||
      !estNombreValide(ann.y2, 0, 1)
    ) {
      return `Annotation flèche #${index + 1} : coordonnées invalides.`;
    }
  } else if (ann.type === 'note') {
    if (!estNombreValide(ann.x, 0, 1) || !estNombreValide(ann.y, 0, 1)) {
      return `Annotation note #${index + 1} : position invalide.`;
    }
  } else {
    if (
      !estNombreValide(ann.x, 0, 1) ||
      !estNombreValide(ann.y, 0, 1) ||
      !estNombreValide(ann.w, 0, 1) ||
      !estNombreValide(ann.h, 0, 1)
    ) {
      return `Annotation #${index + 1} (${ann.type}) : dimensions invalides.`;
    }
    if (ann.type === 'texte') {
      if (ann.taillePolice !== undefined && !estNombreValide(ann.taillePolice, 6, 144)) {
        return `Annotation texte #${index + 1} : taille de police invalide (6 à 144).`;
      }
      if (ann.gras !== undefined && typeof ann.gras !== 'boolean') {
        return `Annotation texte #${index + 1} : propriété gras invalide.`;
      }
    }
  }

  return null;
}

export function construireExportJson(etat, appVersion, inclurePdf = true) {
  const payload = {
    application: 'Omni-PDF',
    suite: 'Omni-Système',
    schemaVersion: SCHEMA_VERSION,
    version: appVersion,
    horodatage: new Date().toISOString(),
    document: {
      nomFichier: etat.document.nomFichier,
      nbPages: etat.document.nbPages,
      sha256: etat.document.pdfSha256
    },
    etat: {
      pageCourante: etat.vue.pageCourante,
      zoom: etat.vue.zoom,
      modeZoom: etat.vue.modeZoom,
      annotations: etat.annotations
    }
  };

  if (inclurePdf && etat.document.pdfBytes) {
    payload.document.pdfBase64 = octetsVersBase64(etat.document.pdfBytes);
  }

  return JSON.stringify(payload, null, 2);
}

export function validerEtParserJson(texteJson) {
  let brut;
  try {
    brut = JSON.parse(texteJson);
  } catch (err) {
    return {
      ok: false,
      erreurs: [`Le fichier n'est pas un JSON valide (${err.message}).`],
      avertissements: [],
      donnees: null
    };
  }

  const erreurs = [];
  const avertissements = [];

  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) {
    return {
      ok: false,
      erreurs: ['Le fichier JSON doit contenir un objet à la racine.'],
      avertissements: [],
      donnees: null
    };
  }

  const versionSchema = brut.schemaVersion ?? brut.versionSchema;
  if (versionSchema !== SCHEMA_VERSION) {
    erreurs.push(
      `Version de schéma incompatible : trouvé "${String(versionSchema)}", attendu ${SCHEMA_VERSION}.`
    );
  }

  if (typeof brut.horodatage !== 'string' || Number.isNaN(Date.parse(brut.horodatage))) {
    erreurs.push('Champ "horodatage" manquant ou date ISO invalide.');
  }

  if (typeof brut.version !== 'string' || !brut.version.trim()) {
    avertissements.push('Champ "version" absent ou vide dans la sauvegarde.');
  }

  const annotationsBrutes = brut.etat?.annotations;
  if (!Array.isArray(annotationsBrutes)) {
    erreurs.push('Le tableau "etat.annotations" est manquant ou invalide.');
  } else {
    annotationsBrutes.forEach((ann, idx) => {
      const msg = validerAnnotation(ann, idx);
      if (msg) erreurs.push(msg);
    });
  }

  let pdfBytes = null;
  if (brut.document?.pdfBase64) {
    if (typeof brut.document.pdfBase64 !== 'string') {
      erreurs.push('Le champ "document.pdfBase64" doit être une chaîne Base64.');
    } else {
      try {
        pdfBytes = base64VersOctets(brut.document.pdfBase64);
        const entete = String.fromCharCode(...pdfBytes.subarray(0, 5));
        if (entete !== '%PDF-') {
          erreurs.push('Les données PDF intégrées ne correspondent pas à un fichier PDF valide (%PDF-).');
        }
      } catch {
        erreurs.push('Impossible de décoder le PDF intégré (Base64 corrompu).');
      }
    }
  }

  if (erreurs.length > 0) {
    return { ok: false, erreurs, avertissements, donnees: null };
  }

  const annotationsNormalisees = annotationsBrutes.map((a) => ({
    ...a,
    id: typeof a.id === 'string' && a.id ? a.id : genererIdAnnotation()
  }));

  return {
    ok: true,
    erreurs: [],
    avertissements,
    donnees: {
      version: brut.version || 'inconnue',
      horodatage: brut.horodatage,
      document: {
        nomFichier: brut.document?.nomFichier || 'document-restaure.pdf',
        nbPages: brut.document?.nbPages || 1,
        sha256: brut.document?.sha256 || '',
        pdfBytes
      },
      etat: {
        pageCourante: Number(brut.etat?.pageCourante) || 1,
        zoom: Number(brut.etat?.zoom) || 1,
        modeZoom: brut.etat?.modeZoom || 'largeur',
        annotations: annotationsNormalisees
      }
    }
  };
}
