/**
 * Prefixe un chemin interne par la base du site.
 *
 * Sur une page de projet GitHub Pages, le site est servi sous un sous-chemin :
 * un href="/devops" pointerait sur la racine du compte et donnerait un 404.
 * Tous les liens internes passent donc par ici.
 *
 * Les chemins de page recoivent leur barre finale. GitHub Pages sert
 * /articles/x/ et redirige /articles/x vers lui en 301 : sans la barre, chaque
 * clic interne coutait un aller-retour, et chaque lien transmettait son poids
 * a une redirection plutot qu'a la page canonique. Les fichiers (rss.xml,
 * favicon.svg, og/x.png) gardent leur chemin tel quel.
 */
export function lien(chemin = '/'): string {
  const base = import.meta.env.BASE_URL || '/';
  const racine = base.endsWith('/') ? base.slice(0, -1) : base;
  const suite = chemin.startsWith('/') ? chemin : `/${chemin}`;
  return `${racine}${avecBarreFinale(suite)}`;
}

function avecBarreFinale(chemin: string): string {
  const [, avant, reste] = chemin.match(/^([^?#]*)(.*)$/)!;
  const estFichier = /\.[a-z0-9]+$/i.test(avant);
  if (estFichier || avant.endsWith('/')) return chemin;
  return `${avant}/${reste}`;
}

/** Variante absolue, pour les balises qui exigent une URL complete (og:image, RSS). */
export function lienAbsolu(chemin: string, site: URL | undefined): string {
  return new URL(lien(chemin), site ?? 'https://devops.ma').href;
}
