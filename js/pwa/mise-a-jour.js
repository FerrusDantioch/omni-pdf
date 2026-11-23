/* Enregistrement du Service Worker et cycle de mise à jour PWA maîtrisé par l'utilisateur. */

export const APP_VERSION = '1.0.1';

let enregistrementSw = null;
let miseAJourPrete = false;
let rechargementLance = false;
const ecouteursStatut = new Set();

function notifier(etat) {
  for (const fn of ecouteursStatut) {
    fn(etat);
  }
}

function construireEtat() {
  if (!('serviceWorker' in navigator)) {
    return {
      supporte: false,
      actif: false,
      miseAJourDisponible: false,
      message: 'Ce navigateur ne supporte pas les Service Workers (vérifie HTTPS ou localhost).'
    };
  }
  return {
    supporte: true,
    actif: Boolean(enregistrementSw?.active || navigator.serviceWorker.controller),
    miseAJourDisponible: miseAJourPrete,
    message: miseAJourPrete
      ? 'Une nouvelle version d\'Omni-PDF est prête. Clique sur « Mettre à jour » pour l\'appliquer.'
      : 'Ton application est prête pour fonctionner 100 % hors-ligne.'
  };
}

function surveillerInstallation(worker) {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      miseAJourPrete = true;
      notifier(construireEtat());
    }
  });
}

export function abonnerStatutPwa(ecouteur) {
  ecouteursStatut.add(ecouteur);
  ecouteur(construireEtat());
  return () => ecouteursStatut.delete(ecouteur);
}

export async function initialiserPwa() {
  if (!('serviceWorker' in navigator)) {
    notifier(construireEtat());
    return;
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (rechargementLance) return;
    rechargementLance = true;
    window.location.reload();
  });

  try {
    enregistrementSw = await navigator.serviceWorker.register('./sw.js', { scope: './' });

    if (enregistrementSw.waiting) {
      miseAJourPrete = true;
    }

    if (enregistrementSw.installing) {
      surveillerInstallation(enregistrementSw.installing);
    }

    enregistrementSw.addEventListener('updatefound', () => {
      surveillerInstallation(enregistrementSw.installing);
    });
  } catch (err) {
    notifier({
      supporte: true,
      actif: false,
      miseAJourDisponible: false,
      message: `Mode hors-ligne indisponible dans ce contexte (${err.message}).`
    });
    return;
  }

  notifier(construireEtat());
}

export async function verifierMiseAJour() {
  if (!enregistrementSw) {
    return { trouve: false, message: 'Le Service Worker n\'est pas enregistré (contexte local/non sécurisé).' };
  }

  try {
    await enregistrementSw.update();
    if (enregistrementSw.waiting) {
      miseAJourPrete = true;
      notifier(construireEtat());
      return { trouve: true, message: 'Une nouvelle version est prête ! Clique sur « Mettre à jour ».' };
    }
    if (enregistrementSw.installing) {
      surveillerInstallation(enregistrementSw.installing);
      return { trouve: false, message: 'Téléchargement de la nouvelle version en cours...' };
    }
    return { trouve: false, message: 'Tu utilises déjà la dernière version disponible.' };
  } catch {
    return {
      trouve: false,
      message: 'Impossible de vérifier les mises à jour hors connexion.'
    };
  }
}

export function appliquerMiseAJour() {
  if (enregistrementSw?.waiting) {
    enregistrementSw.waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }
  return false;
}
