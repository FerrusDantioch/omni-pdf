/* Panneau vue d'ensemble (miniatures de toutes les pages et compteurs d'annotations). */

import { rendreMiniature } from '../pdf/lecteur.js';

export function initialiserMiniatures(store) {
  const volet = document.getElementById('volet-miniatures');
  const liste = document.getElementById('liste-miniatures');
  const btnFermer = document.getElementById('btn-fermer-miniatures');

  let jetonRendu = 0;

  btnFermer.addEventListener('click', () => {
    store.basculerMiniatures(false);
  });

  async function reconstruireListe(etat) {
    const jetonLocal = ++jetonRendu;
    liste.replaceChildren();
    if (!etat.document.ouvert) return;

    const nb = etat.document.nbPages;
    for (let pageNum = 1; pageNum <= nb; pageNum += 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'miniature-item';
      btn.dataset.page = String(pageNum);
      if (pageNum === etat.vue.pageCourante) {
        btn.classList.add('courante');
      }

      const canvas = document.createElement('canvas');
      const meta = document.createElement('div');
      meta.className = 'miniature-meta';

      const libelle = document.createElement('span');
      libelle.textContent = `Page ${pageNum}`;

      const badge = document.createElement('span');
      badge.className = 'badge-ann cache';
      badge.dataset.badgePage = String(pageNum);

      meta.append(libelle, badge);
      btn.append(canvas, meta);
      btn.addEventListener('click', () => {
        store.definirPage(pageNum);
        if (window.innerWidth <= 780) {
          store.basculerMiniatures(false);
        }
      });

      liste.appendChild(btn);
    }

    mettreAJourEtats(etat);

    /* Rendu progressif des miniatures sans bloquer la page active */
    for (let pageNum = 1; pageNum <= nb; pageNum += 1) {
      if (jetonLocal !== jetonRendu) return;
      const item = liste.querySelector(`[data-page="${pageNum}"] canvas`);
      if (!item) continue;
      try {
        await rendreMiniature(pageNum, item, 136);
      } catch {
        /* Ignorer les miniatures si le document est fermé entre-temps */
      }
    }
  }

  function mettreAJourEtats(etat) {
    const comptes = new Map();
    for (const ann of etat.annotations) {
      comptes.set(ann.page, (comptes.get(ann.page) || 0) + 1);
    }

    liste.querySelectorAll('.miniature-item').forEach((el) => {
      const p = Number(el.dataset.page);
      el.classList.toggle('courante', p === etat.vue.pageCourante);
      const badge = el.querySelector('.badge-ann');
      const nb = comptes.get(p) || 0;
      if (badge) {
        badge.textContent = String(nb);
        badge.classList.toggle('cache', nb === 0);
      }
    });
  }

  store.abonner((etat, canal) => {
    volet.classList.toggle('cache', !etat.vue.voletMiniaturesOuvert || !etat.document.ouvert);

    if (canal === 'document') {
      reconstruireListe(etat);
    } else if (canal === 'vue' || canal === 'annotations' || canal === 'miniatures' || canal === 'tout') {
      mettreAJourEtats(etat);
    }
  });
}
