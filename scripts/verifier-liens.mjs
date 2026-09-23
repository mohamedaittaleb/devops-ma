#!/usr/bin/env node
/**
 * Verifie que chaque lien interne du site construit pointe sur un fichier
 * qui existe reellement dans dist/.
 *
 * Ce controle existe parce qu'une base mal propagee (page de projet GitHub
 * Pages servie sous /devops-ma) produit un site qui se construit sans la
 * moindre erreur et dont tous les liens sont casses. Le build ne peut pas
 * le voir ; ceci si.
 */
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, extname, sep } from 'node:path';
import { exit } from 'node:process';

const DIST = 'dist';

async function fichiers(racine) {
  const trouves = [];
  for (const entree of await readdir(racine, { withFileTypes: true })) {
    const chemin = join(racine, entree.name);
    if (entree.isDirectory()) trouves.push(...(await fichiers(chemin)));
    else trouves.push(chemin);
  }
  return trouves;
}

const tous = await fichiers(DIST);
const pages = tous.filter((f) => extname(f) === '.html');

if (pages.length === 0) {
  console.error('dist/ ne contient aucune page : le build a-t-il tourne ?');
  exit(1);
}

/**
 * La base est lue dans le <link rel="canonical"> de l'accueil plutot que
 * codee en dur : elle suit ainsi automatiquement SITE_BASE, et le controle
 * ne peut pas diverger de ce que le build a reellement produit.
 */
const accueil = readFileSync(join(DIST, 'index.html'), 'utf8');
const canonique = accueil.match(/<link rel="canonical" href="([^"]+)"/);
if (!canonique) {
  console.error("Aucun <link rel=\"canonical\"> sur l'accueil : base indeterminable.");
  exit(1);
}
const base = new URL(canonique[1]).pathname.replace(/\/$/, '');
console.log(`Base detectee : ${base || '/'}`);

// dist/ est servi a la racine de la base : /devops-ma/devops -> dist/devops
const servables = new Set(['/']);
for (const f of tous) {
  const url = '/' + relative(DIST, f).split(sep).join('/');
  servables.add(url);
  if (url.endsWith('/index.html')) servables.add(url.slice(0, -'/index.html'.length) || '/');
}

const casses = [];
const horsBase = [];

for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  for (const [, href] of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    const chemin = decodeURIComponent(href.split('#')[0].split('?')[0]);

    if (base && !(chemin === base || chemin.startsWith(`${base}/`))) {
      // Un lien absolu qui ignore la base : casse des que le site n'est pas a la racine.
      horsBase.push(`${relative(DIST, page)}  ->  ${href}`);
      continue;
    }

    const cible = (base ? chemin.slice(base.length) : chemin).replace(/\/$/, '') || '/';
    if (!servables.has(cible) && !servables.has(`${cible}/index.html`)) {
      casses.push(`${relative(DIST, page)}  ->  ${href}`);
    }
  }
}

console.log(`${pages.length} pages verifiees, ${servables.size} chemins servables.`);

let echec = false;
for (const [titre, liste] of [
  ['lien(s) interne(s) casse(s)', casses],
  ['lien(s) absolu(s) ignorant la base', horsBase],
]) {
  if (liste.length === 0) continue;
  echec = true;
  console.error(`\n${liste.length} ${titre} :`);
  for (const l of [...new Set(liste)].sort().slice(0, 40)) console.error('  ' + l);
}

if (echec) exit(1);
console.log('Aucun lien interne casse.');
