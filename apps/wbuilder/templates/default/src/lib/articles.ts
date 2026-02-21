import { getCollection, type CollectionEntry } from 'astro:content';
import { getConfig } from './config';

/**
 * Get all published articles (excludes future-dated articles)
 * Articles without a published_at date are treated as published
 * In preview mode (show_preview_banner), all articles are included regardless of date
 */
export async function getPublishedArticles(): Promise<CollectionEntry<'articles'>[]> {
  const articles = await getCollection('articles');
  const config = getConfig();

  // In preview mode, show all articles regardless of publish date
  if (config.seo?.show_preview_banner) return articles;

  const now = new Date();

  return articles.filter((article) => {
    const publishedAt = article.data.published_at;
    if (!publishedAt) return true; // No date = published
    return publishedAt <= now; // Past/present = published
  });
}
