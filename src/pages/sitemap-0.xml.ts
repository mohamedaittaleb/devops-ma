import type { APIContext } from 'astro';
import { PILIERS_LISTE } from '../consts';
import {
  tousLesArticles, tousLesTags, slugTag, lienArticle, lienTag, TAGS_SEUIL_INDEX, type Article,
} from '../lib/articles';
import { lien } from '../lib/lien';

/**
 * Le sitemap, genere a partir des articles plutot que par @astrojs/sitemap.
 *
 * L'integration listait toutes les pages construites, sans date : /recherche
 * (pourtant interdite dans robots.txt) et les pages de tag a un seul article y
 * figuraient, et rien n'indiquait a Google qu'un article avait ete revise.
 * Ici chaque URL porte son <lastmod>, et seules les pages indexables sont
 * proposees.
 *
 * A mettre a jour si une page statique est ajoutee dans src/pages.
 */
export async function GET(context: APIContext) {
  const articles = await tousLesArticles();
  const absolu = (chemin: string) => new URL(chemin, context.site).href;
  const derniere = (liste: Article[]) =>
    liste.reduce<Date | undefined>((max, a) => {
      const d = a.data.maj ?? a.data.date;
      return !max || d > max ? d : max;
    }, undefined);

  const entrees: { loc: string; lastmod?: Date }[] = [
    { loc: lien('/'), lastmod: derniere(articles) },
    { loc: lien('/archives'), lastmod: derniere(articles) },
    { loc: lien('/a-propos') },
    ...PILIERS_LISTE.map((p) => ({
      loc: lien(`/${p.slug}`),
      lastmod: derniere(articles.filter((a) => a.data.pilier === p.slug)),
    })),
    ...articles.map((a) => ({ loc: lienArticle(a), lastmod: a.data.maj ?? a.data.date })),
    ...(await tousLesTags())
      .filter(({ total }) => total >= TAGS_SEUIL_INDEX)
      .map(({ tag, slug }) => ({
        loc: lienTag(tag),
        lastmod: derniere(articles.filter((a) => a.data.tags.some((t) => slugTag(t) === slug))),
      })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entrees
  .map(({ loc, lastmod }) =>
    `  <url><loc>${absolu(loc)}</loc>${lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}</url>`)
  .join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
