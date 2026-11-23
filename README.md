# Omni-PDF

Application Web Progressive (PWA) **100 % hors-ligne**, conçue prioritairement pour tablette au sein de l'écosystème **Omni-Système**, dédiée à l'ouverture, l'annotation, la sauvegarde et l'exportation de fichiers PDF.

- **Zéro serveur, zéro compte, zéro IA intégrée :** toutes les polices, icônes et bibliothèques PDF (`PDF.js` et `pdf-lib`) sont embarquées localement.
- **Tactile & stylet :** boutons d'au moins 44 px, pincement à deux doigts pour zoomer, mode « Stylet seul » pour éviter les tracés accidentels avec la paume.
- **Édition complète :** tracé libre, surligneur, rectangle, ellipse, flèche, bloc de texte, note/commentaire numéroté, sélection/déplacement/redimensionnement, `Annuler` / `Rétablir`.
- **Persistance & portabilité :** auto-sauvegarde dans `IndexedDB`, export/import JSON versionné et horodaté avec validation stricte, et export PDF standard lisible dans n'importe quel lecteur PDF.

## Lancer ou installer localement

Une PWA (Service Worker + modules ES) doit être servie via HTTP/HTTPS (et non en double-cliquant sur `index.html` en `file://`). Pour tester en local :

```bash
python3 -m http.server 8080
```

Puis ouvre `http://localhost:8080` dans ton navigateur ou sur ta tablette sur le même réseau, et choisis **« Ajouter à l'écran d'accueil »** / **« Installer l'application »**.

## Déployer sur GitHub Pages

Dépose le contenu de ce dossier à la racine d'un dépôt GitHub Pages (branche `main`). Pour publier une nouvelle version, incrémente `CACHE_VERSION` dans `sw.js` et `APP_VERSION` dans `js/pwa/mise-a-jour.js` : les utilisateurs déjà installés pourront appliquer la mise à jour depuis le bouton **« Mettre à jour »** dans **« À propos »**.

## Vérifications automatiques

```bash
node --test
```

Vérifie la politique de sécurité (CSP stricte), l'absence de chargement externe et de code en ligne, la présence de tous les fichiers appelés et de ceux listés dans `sw.js`, les polices + licences, et la taille tactile minimale des boutons (44 px).

## Droits et licence

- **Code & interface :** © 2026 **Ferrus Dantioch** (avec assistance IA) — **Creative Commons BY-NC-ND 4.0** (texte complet dans [LICENSE](LICENSE)). Partage à l'identique autorisé avec attribution ; usage commercial et modifications interdits.
- **Éléments tiers :** polices SIL OFL 1.1 (`Oxanium`, `Literata`, `JetBrains Mono`), `PDF.js` (Apache-2.0) et `pdf-lib` (MIT) — détails dans [licences-tierces.txt](licences-tierces.txt).
