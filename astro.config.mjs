// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { satteri } from '@astrojs/markdown-satteri';
import { blocsPlugin } from './src/lib/satteri-blocs.mjs';

/**
 * Cible de publication. Le workflow de deploiement transmet l'origine et la
 * base reelles du site Pages ; les valeurs par defaut reproduisent la
 * production, pour qu'un build local produise les memes URL canoniques.
 * Les liens internes passent tous par src/lib/lien.ts, qui lit la base au
 * moment du build.
 */
const SITE_URL_BRUT = process.env.SITE_URL || 'https://devops.ma';

// actions/configure-pages renvoie l'origine en http:// tant que « Enforce
// HTTPS » n'est pas coche dans les reglages Pages. Le site est pourtant servi
// en HTTPS : sans cette correction, chaque canonical, chaque og:url et tout le
// sitemap designaient la version http, et Google recevait deux adresses pour
// chaque page. Seul localhost garde le droit au http.
const SITE_URL = SITE_URL_BRUT.replace(/^http:\/\/(?!localhost|127\.0\.0\.1)/, 'https://');

// actions/configure-pages renvoie base_path = "" (et non "/") pour un site
// servi a la racine d'un domaine. `??` ne rattrape pas la chaine vide : sans
// cette normalisation, Astro recevrait base: ''.
const BASE_BRUT = process.env.SITE_BASE ?? '/';
const SITE_BASE = BASE_BRUT === '' ? '/' : BASE_BRUT;

export default defineConfig({
  site: SITE_URL,
  base: SITE_BASE,
  trailingSlash: 'ignore',
  // Pas d'integration sitemap : le sitemap est genere par src/pages/sitemap-*.xml.ts,
  // qui connait les dates de mise a jour et les pages a ne pas proposer.
  integrations: [mdx()],
  vite: { plugins: [tailwindcss()] },
  markdown: {
    processor: satteri({ hastPlugins: [blocsPlugin] }),
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: true,
    },
  },
});
