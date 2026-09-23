import { getCollection, type CollectionEntry } from 'astro:content';
import { PILIERS, type PilierSlug } from '../consts';
import { lien } from './lien';

export type Article = CollectionEntry<'articles'>;

/** 200 mots/minute : la vitesse de lecture d'un texte technique, pas d'un roman. */
const MOTS_PAR_MINUTE = 200;

export function minutesDeLecture(article: Article): number {
  if (article.data.tempsLecture) return article.data.tempsLecture;
  const mots = (article.body ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(mots / MOTS_PAR_MINUTE));
}

export function lienArticle(article: Article): string {
  return lien(`/articles/${article.id}`);
}

export function pilierDe(article: Article) {
  return PILIERS[article.data.pilier];
}

/**
 * Les brouillons restent visibles en `astro dev` pour se relire en conditions
 * reelles, et disparaissent du build de production.
 */
export async function tousLesArticles(): Promise<Article[]> {
  const articles = await getCollection('articles', ({ data }) =>
    import.meta.env.PROD ? data.brouillon === false : true,
  );
  return articles.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function articlesDuPilier(pilier: PilierSlug): Promise<Article[]> {
  return (await tousLesArticles()).filter((a) => a.data.pilier === pilier);
}

/**
 * Les tags s'ecrivent avec leurs accents (« cout » reste « cout » a l'affichage)
 * mais leur URL est depilee en ASCII : un /tags/co%C3%BBt survit mal aux lecteurs
 * RSS, aux outils de mesure et au copier-coller.
 */
export function slugTag(tag: string): string {
  return tag
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function lienTag(tag: string): string {
  return lien(`/tags/${slugTag(tag)}`);
}

/** Tous les tags utilises, du plus frequent au moins frequent puis alphabetique. */
export async function tousLesTags(): Promise<{ tag: string; slug: string; total: number }[]> {
  const compte = new Map<string, number>();
  for (const article of await tousLesArticles()) {
    for (const tag of article.data.tags) compte.set(tag, (compte.get(tag) ?? 0) + 1);
  }
  return [...compte.entries()]
    .map(([tag, total]) => ({ tag, slug: slugTag(tag), total }))
    .sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag, 'fr'));
}
