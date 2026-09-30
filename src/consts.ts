export const SITE = {
  title: 'devops.ma',
  auteur: 'Mohamed Ait Taleb',
  baseline: 'Carnet technique : DevOps, DevSecOps et automatisation par l’IA.',
  // Titre de l'accueil dans les resultats de recherche : moins de 60 caracteres
  // une fois suffixe par « — devops.ma », sinon Google le tronque.
  titreAccueil: 'Carnet DevOps au Maroc : DevSecOps, cloud et IA',
  description:
    'Le carnet technique DevOps du Maroc, en français : CI/CD, Kubernetes, DevSecOps, cloud et IA en production. Configurations exactes et mesures réelles.',
  // Pour les donnees structurees de l'auteur : c'est ce qui fait de lui une
  // entite identifiable, rattachee a des sujets precis.
  metier: 'Ingénieur DevOps',
  sujets: [
    'DevOps', 'DevSecOps', 'Kubernetes', 'OpenShift', 'CI/CD', 'Terraform',
    'AWS', 'GitHub Actions', 'Sécurité de la chaîne d’approvisionnement logicielle',
    'Inférence de modèles de langage',
  ],
  url: 'https://devops.ma',
  langue: 'fr',
  linkedin: 'https://www.linkedin.com/in/mohamed-ait-taleb-a121b288/',
  github: 'https://github.com/mohamedaittaleb',
  email: 'contact@devops.ma',
} as const;

export const PILIERS = {
  devops: {
    slug: 'devops',
    nom: 'DevOps',
    titre: 'DevOps',
    // Titre de la page dans les resultats de recherche ; le h1 reste court.
    titreSeo: 'DevOps : CI/CD, infrastructure as code et observabilité',
    description:
      'Intégration et déploiement continus, infrastructure as code, observabilité. Le socle : ce qui tourne, ce qui coûte, ce qui casse.',
  },
  devsecops: {
    slug: 'devsecops',
    nom: 'DevSecOps',
    titre: 'DevSecOps',
    titreSeo: 'DevSecOps : sécuriser la chaîne de livraison',
    description:
      'Sécuriser la chaîne de livraison sans la paralyser : secrets, supply chain, signature d’images, politiques d’admission.',
  },
  'ai-devops': {
    slug: 'ai-devops',
    nom: 'AI-DevOps',
    titre: 'AI-DevOps',
    titreSeo: 'AI-DevOps : LLM, GPU et agents en production',
    description:
      'Les agents entrent dans la chaîne de production. Ce qu’ils apportent réellement, ce qu’ils coûtent, et comment les gouverner.',
  },
  cloud: {
    slug: 'cloud',
    nom: 'Cloud',
    titre: 'Cloud',
    titreSeo: 'Cloud : AWS vu depuis l’exploitation',
    description:
      'AWS et les autres fournisseurs vus depuis l’exploitation : ce qu’un service impose, ce qu’il coûte à l’arrêt, et lequel choisir quand deux se ressemblent.',
  },
} as const;

export type PilierSlug = keyof typeof PILIERS;
export const PILIERS_LISTE = Object.values(PILIERS);
