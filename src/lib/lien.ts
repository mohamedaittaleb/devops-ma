/**
 * Prefixe un chemin interne par la base du site.
 *
 * Sur une page de projet GitHub Pages, le site est servi sous /devops-ma :
 * un href="/devops" pointerait sur la racine du compte et donnerait un 404.
 * Tous les liens internes passent donc par ici, et basculer vers le domaine
 * devops.ma (base = '/') ne demande aucune modification de code.
 */
export function lien(chemin = '/'): string {
  const base = import.meta.env.BASE_URL || '/';
  const racine = base.endsWith('/') ? base.slice(0, -1) : base;
  const suite = chemin.startsWith('/') ? chemin : `/${chemin}`;
  return `${racine}${suite}`;
}

/** Variante absolue, pour les balises qui exigent une URL complete (og:image, RSS). */
export function lienAbsolu(chemin: string, site: URL | undefined): string {
  return new URL(lien(chemin), site ?? 'https://devops.ma').href;
}
