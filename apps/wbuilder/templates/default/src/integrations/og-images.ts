/**
 * Astro Integration for OG Image Generation
 *
 * Generates OG/social preview images for articles at build time.
 * Uses the shared og-image-gen library (copied to src/lib/og-image-gen/).
 *
 * Must run BEFORE validateImages() so generated OG images exist during validation.
 *
 * Logic:
 * - Parse each article's frontmatter for title, description, image_og, image_hero
 * - Skip if image_og is set AND the file already exists in dist/ or public/
 * - Use selectOGImageSource() to pick background (hero → content image → gradient)
 * - Generate 1200×630 WebP image and write to dist/assets/<slug>/og.webp
 */

import type { AstroIntegration } from 'astro';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

interface ArticleFrontmatter {
  title?: string;
  description?: string;
  image_hero?: string;
  image_og?: string;
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

  try {
    const frontmatter = (yaml.load(match[1]) as Record<string, any>) || {};
    return { frontmatter, body: match[2] };
  } catch {
    return { frontmatter: {}, body: content };
  }
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

/**
 * Extract the first image URL from markdown content
 */
function extractFirstImage(markdownContent: string): string | null {
  if (!markdownContent) return null;

  const markdownImageRegex = /!\[.*?\]\(([^)]+\.(?:webp|png|jpg|jpeg))\)/i;
  const match = markdownContent.match(markdownImageRegex);
  if (match && match[1]) return match[1];

  const htmlImageRegex = /<img[^>]+src=["']([^"']+\.(?:webp|png|jpg|jpeg))["']/i;
  const htmlMatch = markdownContent.match(htmlImageRegex);
  if (htmlMatch && htmlMatch[1]) return htmlMatch[1];

  return null;
}

/**
 * Resolve the best available image file path for an article.
 * Returns the absolute path to a local image file, or null if none found.
 */
function resolveImagePath(
  frontmatter: ArticleFrontmatter,
  body: string,
  publicDir: string,
): string | null {
  // Try hero image first
  if (frontmatter.image_hero && !frontmatter.image_hero.startsWith('http')) {
    const heroFile = path.join(publicDir, frontmatter.image_hero);
    return heroFile;
  }

  // Try first content image
  const contentImage = extractFirstImage(body);
  if (contentImage && !contentImage.startsWith('http')) {
    return path.join(publicDir, contentImage);
  }

  return null;
}

