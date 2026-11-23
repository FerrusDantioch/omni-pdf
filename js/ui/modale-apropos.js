/* Modale « À propos » : licence Omni-Système, crédits Ferrus Dantioch + IA et bouton Mettre à jour. */

import {
  APP_VERSION,
  abonnerStatutPwa,
  appliquerMiseAJour,
  verifierMiseAJour
} from '../pwa/mise-a-jour.js';

export function initialiserModaleApropos({ afficherToast }) {
  const btnApropos = document.getElementById('btn-apropos');
  const pastilleMaj = document.getElementById('pastille-maj');
  const modale = document.getElementById('modale-apropos');
  const labelVersion = document.getElementById('apropos-version');
  const statutPwa = document.getElementById('apropos-statut-pwa');
  const msgMaj = document.getElementById('apropos-msg-maj');
  const btnVerifier = document.getElementById('btn-verifier-maj');
  const btnAppliquer = document.getElementById('btn-appliquer-maj');
  const btnFermerHaut = document.getElementById('btn-fermer-apropos');
  const btnFermerBas = document.getElementById('btn-fermer-apropos-bas');

  labelVersion.textContent = APP_VERSION;

  function afficherMessageMaj(texte, type = '') {
    msgMaj.textContent = texte;
    msgMaj.className = 'cadre-message';
    if (type) msgMaj.classList.add(type);
    msgMaj.classList.remove('cache');
  }

  btnApropos.addEventListener('click', () => {
    msgMaj.classList.add('cache');
    modale.showModal();
  });

  btnFermerHaut.addEventListener('click', () => modale.close());
  btnFermerBas.addEventListener('click', () => modale.close());

  btnVerifier.addEventListener('click', async () => {
    btnVerifier.disabled = true;
    const res = await verifierMiseAJour();
    btnVerifier.disabled = false;
    afficherMessageMaj(res.message, res.trouve ? 'succes' : '');
  });

  btnAppliquer.addEventListener('click', () => {
    const ok = appliquerMiseAJour();
    if (ok) {
      afficherMessageMaj('Application de la mise à jour et rechargement...', 'succes');
    } else {
      afficherToast('Aucune mise à jour en attente pour le moment.');
    }
  });

  abonnerStatutPwa((etat) => {
    statutPwa.textContent = etat.message;
    btnAppliquer.disabled = !etat.miseAJourDisponible;
    pastilleMaj.classList.toggle('cache', !etat.miseAJourDisponible);
    if (etat.miseAJourDisponible) {
      afficherMessageMaj(
        'Nouvelle version prête ! Clique sur « Mettre à jour » pour l\'appliquer sans perdre ton travail.',
        'succes'
      );
    }
  });
}
