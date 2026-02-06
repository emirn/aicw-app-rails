import { getCollection, type CollectionEntry } from 'astro:content';

/**
 * Get all published articles (excludes future-dated articles)
 * Articles without a published_at date are treated as published
 */
export async function getPublishedArticles(): Promise<CollectionEntry<'articles'>[]> {
  const articles = await getCollection('articles');
  const now = new Date();

  return articles.filter((article) => {
    const publishedAt = article.data.published_at;
    if (!publishedAt) return true; // No date = published
    return publishedAt <= now; // Past/present = published
  });
}