export function ogImages(): AstroIntegration {
  return {
    name: 'og-images',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const distDir = fileURLToPath(dir);
        const projectRoot = path.resolve(distDir, '..');
        const publicDir = path.join(projectRoot, 'public');

        // Check if the shared og-image-gen library is available
        let generatorAvailable = false;
        const generatorPath = path.join(projectRoot, 'src/lib/og-image-gen/social-image-generator.ts');
        if (await fileExists(generatorPath)) {
          generatorAvailable = true;
        } else {
          logger.info('og-image-gen library not found, will use image fallback for OG images');
        }

        // Load config
        const configPath = path.join(projectRoot, 'data/site-config.json');
        let config: Record<string, any> = {};
        try {
          config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
        } catch {
          logger.warn('Could not load site-config.json, using defaults');
        }

        // Try to load the generator if available
        let generator: any = null;
        const fontDir = path.join(projectRoot, 'src/fonts');
        if (generatorAvailable) {
          try {
            const mod = await import('../lib/og-image-gen/social-image-generator.js');
            const SocialImageGenerator = mod.SocialImageGenerator;
            generator = new SocialImageGenerator();
            generator.loadConfig({
              badge: config.branding?.badge,
              brand_name: config.branding?.brand_name || config.branding?.site?.name,
              gradient: config.branding?.gradient || config.gradient,
              fontDir,
            });
          } catch (err) {
            logger.warn(`Could not import og-image-gen: ${err instanceof Error ? err.message : err}`);
            logger.info('Falling back to image copy for OG images');
          }
        }

        // Scan articles
        const articlesDir = path.join(projectRoot, 'src/content/articles');
        let entries: any[];
        try {
          entries = await fs.readdir(articlesDir, { withFileTypes: true, recursive: true });
        } catch {
          logger.info('No articles directory found, skipping OG image generation');
          return;
        }

        let generated = 0;
        let copied = 0;
        let skipped = 0;
        let noImage = 0;

        for (const entry of entries) {
          if (!entry.isFile()) continue;
          if (!entry.name.endsWith('.md') && !entry.name.endsWith('.mdx')) continue;

          const parentPath = entry.parentPath || entry.path || articlesDir;
          const fullPath = path.join(parentPath, entry.name);
          const relativePath = path.relative(articlesDir, fullPath);
          const slug = relativePath.replace(/\.(md|mdx)$/, '');

          const content = await fs.readFile(fullPath, 'utf-8');
          const { frontmatter, body } = parseFrontmatter(content);

          // Skip if image_og is already set and file exists
          if (frontmatter.image_og) {
            const ogPath = frontmatter.image_og.startsWith('/')
              ? frontmatter.image_og
              : `/${frontmatter.image_og}`;
            const existsInDist = await fileExists(path.join(distDir, ogPath));
            const existsInPublic = await fileExists(path.join(publicDir, ogPath));
            if (existsInDist || existsInPublic) {
              skipped++;
              continue;
            }
          }

          const ogOutputDir = path.join(distDir, 'assets', slug);
          const ogOutputPath = path.join(ogOutputDir, 'og.webp');

          // Try generating with the library first
          if (generator) {
            let heroImageBase64: string | undefined;

            if (frontmatter.image_hero && !frontmatter.image_hero.startsWith('http')) {
              const heroFile = path.join(publicDir, frontmatter.image_hero);
              try {
                const heroBuffer = await fs.readFile(heroFile);
                const ext = frontmatter.image_hero.split('.').pop()?.toLowerCase() || 'png';
                const mimeType = ext === 'webp' ? 'image/webp' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
                heroImageBase64 = `data:${mimeType};base64,${heroBuffer.toString('base64')}`;
              } catch {
                // Hero image not found, fall through
              }
            }

            if (!heroImageBase64) {
              const contentImage = extractFirstImage(body);
              if (contentImage && !contentImage.startsWith('http')) {
                const imgFile = path.join(publicDir, contentImage);
                try {
                  const imgBuffer = await fs.readFile(imgFile);
                  const ext = contentImage.split('.').pop()?.toLowerCase() || 'png';
                  const mimeType = ext === 'webp' ? 'image/webp' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
                  heroImageBase64 = `data:${mimeType};base64,${imgBuffer.toString('base64')}`;
                } catch {
                  // Content image not found
                }
              }
            }

            try {
              const result = await generator.generate(
                {
                  title: frontmatter.title || 'Untitled',
                  description: frontmatter.description,
                  heroImageBase64,
                },
                fontDir,
              );

              await fs.mkdir(ogOutputDir, { recursive: true });
              await fs.writeFile(ogOutputPath, result.buffer);
              generated++;
              continue;
            } catch (err) {
              logger.warn(`Generator failed for ${slug}, trying fallback: ${err instanceof Error ? err.message : err}`);
            }
          }

          // Fallback: copy hero or first content image directly as OG image
          const imagePath = resolveImagePath(frontmatter, body, publicDir);
          if (!imagePath || !await fileExists(imagePath)) {
            noImage++;
            continue;
          }

          try {
            await fs.mkdir(ogOutputDir, { recursive: true });
            await fs.copyFile(imagePath, ogOutputPath);
            copied++;
          } catch (err) {
            logger.warn(`Failed to copy fallback OG image for ${slug}: ${err instanceof Error ? err.message : err}`);
          }
        }

        const parts = [];
        if (generated > 0) parts.push(`${generated} generated`);
        if (copied > 0) parts.push(`${copied} copied (fallback)`);
        if (skipped > 0) parts.push(`${skipped} skipped (already exist)`);
        if (noImage > 0) parts.push(`${noImage} skipped (no source image)`);
        logger.info(`OG images: ${parts.join(', ')}`);
      },
    },
  };
}
