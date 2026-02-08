import { defineCollection, z } from 'astro:content';

const articles = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    updated_at: z.coerce.date().optional(),
    published_at: z.coerce.date().optional(),
    image_hero: z.string().optional(),
    image_og: z.string().optional(),
    keywords: z.union([
      z.array(z.string()),
      z.string().transform((s) => s.split(',').map((k) => k.trim()))
    ]).optional(),
    author: z.string().optional(),
    categories: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    og_title: z.string().optional(),
    og_description: z.string().optional(),
    twitter_title: z.string().optional(),
    twitter_description: z.string().optional(),
    breadcrumbs: z.string().optional(),
  }),
});

export const collections = { articles };
