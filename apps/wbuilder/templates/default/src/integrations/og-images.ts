/**
 * Astro Integration for OG Image Generation
 *
 * Generates OG/social preview images for articles at build time.
 * Uses satori + resvg + sharp directly (Vite externalizes node_modules properly).
 *
 * Must run BEFORE validateImages() so generated OG images exist during validation.
 *
 * Logic:
 * - Parse each article's frontmatter for title, description, image_og, image_hero
 * - Skip if image_og is set AND the file already exists in dist/ or public/
 * - Pick background: hero image → first content image → gradient
 * - Generate 1200×630 WebP image and write to dist/assets/<slug>/og.webp
 */

import type { AstroIntegration } from 'astro';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

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
 * Convert any image buffer to PNG for satori compatibility.
 * Satori only supports PNG/JPEG/GIF — WebP crashes with "u is not iterable".
 */
async function toPngBase64(imageBuffer: Buffer): Promise<string> {
  const pngBuffer = await sharp(imageBuffer).png().toBuffer();
  return `data:image/png;base64,${pngBuffer.toString('base64')}`;
}

function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  const ellipsis = '...';
  const cutPoint = max - ellipsis.length;
  const lastSpace = text.lastIndexOf(' ', cutPoint);
  if (lastSpace <= 0) return text.slice(0, cutPoint) + ellipsis;
  return text.slice(0, lastSpace) + ellipsis;
}

/**
 * Build satori-compatible virtual DOM template for OG image
 */
function buildOgTemplate(options: {
  title: string;
  description?: string;
  badge?: string;
  brandName?: string;
  gradient?: [string, string, string];
  heroImageBase64?: string;
}): any {
  const { title, description, badge, brandName, heroImageBase64 } = options;
  const truncTitle = truncateText(title, 80);
  const truncDesc = description ? truncateText(description, 140) : '';
  const gradient = options.gradient || ['#1e3a5f', '#4a2c6a', '#6b2d5c'];
  const bgGradient = `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 50%, ${gradient[2]} 100%)`;

  const contentLayer = {
    type: 'div',
    props: {
      style: {
        position: 'relative' as const,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column' as const,
        justifyContent: 'space-between',
        padding: '60px',
      },
      children: [
        badge
          ? {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  background: 'rgba(255, 255, 255, 0.2)',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '18px',
                  fontWeight: 700,
                  alignSelf: 'flex-start',
                },
                children: badge,
              },
            }
          : null,
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column' as const,
              gap: '20px',
              flex: 1,
              justifyContent: 'center',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    color: 'white',
                    fontSize: '52px',
                    fontWeight: 700,
                    lineHeight: 1.2,
                  },
                  children: truncTitle,
                },
              },
              truncDesc
                ? {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        color: 'rgba(255, 255, 255, 0.8)',
                        fontSize: '24px',
                        lineHeight: 1.4,
                      },
                      children: truncDesc,
                    },
                  }
                : null,
            ].filter(Boolean),
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: 'white',
              fontSize: '20px',
            },
            children: [
              brandName
                ? {
                    type: 'div',
                    props: {
                      style: { display: 'flex', fontSize: '24px', fontWeight: 700 },
                      children: brandName,
                    },
                  }
                : null,
            ].filter(Boolean),
          },
        },
      ].filter(Boolean),
    },
  };

  const children: any[] = [];

  if (heroImageBase64) {
    children.push({
      type: 'img',
      props: {
        src: heroImageBase64,
        style: {
          position: 'absolute' as const,
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover' as const,
        },
      },
    });
    children.push({
      type: 'div',
      props: {
        style: {
          display: 'flex',
          position: 'absolute' as const,
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.7)',
        },
      },
    });
  }

  children.push(contentLayer);

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        position: 'relative' as const,
        width: '100%',
        height: '100%',
        background: heroImageBase64 ? 'transparent' : bgGradient,
        overflow: 'hidden',
      },
      children,
    },
  };
}

export function ogImages(): AstroIntegration {
  return {
    name: 'og-images',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const distDir = fileURLToPath(dir);
        const projectRoot = path.resolve(distDir, '..');
        const publicDir = path.join(projectRoot, 'public');

        // Load config
        const configPath = path.join(projectRoot, 'data/site-config.json');
        let config: Record<string, any> = {};
        try {
          config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
        } catch {
          logger.warn('Could not load site-config.json, using defaults');
        }

        const siteName = config.branding?.brand_name || config.branding?.site?.name || '';
        const prefix = siteName ? `[${siteName}] ` : '';

        // Load font
        const fontDir = path.join(projectRoot, 'src/fonts');
        let fontBuffer: Buffer;
        try {
          fontBuffer = await fs.readFile(path.join(fontDir, 'Inter-Bold.ttf'));
        } catch {
          logger.warn(`${prefix}Font not found at ${fontDir}/Inter-Bold.ttf, skipping OG image generation`);
          return;
        }

        const badge = config.branding?.badge;
        const brandName = config.branding?.brand_name || config.branding?.site?.name;
        const gradient = config.branding?.gradient || config.gradient;

        // Scan articles
        const articlesDir = path.join(projectRoot, 'src/content/articles');
        let entries: any[];
        try {
          entries = await fs.readdir(articlesDir, { withFileTypes: true, recursive: true });
        } catch {
          logger.info(`${prefix}No articles directory found, skipping OG image generation`);
          return;
        }

        let generated = 0;
        let skipped = 0;
        let failed = 0;

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

          // Build hero image background if available
          let heroImageBase64: string | undefined;

          if (frontmatter.image_hero && !frontmatter.image_hero.startsWith('http')) {
            const heroFile = path.join(publicDir, frontmatter.image_hero);
            try {
              const heroBuffer = await fs.readFile(heroFile);
              heroImageBase64 = await toPngBase64(heroBuffer);
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
                heroImageBase64 = await toPngBase64(imgBuffer);
              } catch {
                // Content image not found
              }
            }
          }

          try {
            const template = buildOgTemplate({
              title: frontmatter.title || 'Untitled',
              description: frontmatter.description,
              badge,
              brandName,
              gradient,
              heroImageBase64,
            });

            const svg = await satori(template, {
              width: 1200,
              height: 630,
              fonts: [{ name: 'Inter', data: fontBuffer, weight: 700, style: 'normal' as const }],
            });

            const resvg = new Resvg(svg, {
              background: 'rgba(0, 0, 0, 0)',
              fitTo: { mode: 'width' as const, value: 1200 },
            });
            const pngBuffer = Buffer.from(resvg.render().asPng());
            const webpBuffer = await sharp(pngBuffer).webp({ quality: 80 }).toBuffer();

            await fs.mkdir(ogOutputDir, { recursive: true });
            await fs.writeFile(ogOutputPath, webpBuffer);
            generated++;
            logger.info(`${prefix}  → ${slug} → assets/${slug}/og.webp`);
          } catch (err) {
            logger.warn(`${prefix}Generator failed for ${slug}: ${err instanceof Error ? err.message : err}`);
            failed++;
          }
        }

        const parts = [];
        if (generated > 0) parts.push(`${generated} generated`);
        if (skipped > 0) parts.push(`${skipped} skipped (already exist)`);
        if (failed > 0) parts.push(`${failed} failed`);
        logger.info(`${prefix}OG images: ${parts.join(', ')}`);
      },
    },
  };
}
