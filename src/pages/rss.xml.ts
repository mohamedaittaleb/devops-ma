import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE, PILIERS } from '../consts';
import { tousLesArticles, lienArticle } from '../lib/articles';

export async function GET(context: APIContext) {
  const articles = await tousLesArticles();

  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site ?? SITE.url,
    trailingSlash: false,
    customData: `<language>fr-MA</language><copyright>CC BY 4.0 — ${SITE.auteur}</copyright>`,
    items: articles.map((article) => ({
      title: article.data.titre,
      // Le resume seul : le flux amene sur le site, il ne le remplace pas.
      description: article.data.resume,
      pubDate: article.data.date,
      link: lienArticle(article),
      categories: [PILIERS[article.data.pilier].nom, ...article.data.tags],
      author: SITE.email,
    })),
  });
}
