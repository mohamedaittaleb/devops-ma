import type { APIContext } from 'astro';
import { lien } from '../lib/lien';

/**
 * Garde l'adresse sitemap-index.xml que produisait @astrojs/sitemap : c'est
 * celle que robots.txt annonce et que la Search Console a peut-etre deja
 * enregistree.
 */
export function GET(context: APIContext) {
  const sitemap = new URL(lien('/sitemap-0.xml'), context.site).href;
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${sitemap}</loc></sitemap>
</sitemapindex>
`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
}
