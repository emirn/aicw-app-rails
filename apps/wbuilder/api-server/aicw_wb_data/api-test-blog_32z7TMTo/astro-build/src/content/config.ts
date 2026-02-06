import { defineCollection, z } from 'astro:content';

const articles = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    date_updated_at: z.coerce.date().optional(),
    image_hero: z.string().optional(),
    image_og: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    author: z.string().optional(),
    categories: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const collections = { articles };
