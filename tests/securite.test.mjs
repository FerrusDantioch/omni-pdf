// Contrôles automatiques d'Omni-PDF (sans navigateur, sans dépendance externe).
// Lancement (avec Node.js) :   node --test
//
// - la règle de sécurité (CSP) est présente et stricte ;
// - rien n'est écrit en ligne dans la page (ni <style>, ni <script> avec du code, ni style=, ni onclick=…) ;
// - aucun fichier n'est chargé depuis un autre site ;
// - chaque fichier appelé par la page, le CSS, le manifeste et le Service Worker existe ;
// - les polices embarquées sont déclarées, présentes et accompagnées de leur licence ;
// - les cibles tactiles gardent une taille minimale de 44 px.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
const existe = (f) => fs.existsSync(path.join(racine, decodeURI(f)));

const html = lire('index.html');
const themeCss = lire('css/theme-omni.css');
const appCss = lire('css/app.css');
const sw = lire('sw.js');
const manifest = JSON.parse(lire('manifest.webmanifest'));

function csp() {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  if (!m) return null;
  return Object.fromEntries(
    m[1]
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([n, ...v]) => [n, v])
  );
}

test('la page a une règle de sécurité (CSP) stricte', () => {
  const c = csp();
  assert.ok(c, 'index.html : pas de CSP');
  assert.deepEqual(c['default-src'], ["'none'"]);
  assert.deepEqual(c['script-src'], ["'self'"]);
  assert.deepEqual(c['worker-src'], ["'self'"]);
  assert.deepEqual(c['style-src'], ["'self'"]);
  assert.deepEqual(c['font-src'], ["'self'"]);
  assert.deepEqual(c['object-src'], ["'none'"]);
  assert.deepEqual(c['base-uri'], ["'none'"]);
  for (const [nom, valeurs] of Object.entries(c)) {
    assert.ok(!valeurs.includes("'unsafe-inline'"), `${nom} autorise 'unsafe-inline'`);
    assert.ok(!valeurs.includes("'unsafe-eval'"), `${nom} autorise 'unsafe-eval'`);
    assert.ok(!valeurs.some((v) => /^https?:|^\*$|^\w+\.\w+/.test(v)), `${nom} autorise un autre site`);
  }
});

test("rien n'est écrit en ligne dans la page (bloqué par la CSP)", () => {
  assert.ok(!/<style[\s>]/i.test(html), 'un bloc <style> est écrit dans index.html');
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html), 'du code <script> en ligne est écrit dans index.html');
  assert.ok(!/\sstyle="/i.test(html), 'un attribut style= est présent dans index.html');
  assert.ok(!/\son[a-z]+="/i.test(html), 'un attribut événementiel on…= est présent dans index.html');
});

test("aucun fichier n'est chargé depuis un autre site", () => {
  const balises = [...html.matchAll(/<(link|script|img|iframe|source|video|audio)\b[^>]*>/gi)].map((m) => m[0]);
  for (const b of balises) {
    assert.ok(!/(src|href)="(https?:)?\/\//i.test(b), `chargement externe : ${b.slice(0, 120)}`);
  }
  assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(html + themeCss + appCss), 'Google Fonts détecté');
  assert.ok(!/@import/i.test(themeCss + appCss), '@import détecté dans CSS');
  assert.ok(!/url\(\s*["']?(https?:)?\/\//i.test(themeCss + appCss), 'ressource externe dans CSS');
});

test('chaque fichier appelé par la page, le CSS, le manifeste et le Service Worker existe', () => {
  const locaux = [
    ...[...html.matchAll(/<(?:link|script|img)\b[^>]*\b(?:src|href)="([^"#:]+)"/gi)].map((m) => m[1]),
    ...[...themeCss.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => path.posix.normalize(path.posix.join('css', m[1]))),
    ...manifest.icons.map((ic) => ic.src.replace(/^\.\//, ''))
  ];
  for (const f of locaux) {
    assert.ok(existe(f), `${f} est appelé mais n'existe pas`);
  }

  const listeSw = sw.match(/const FICHIERS_CACHE\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(listeSw, 'FICHIERS_CACHE introuvable dans sw.js');
  const entrees = [...listeSw[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  for (const entree of entrees) {
    const chemin = entree === './' ? 'index.html' : entree.replace(/^\.\//, '');
    assert.ok(existe(chemin), `Entrée du cache SW introuvable : ${entree}`);
  }
});

test('polices embarquées : déclarées, présentes et accompagnées de leur licence', () => {
  const declarees = [...themeCss.matchAll(/@font-face\s*\{[\s\S]*?url\("([^"]+)"\)/g)]
    .map((m) => m[1].replace(/^\.\.\//, ''));
  const fichiers = fs
    .readdirSync(path.join(racine, 'polices'))
    .filter((f) => f.endsWith('.woff2'))
    .map((f) => `polices/${f}`);
  assert.deepEqual([...declarees].sort(), [...fichiers].sort());

  const tiers = lire('licences-tierces.txt');
  for (const [famille, licence] of [
    ['Oxanium', 'polices/OFL-oxanium.txt'],
    ['Literata', 'polices/OFL-literata.txt'],
    ['JetBrains Mono', 'polices/OFL-jetbrains-mono.txt']
  ]) {
    assert.ok(tiers.includes(famille));
    assert.ok(tiers.includes(licence));
    assert.match(lire(licence), /SIL Open Font License/);
  }
});

test('les boutons et petits boutons gardent une cible tactile minimale de 44 px', () => {
  const reglePetit = themeCss.match(/\.petit-bouton\s*\{([\s\S]*?)\}/);
  assert.ok(reglePetit);
  assert.match(reglePetit[1], /min-height:\s*44px/);

  const regleBouton = themeCss.match(/\.bouton\s*\{([\s\S]*?)\}/);
  assert.ok(regleBouton);
  assert.match(regleBouton[1], /min-height:\s*44px/);
});
