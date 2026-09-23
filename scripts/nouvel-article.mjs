#!/usr/bin/env node
/**
 * Cree un article pre-rempli : npm run new -- "Mon titre" devops
 *
 * Le fichier sort en brouillon. Un brouillon est visible en `astro dev`
 * et absent du build de production : on peut donc pousser un article
 * inacheve sans le publier.
 */
import { writeFile, access, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, exit } from 'node:process';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = join(RACINE, 'src', 'content', 'articles');
const PILIERS = ['devops', 'devsecops', 'ai-devops'];

/** Slug d'URL : minuscules, accents depiles, tout le reste en tirets. */
function slugifier(texte) {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/, '');
}

const [titre, pilier = 'devops'] = argv.slice(2);

if (!titre) {
  console.error('Usage : npm run new -- "Titre de l\'article" [%s]', PILIERS.join('|'));
  exit(1);
}
if (!PILIERS.includes(pilier)) {
  console.error('Pilier inconnu : « %s ». Attendu : %s', pilier, PILIERS.join(', '));
  exit(1);
}
if (titre.length > 90) {
  console.error('Titre trop long : %d caracteres, 90 maximum (contrainte du schema).', titre.length);
  exit(1);
}

const slug = slugifier(titre);
const chemin = join(DOSSIER, `${slug}.md`);

// Ne jamais ecraser un article existant : un article publie a une URL stable.
try {
  await access(chemin);
  console.error('Ce fichier existe deja : src/content/articles/%s.md', slug);
  exit(1);
} catch {
  // absent, donc creable
}

const aujourdhui = new Date().toISOString().slice(0, 10);

const gabarit = `---
titre: ${JSON.stringify(titre)}
resume: "REMPLACER — entre 60 et 220 caracteres. C'est la meta description ET le chapeau : annoncez le resultat, pas le sujet."
pilier: ${pilier}
date: ${aujourdhui}
tags: ["a-remplacer"]
repo: null
brouillon: true
---

## Le probleme

De quoi on part, et pourquoi c'etait genant. Une situation concrete, datee,
avec le chiffre qui rendait la situation insupportable.

## Ce que j'ai mesure

Les commandes exactes, la sortie brute. Un article sans mesure est un avis.

## Ce que j'ai change

Les fichiers de configuration en entier, pas des extraits qui ne tournent pas.

## Le resultat

Le tableau avant/apres. Y compris la colonne qui n'est pas flatteuse.

## Ce qui n'a pas marche

Les impasses. C'est la section que les lecteurs citent le plus :
elle leur epargne l'apres-midi qu'elle m'a coute.
`;

await mkdir(DOSSIER, { recursive: true });
await writeFile(chemin, gabarit, 'utf8');

console.log(`
Cree   src/content/articles/${slug}.md
URL    /articles/${slug}
Etat   brouillon (visible en dev, absent du build de production)

Passez « brouillon » a false pour publier.
`);
