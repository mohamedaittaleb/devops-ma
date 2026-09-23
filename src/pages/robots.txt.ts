import type { APIContext } from 'astro';
import { lien } from '../lib/lien';

/**
 * Genere plutot qu'ecrit a la main : l'URL du sitemap doit suivre la cible de
 * publication. Code en dur, il annoncait https://devops.ma/sitemap-index.xml
 * meme depuis une page de projet GitHub Pages.
 *
 * Note : sur une page de projet, ce fichier est servi sous /devops-ma/robots.txt
 * et les moteurs ne lisent que celui de la racine du domaine. Il ne devient
 * réellement actif qu'une fois le site sur son propre domaine.
 */
export function GET(context: APIContext) {
  const sitemap = new URL(lien('/sitemap-index.xml'), context.site).href;

  return new Response(
    `User-agent: *
Allow: /

# La page de recherche n'a aucun contenu propre : son index vient d'ailleurs.
Disallow: ${lien('/recherche')}

Sitemap: ${sitemap}
`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
}
