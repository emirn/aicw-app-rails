import { type CollectionEntry } from 'astro:content';
import { getConfig, type SiteConfig } from './config';
import { getPublishedArticles } from './articles';

/**
 * Generate a URL-safe slug from a tag name
 */
export function tagSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Get the URL for a tag page
 */
export function getTagUrl(name: string, config?: SiteConfig): string {
  const cfg = config || getConfig();
  const prefix = cfg.tags?.url_prefix || 'tag';
  return `/${prefix}/${tagSlug(name)}/`;
}

/**
 * Get all unique tags from published articles
 */
export async function getAllTags(): Promise<string[]> {
  const articles = await getPublishedArticles();
  const tagsSet = new Set<string>();

  for (const article of articles) {
    const tags = article.data.tags || [];
    for (const tag of tags) {
      tagsSet.add(tag);
    }
  }

  return Array.from(tagsSet).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
}

/**
 * Get tag data with article counts (only counts published articles)
 */
export async function getTagsWithCounts(): Promise<Array<{
  name: string;
  slug: string;
  count: number;
  url: string;
}>> {
  const articles = await getPublishedArticles();
  const config = getConfig();
  const tagCounts = new Map<string, number>();

  for (const article of articles) {
    const tags = article.data.tags || [];
    for (const tag of tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  return Array.from(tagCounts.entries())
    .map(([name, count]) => ({
      name,
      slug: tagSlug(name),
      count,
      url: getTagUrl(name, config),
    }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

/**
 * Get published articles for a specific tag
 */
export async function getArticlesByTag(
  tagName: string
): Promise<CollectionEntry<'articles'>[]> {
  const articles = await getPublishedArticles();
  const slug = tagSlug(tagName);

  return articles
    .filter((article) => {
      const tags = article.data.tags || [];
      return tags.some((tag) => tagSlug(tag) === slug);
    })
    .sort((a, b) => {
      const dateA = a.data.published_at?.getTime() || 0;
      const dateB = b.data.published_at?.getTime() || 0;
      return dateB - dateA;
    });
}

/**
 * Find the original tag name from a slug
 */
export async function findTagBySlug(slug: string): Promise<string | null> {
  const tags = await getAllTags();
  return tags.find((tag) => tagSlug(tag) === slug) || null;
}
