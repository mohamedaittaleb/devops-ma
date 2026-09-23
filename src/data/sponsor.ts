/**
 * Emplacement sponsor : rendu au build, servi depuis notre domaine.
 * Aucun script tiers, aucun cookie, donc aucun bandeau de consentement.
 * La hauteur du bloc est reservee en CSS meme quand actif = false,
 * pour qu'activer un sponsor ne provoque aucun decalage de mise en page.
 */
export const SPONSOR = {
  actif: false,
  nom: '',
  accroche: '',
  url: '',
  logo: '', // chemin dans /public, ex. /sponsors/nom.svg
} as const;
