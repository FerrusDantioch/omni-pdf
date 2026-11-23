/* Service Worker d'Omni-PDF : fonctionnement 100 % hors-ligne et mises à jour maîtrisées. */
/* Change CACHE_VERSION pour déclencher une mise à jour chez les utilisateurs. */
const CACHE_VERSION = 'omni-pdf-v1.0.1';

const FICHIERS_CACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './LICENSE',
  './licences-tierces.txt',
  './css/theme-omni.css',
  './css/app.css',
  './icones/icone-omni-pdf.svg',
  './icones/icone-192.png',
  './icones/icone-512.png',
  './polices/jetbrains-mono-latin-500-normal.woff2',
  './polices/jetbrains-mono-latin-700-normal.woff2',
  './polices/literata-latin-opsz-italic.woff2',
  './polices/literata-latin-opsz-normal.woff2',
  './polices/oxanium-latin-500-normal.woff2',
  './polices/oxanium-latin-700-normal.woff2',
  './polices/oxanium-latin-800-normal.woff2',
  './vendor/pdfjs/pdf.min.mjs',
  './vendor/pdfjs/pdf.worker.min.mjs',
  './vendor/pdf-lib/pdf-lib.min.js',
  './js/app.js',
  './js/etat/historique.js',
  './js/etat/store.js',
  './js/pdf/coordonnees.js',
  './js/pdf/lecteur.js',
  './js/pdf/export-pdf.js',
  './js/annotations/modele.js',
  './js/annotations/moteur-rendu.js',
  './js/annotations/interaction.js',
  './js/stockage/indexeddb.js',
  './js/stockage/json-io.js',
  './js/pwa/mise-a-jour.js',
  './js/ui/barre-outils.js',
  './js/ui/miniatures.js',
  './js/ui/editeur-texte.js',
  './js/ui/modale-apropos.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(FICHIERS_CACHE))
  );
  /* On n'appelle pas skipWaiting() ici : l'utilisateur applique la mise à jour via le bouton « Mettre à jour ». */
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((noms) =>
      Promise.all(
        noms
          .filter((nom) => nom !== CACHE_VERSION)
          .map((nom) => caches.delete(nom))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const requete = event.request;
  if (requete.method !== 'GET') return;

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(requete, { ignoreSearch: true }).then((reponseCache) => {
      if (reponseCache) return reponseCache;

      return fetch(requete)
        .then((reponseReseau) => {
          if (reponseReseau && reponseReseau.ok && reponseReseau.type === 'basic') {
            const copie = reponseReseau.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(requete, copie));
          }
          return reponseReseau;
        })
        .catch(() => {
          if (requete.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Ressource indisponible hors ligne.', {
            status: 503,
            statusText: 'Hors ligne'
          });
        });
    })
  );
});
