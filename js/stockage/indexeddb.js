/* Sauvegarde automatique locale dans IndexedDB (PDF binaire + annotations + vue). */

const NOM_BASE = 'omni-pdf-db';
const VERSION_BASE = 1;
const MAGASIN_SESSIONS = 'sessions';
const CLE_COURANTE = 'courante';

function ouvrirBase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB n\'est pas disponible dans ce navigateur.'));
      return;
    }
    const req = indexedDB.open(NOM_BASE, VERSION_BASE);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MAGASIN_SESSIONS)) {
        db.createObjectStore(MAGASIN_SESSIONS);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Impossible d\'ouvrir le stockage local.'));
  });
}

/* Empreinte SHA-256 (ou empreinte locale déterministe si crypto.subtle est absent). */
export async function calculerSha256(uint8Array) {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const hashBuffer = await crypto.subtle.digest('SHA-256', uint8Array);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < uint8Array.length; i += 1) {
    h1 ^= uint8Array[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= uint8Array[i] + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `local-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export async function sauvegarderSession(etat) {
  if (!etat.document.ouvert || !etat.document.pdfBytes) return;

  const db = await ouvrirBase();
  try {
    const enregistrement = {
      nomFichier: etat.document.nomFichier,
      pdfSha256: etat.document.pdfSha256,
      nbPages: etat.document.nbPages,
      pdfBuffer: etat.document.pdfBytes.slice().buffer,
      pageCourante: etat.vue.pageCourante,
      zoom: etat.vue.zoom,
      modeZoom: etat.vue.modeZoom,
      annotations: etat.annotations,
      sauvegardeLe: new Date().toISOString()
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction(MAGASIN_SESSIONS, 'readwrite');
      const store = tx.objectStore(MAGASIN_SESSIONS);
      store.put(enregistrement, CLE_COURANTE);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Échec de l\'écriture dans IndexedDB.'));
    });
  } finally {
    db.close();
  }
}

export async function chargerSession() {
  const db = await ouvrirBase();
  try {
    const data = await new Promise((resolve, reject) => {
      const tx = db.transaction(MAGASIN_SESSIONS, 'readonly');
      const req = tx.objectStore(MAGASIN_SESSIONS).get(CLE_COURANTE);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('Échec de lecture IndexedDB.'));
    });
    if (!data || !data.pdfBuffer) return null;
    return {
      ...data,
      pdfBytes: new Uint8Array(data.pdfBuffer)
    };
  } finally {
    db.close();
  }
}

export async function effacerSession() {
  const db = await ouvrirBase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(MAGASIN_SESSIONS, 'readwrite');
      tx.objectStore(MAGASIN_SESSIONS).delete(CLE_COURANTE);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
