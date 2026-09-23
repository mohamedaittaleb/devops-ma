export const SITE = {
  title: 'devops.ma',
  auteur: 'Mohamed',
  baseline: 'Carnet technique : DevOps, DevSecOps et automatisation par l’IA.',
  description:
    'Articles techniques en français sur le DevOps, le DevSecOps et l’AI-DevOps. Labos reproductibles, retours d’expérience et mesures réelles.',
  url: 'https://devops.ma',
  langue: 'fr',
  linkedin: 'https://www.linkedin.com/in/mohamed-ait-taleb-a121b288/',
  github: 'https://github.com/…',
  email: 'contact@devops.ma',
} as const;

export const PILIERS = {
  devops: {
    slug: 'devops',
    nom: 'DevOps',
    titre: 'DevOps',
    description:
      'Intégration et déploiement continus, infrastructure as code, observabilité. Le socle : ce qui tourne, ce qui coûte, ce qui casse.',
  },
  devsecops: {
    slug: 'devsecops',
    nom: 'DevSecOps',
    titre: 'DevSecOps',
    description:
      'Sécuriser la chaîne de livraison sans la paralyser : secrets, supply chain, signature d’images, politiques d’admission.',
  },
  'ai-devops': {
    slug: 'ai-devops',
    nom: 'AI-DevOps',
    titre: 'AI-DevOps',
    description:
      'Les agents entrent dans la chaîne de production. Ce qu’ils apportent réellement, ce qu’ils coûtent, et comment les gouverner.',
  },
} as const;

export type PilierSlug = keyof typeof PILIERS;
export const PILIERS_LISTE = Object.values(PILIERS);
