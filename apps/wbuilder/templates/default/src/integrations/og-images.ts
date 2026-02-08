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
import yaml from 'js-yaml';
import { generateOGImage, type OGImageConfig } from '../lib/og-image-generator.js';

interface ArticleFrontmatter {
  title: string;
  description?: string;
  image_hero?: string;
  image_og?: string;
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
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const yamlContent = match[1];
  const body = match[2];

  try {
    const frontmatter = (yaml.load(yamlContent) as Record<string, any>) || {};
    return { frontmatter, body };
  } catch {
    return { frontmatter: {}, body };
  }
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
          image_og: frontmatter.image_og,
          author: frontmatter.author,
          date: frontmatter.date instanceof Date
            ? frontmatter.date.toISOString().split('T')[0]
            : frontmatter.date,
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
      siteName: config.branding?.site?.name || config.site?.name || defaults.siteName,
      gradient: config.gradient || defaults.gradient,
    };
  } catch {
    return defaults;
  }
}

/**
 * Resolve image path to absolute file path, checking dist then public
 */
async function resolveImagePath(imagePath: string, projectRoot: string, distDir: string): Promise<string | null> {
  if (!imagePath) return null;

  if (imagePath.startsWith('/')) {
    // Check in dist folder first (for built assets)
    const distPath = path.join(distDir, imagePath);
    if (await fileExists(distPath)) return distPath;

    // Fall back to public folder
    const publicPath = path.join(projectRoot, 'public', imagePath);
    if (await fileExists(publicPath)) return publicPath;

    return null;
  }

  // Handle relative paths
  const publicPath = path.join(projectRoot, 'public', imagePath);
  if (await fileExists(publicPath)) return publicPath;

  return null;
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
        let skipped = 0;
        let errors = 0;

        for (const article of articles) {
          try {
            // Skip if image_og is already set and the file exists
            if (article.frontmatter.image_og) {
              const existingOg = await resolveImagePath(article.frontmatter.image_og, projectRoot, distDir);
              if (existingOg) {
                skipped++;
                logger.info(`  Skipped (image_og exists): ${article.slug}`);
                continue;
              }
            }

            // Determine background image
            let backgroundImagePath: string | undefined;

            // Priority 1: image_hero from frontmatter
            if (article.frontmatter.image_hero) {
              const resolved = await resolveImagePath(article.frontmatter.image_hero, projectRoot, distDir);
              if (resolved) {
                backgroundImagePath = resolved;
              }
            }

            // Priority 2: Extract first image from content
            if (!backgroundImagePath) {
              const contentImage = extractFirstImage(article.body);
              if (contentImage) {
                const resolved = await resolveImagePath(contentImage, projectRoot, distDir);
                if (resolved) {
                  backgroundImagePath = resolved;
                }
              }
            }

            // Create output directory
            const outputDir = path.join(distDir, 'assets', article.slug);
            await fs.mkdir(outputDir, { recursive: true });
            const outputPath = path.join(outputDir, 'og.webp');

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

            await fs.writeFile(outputPath, ogBuffer);
            generated++;
            logger.info(`  Generated: /assets/${article.slug}/og.webp`);
          } catch (err) {
            // Retry with gradient-only (no background image)
            try {
              const outputDir = path.join(distDir, 'assets', article.slug);
              await fs.mkdir(outputDir, { recursive: true });
              const outputPath = path.join(outputDir, 'og.webp');

              const fallback = await generateOGImage(
                {
                  title: article.frontmatter.title,
                  description: article.frontmatter.description,
                  brandName: siteConfig.siteName,
                  author: article.frontmatter.author,
                  date: article.frontmatter.date,
                },
                ogConfig
              );
              await fs.writeFile(outputPath, fallback);
              generated++;
              logger.warn(`  Fallback (gradient): /assets/${article.slug}/og.webp`);
            } catch (retryErr) {
              errors++;
              logger.error(`  Failed: ${article.slug} - ${retryErr instanceof Error ? retryErr.message : 'Unknown error'}`);
            }
          }
        }

        logger.info(`OG images complete: ${generated} generated, ${skipped} skipped, ${errors} failed`);
      },
    },
  };
}
