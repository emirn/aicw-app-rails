/**
 * Published Parser
 *
 * Parses published articles from the published/ folder and converts them
 * to the BlogPostGenArticle format expected by the Website Builder API.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';

/**
 * Article format expected by the Website Builder API
 */
export interface BlogPostGenArticle {
  path: string;
  meta: {
    title: string;
    description: string;
    keywords: string[];
    date: string;
    updated_at?: string;
    published_at?: string;
    image_hero?: string;
    image_og?: string;
  };
  content: string;
}

/**
 * Parse all published articles from the published/ folder
 *
 * @param publishedDir - Absolute path to the published/ directory
 * @returns Array of parsed articles
 */
export async function parsePublishedFolder(publishedDir: string): Promise<BlogPostGenArticle[]> {
  const articles: BlogPostGenArticle[] = [];
  await scanDir(publishedDir, '', articles);
  return articles;
}

/**
 * Recursively scan directory for markdown files
 */
async function scanDir(baseDir: string, relativePath: string, articles: BlogPostGenArticle[]): Promise<void> {
  const dirPath = path.join(baseDir, relativePath);
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return; // Directory doesn't exist
  }

  for (const entry of entries) {
    const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      await scanDir(baseDir, entryRelPath, articles);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const fullPath = path.join(dirPath, entry.name);
      const content = await fs.readFile(fullPath, 'utf8');
      const article = parseArticle(entryRelPath, content);
      if (article) articles.push(article);
    }
  }
}

/**
 * Parse a single article from markdown with frontmatter
 *
 * @param relativePath - Relative path from published/ (e.g., "guide/article.md")
 * @param fileContent - Raw file content including frontmatter
 * @returns Parsed article or null if invalid
 */
function parseArticle(relativePath: string, fileContent: string): BlogPostGenArticle | null {
  const { data: frontmatter, content } = matter(fileContent);

  // Path from relative: "guide/article.md" -> "guide/article"
  const articlePath = relativePath.replace(/\.md$/, '');

  // Parse keywords (comma-separated string -> array)
  let keywords: string[] = [];
  if (typeof frontmatter.keywords === 'string') {
    keywords = frontmatter.keywords.split(',').map(k => k.trim()).filter(Boolean);
  } else if (Array.isArray(frontmatter.keywords)) {
    keywords = frontmatter.keywords;
  }

  // Parse dates
  const date = parseDate(frontmatter.date);
  const updated_at = frontmatter.updated_at ? parseDate(frontmatter.updated_at) : undefined;
  const published_at = frontmatter.published_at ? parseDate(frontmatter.published_at) : undefined;

  return {
    path: articlePath,
    meta: {
      title: frontmatter.title || 'Untitled',
      description: frontmatter.description || '',
      keywords,
      date,
      updated_at,
      published_at,
      image_hero: frontmatter.image_hero,
      image_og: frontmatter.og_image || frontmatter.image_social,
    },
    content: content.trim(),
  };
}

/**
 * Parse date value to ISO string
 *
 * @param dateValue - Date value from frontmatter (Date, string, or undefined)
 * @returns ISO date string
 */
function parseDate(dateValue: unknown): string {
  if (!dateValue) return new Date().toISOString();
  if (dateValue instanceof Date) return dateValue.toISOString();
  const str = String(dateValue);
  // Handle "2026-01-13 14:27:41" format (common in YAML)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
    return new Date(str.replace(' ', 'T') + '.000Z').toISOString();
  }
  return new Date(str).toISOString();
}
