import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/articles' }),
  schema: z.object({
    titre: z.string().max(90),
    // Le resume sert de meta description ET de chapeau. Il est obligatoire :
    // un article sans promesse claire n'est pas pret a etre publie.
    resume: z.string().min(60).max(220),
    pilier: z.enum(['devops', 'devsecops', 'ai-devops']),
    date: z.coerce.date(),
    maj: z.coerce.date().optional(),
    tags: z.array(z.string()).min(1).max(6),
    // Un article technique sans code publie n'est qu'une opinion.
    // Laisser a null seulement pour les articles de reflexion.
    repo: z.url().nullable().default(null),
    lang: z.enum(['fr', 'en']).default('fr'),
    brouillon: z.boolean().default(false),
    tempsLecture: z.number().int().positive().optional(),
  }),
});

export const collections = { articles };
