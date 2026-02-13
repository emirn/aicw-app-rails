import { type CollectionEntry } from 'astro:content';
import { getConfig, type SiteConfig } from './config';
import { getPublishedArticles } from './articles';

/**
 * Generate a URL-safe slug from a category name
 */
export function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Get the URL for a category page
 */
export function getCategoryUrl(name: string, config?: SiteConfig): string {
  const cfg = config || getConfig();
  const prefix = cfg.categories?.url_prefix || 'category';
  return `/${prefix}/${categorySlug(name)}/`;
}

/**
 * Get all unique categories from published articles
 */
export async function getAllCategories(): Promise<string[]> {
  const articles = await getPublishedArticles();
  const categoriesSet = new Set<string>();

  for (const article of articles) {
    const cats = article.data.categories || [];
    for (const cat of cats) {
      categoriesSet.add(cat);
    }
  }

  return Array.from(categoriesSet).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
}

/**
 * Get category data with article counts (only counts published articles)
 */
export async function getCategoriesWithCounts(): Promise<Array<{
  name: string;
  slug: string;
  count: number;
  url: string;
}>> {
  const articles = await getPublishedArticles();
  const config = getConfig();
  const categoryCounts = new Map<string, number>();

  for (const article of articles) {
    const cats = article.data.categories || [];
    for (const cat of cats) {
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    }
  }

  return Array.from(categoryCounts.entries())
    .map(([name, count]) => ({
      name,
      slug: categorySlug(name),
      count,
      url: getCategoryUrl(name, config),
    }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

/**
 * Get published articles for a specific category
 */
export async function getArticlesByCategory(
  categoryName: string
): Promise<CollectionEntry<'articles'>[]> {
  const articles = await getPublishedArticles();
  const slug = categorySlug(categoryName);

  return articles
    .filter((article) => {
      const cats = article.data.categories || [];
      return cats.some((cat) => categorySlug(cat) === slug);
    })
    .sort((a, b) => {
      const dateA = a.data.published_at?.getTime() || 0;
      const dateB = b.data.published_at?.getTime() || 0;
      return dateB - dateA; // Sort by date descending
    });
}

/**
 * Find the original category name from a slug
 */
export async function findCategoryBySlug(slug: string): Promise<string | null> {
  const categories = await getAllCategories();
  return categories.find((cat) => categorySlug(cat) === slug) || null;
}
