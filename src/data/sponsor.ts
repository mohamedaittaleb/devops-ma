/**
 * Emplacement sponsor : rendu au build, servi depuis notre domaine.
 * Aucun script tiers, aucun cookie, donc aucun bandeau de consentement.
 * La hauteur du bloc est reservee en CSS meme quand actif = false,
 * pour qu'activer un sponsor ne provoque aucun decalage de mise en page.
 */
export const SPONSOR = {
  actif: true,
  nom: 'Rayosport.ma',
  accroche: 'L’IA écrira votre code. Elle ne fera pas vos squats.',
  url: 'https://rayosport.ma',
  logo: '', // chemin dans /public, ex. /sponsors/nom.svg
} as const;
