/**
 * Astro Integration for OG Image Generation
 *
 * Generates OG images for all articles during build time.
 * Runs in the astro:build:done hook after the site is built.
 *
 * Output: dist/assets/<article-slug>/og.webp
 */

import type { AstroIntegration } from 'astro';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateOGImage, type OGImageConfig } from '../lib/og-image-generator.js';
import { selectOGImageSource } from '../lib/og-image-selector.js';

interface ArticleFrontmatter {
  title: string;
  description?: string;
  image_hero?: string;
  author?: string;
  date?: string;
}

interface ParsedArticle {
  slug: string;
  frontmatter: ArticleFrontmatter;
  body: string;
}

/**
 * Parse YAML frontmatter from markdown content
 * Simple parser for the fields we need
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const yamlContent = match[1];
  const body = match[2];

  // Simple YAML parsing for our needs
  const frontmatter: Record<string, any> = {};
  const lines = yamlContent.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

/**
 * Get all articles from the content/articles directory
 */
async function getArticles(projectRoot: string): Promise<ParsedArticle[]> {
  const articlesDir = path.join(projectRoot, 'src/content/articles');
  const articles: ParsedArticle[] = [];

  try {
    const entries = await fs.readdir(articlesDir, { withFileTypes: true, recursive: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.md') && !entry.name.endsWith('.mdx')) continue;

      // Build the full path - handle nested directories
      const parentPath = entry.parentPath || entry.path || articlesDir;
      const fullPath = path.join(parentPath, entry.name);

      // Calculate slug from path relative to articles directory
      const relativePath = path.relative(articlesDir, fullPath);
      const slug = relativePath.replace(/\.(md|mdx)$/, '');

      const content = await fs.readFile(fullPath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(content);

      if (!frontmatter.title) {
        continue; // Skip articles without titles
      }

      articles.push({
        slug,
        frontmatter: {
          title: frontmatter.title,
          description: frontmatter.description,
          image_hero: frontmatter.image_hero,
          author: frontmatter.author,
          date: frontmatter.date,
        },
        body,
      });
    }
  } catch (err) {
    // Articles directory might not exist
  }

  return articles;
}

/**
 * Load site config from data/site-config.json
 */
async function loadSiteConfig(projectRoot: string): Promise<{ siteName: string; gradient: [string, string, string] }> {
  const configPath = path.join(projectRoot, 'data/site-config.json');

  const defaults = {
    siteName: 'My Blog',
    gradient: ['#1e3a5f', '#4a2c6a', '#6b2d5c'] as [string, string, string],
  };

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);

    return {
      siteName: config.site?.name || defaults.siteName,
      gradient: config.gradient || defaults.gradient,
    };
  } catch {
    return defaults;
  }
}

/**
 * Resolve image path to absolute file path
 */
function resolveImagePath(imagePath: string, projectRoot: string, distDir: string): string | null {
  if (!imagePath) return null;

  // Handle absolute paths starting with /
  if (imagePath.startsWith('/')) {
    // Check in dist folder first (for built assets)
    const distPath = path.join(distDir, imagePath);
    // Also check in public folder
    const publicPath = path.join(projectRoot, 'public', imagePath);
    // Return the dist path - we'll verify existence later
    return distPath;
  }

  // Handle relative paths
  return path.join(projectRoot, 'public', imagePath);
}

/**
 * Extract first image from markdown content
 */
function extractFirstImage(markdownContent: string): string | null {
  if (!markdownContent) return null;

  // Match markdown image syntax: ![alt](url)
  const markdownImageRegex = /!\[.*?\]\(([^)]+\.(?:webp|png|jpg|jpeg))\)/i;
  const match = markdownContent.match(markdownImageRegex);

  if (match && match[1]) {
    return match[1];
  }

  // Match HTML img src attribute
  const htmlImageRegex = /<img[^>]+src=["']([^"']+\.(?:webp|png|jpg|jpeg))["']/i;
  const htmlMatch = markdownContent.match(htmlImageRegex);

  if (htmlMatch && htmlMatch[1]) {
    return htmlMatch[1];
  }

  return null;
}

/**
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function ogImages(): AstroIntegration {
  return {
    name: 'og-images',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const distDir = fileURLToPath(dir);
        // Project root is two levels up from dist
        const projectRoot = path.resolve(distDir, '..');

        logger.info('Generating OG images for articles...');

        // Load site config
        const siteConfig = await loadSiteConfig(projectRoot);
        const ogConfig: OGImageConfig = {
          gradient: siteConfig.gradient,
        };

        // Get all articles
        const articles = await getArticles(projectRoot);

        if (articles.length === 0) {
          logger.info('No articles found, skipping OG image generation');
          return;
        }

        logger.info(`Found ${articles.length} article(s) to process`);

        let generated = 0;
        let errors = 0;

        for (const article of articles) {
          try {
            // Determine background image
            let backgroundImagePath: string | undefined;

            // Priority 1: image_hero from frontmatter
            if (article.frontmatter.image_hero) {
              const resolved = resolveImagePath(article.frontmatter.image_hero, projectRoot, distDir);
              if (resolved && (await fileExists(resolved))) {
                backgroundImagePath = resolved;
              }
            }

            // Priority 2: Extract first image from content
            if (!backgroundImagePath) {
              const contentImage = extractFirstImage(article.body);
              if (contentImage) {
                const resolved = resolveImagePath(contentImage, projectRoot, distDir);
                if (resolved && (await fileExists(resolved))) {
                  backgroundImagePath = resolved;
                }
              }
            }

            // Generate OG image
            const ogBuffer = await generateOGImage(
              {
                title: article.frontmatter.title,
                description: article.frontmatter.description,
                brandName: siteConfig.siteName,
                author: article.frontmatter.author,
                date: article.frontmatter.date,
                backgroundImagePath,
              },
              ogConfig
            );

            // Create output directory
            const outputDir = path.join(distDir, 'assets', article.slug);
            await fs.mkdir(outputDir, { recursive: true });

            // Write OG image
            const outputPath = path.join(outputDir, 'og.webp');
            await fs.writeFile(outputPath, ogBuffer);

            generated++;
            logger.info(`  Generated: /assets/${article.slug}/og.webp`);
          } catch (err) {
            errors++;
            logger.error(`  Failed: ${article.slug} - ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        }

        logger.info(`OG images complete: ${generated} generated, ${errors} failed`);
      },
    },
  };
}
