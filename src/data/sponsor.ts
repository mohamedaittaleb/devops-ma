/**
 * Emplacement sponsor : rendu au build, servi depuis notre domaine.
 * Aucun script tiers, aucun cookie, donc aucun bandeau de consentement.
 * Le logo est copie dans /public plutot que charge depuis le site du sponsor :
 * une seule requete vers un tiers suffirait a ruiner cette propriete.
 *
 * `fond` et `couleur` portent l'identite visuelle du sponsor du moment. Le
 * composant ne connait aucune marque : changer de sponsor, c'est changer ce
 * fichier et l'image, rien d'autre.
 */
export const SPONSOR = {
  actif: true,
  nom: 'Rayosport.ma',
  accroche: 'L’IA écrira votre code. Elle ne fera pas vos squats.',
  url: 'https://rayosport.ma',
  // Reprend leur propre promesse — « Réserve ton match » — plutot qu'un
  // « visiter le site » qui ne dit pas ce qu'on y fait.
  appel: 'Réserver un match',
  logo: '/sponsors/rayosport.png',
  // Dimensions reelles du fichier : elles reservent la place avant chargement.
  logoLargeur: 480,
  logoHauteur: 120,
  // Relevees sur rayosport.ma : bleu-nuit de fond, accent vert menthe.
  fond: '#0b0b14',
  couleur: '#00ffab',
} as const;
