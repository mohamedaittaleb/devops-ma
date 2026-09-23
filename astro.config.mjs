// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { satteri } from '@astrojs/markdown-satteri';
import { blocsPlugin } from './src/lib/satteri-blocs.mjs';

/**
 * Cible de publication. Les valeurs par defaut visent la page de projet
 * GitHub Pages ; le workflow de deploiement les confirme explicitement.
 *
 * Pour basculer sur le domaine propre le jour ou le DNS pointe vers GitHub :
 *   SITE_URL=https://devops.ma SITE_BASE=/ npm run build
 * (ou changer les deux valeurs par defaut ci-dessous, et ajouter public/CNAME)
 * Aucun autre fichier n'est a toucher : les liens internes passent tous par
 * src/lib/lien.ts, qui lit la base au moment du build.
 */
const SITE_URL = process.env.SITE_URL || 'https://mohamedaittaleb.github.io';

// actions/configure-pages renvoie base_path = "" (et non "/") pour un site
// servi a la racine d'un domaine. `??` ne rattrape pas la chaine vide : sans
// cette normalisation, Astro recevrait base: '' le jour du passage a devops.ma.
const BASE_BRUT = process.env.SITE_BASE ?? '/devops-ma';
const SITE_BASE = BASE_BRUT === '' ? '/' : BASE_BRUT;

export default defineConfig({
  site: SITE_URL,
  base: SITE_BASE,
  trailingSlash: 'ignore',
  integrations: [mdx(), sitemap()],
  vite: { plugins: [tailwindcss()] },
  markdown: {
    processor: satteri({ hastPlugins: [blocsPlugin] }),
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: true,
    },
  },
});
