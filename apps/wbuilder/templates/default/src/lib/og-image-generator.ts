/**
 * OG Image Generator for Website Template
 *
 * Generates OG/social preview images using Satori + Resvg + Sharp.
 * Runs during Astro build to create 1200x630 WebP images.
 *
 * Adapted from: blogpostgen/apps/services/sgen/src/utils/social-image-generator.ts
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface OGImageOptions {
  title: string;
  description?: string;
  brandName: string;
  author?: string;
  date?: string;
  backgroundImagePath?: string; // Path to hero/content image for background
}

export interface OGImageConfig {
  gradient: [string, string, string];
}

/**
 * Truncate text at word boundary to avoid cutting mid-word
 */
function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;

  const ellipsis = '...';
  const cutPoint = max - ellipsis.length;

  // Find last space before cutPoint
  const lastSpace = text.lastIndexOf(' ', cutPoint);

  // If no space found (single long word), fall back to char truncation
  if (lastSpace <= 0) {
    return text.slice(0, cutPoint) + ellipsis;
  }

  return text.slice(0, lastSpace) + ellipsis;
}

/**
 * Load font buffer from bundled assets
 */
async function loadFont(): Promise<Buffer> {
  const fontPath = path.join(__dirname, '../assets/fonts/Inter-Bold.ttf');
  return fs.readFile(fontPath);
}

/**
 * Read image file and convert to base64 data URL
 */
async function imageToBase64(imagePath: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType =
      ext === '.webp'
        ? 'image/webp'
        : ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : 'image/png';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Build JSX template for OG image
 * Uses background image with overlay if available, otherwise gradient
 */
function buildTemplate(
  options: OGImageOptions,
  config: OGImageConfig,
  heroImageBase64?: string
): any {
  const { title, description, brandName, author, date } = options;

  // Truncate text at word boundaries
  const truncTitle = truncateText(title, 80);
  const truncDesc = description ? truncateText(description, 140) : '';

  // Build gradient from config
  const gradient = config.gradient;
  const bgGradient = `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 50%, ${gradient[2]} 100%)`;

  // Build footer text
  const footerParts = [author, date].filter(Boolean);
  const footerText = footerParts.join(' \u2022 ');

  // Build content layer (title/desc, footer with branding)
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
        // Spacer for top
        {
          type: 'div',
          props: {
            style: { display: 'flex' },
            children: '',
          },
        },
        // Title + Description (centered vertically)
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
        // Footer: author/date + branding
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
              footerText
                ? {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        color: 'rgba(255, 255, 255, 0.8)',
                      },
                      children: footerText,
                    },
                  }
                : {
                    type: 'div',
                    props: {
                      style: { display: 'flex' },
                      children: '',
                    },
                  },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', fontSize: '24px', fontWeight: 700 },
                  children: brandName,
                },
              },
            ],
          },
        },
      ].filter(Boolean),
    },
  };

  // Build layers array
  const children: any[] = [];

  if (heroImageBase64) {
    // Layer 1: Hero image background
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

    // Layer 2: Dark overlay for text readability
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

  // Layer 3: Content
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

/**
 * Generate OG image and return as WebP buffer
 */
export async function generateOGImage(
  options: OGImageOptions,
  config: OGImageConfig
): Promise<Buffer> {
  const font = await loadFont();

  // Load background image if provided
  let heroImageBase64: string | undefined;
  if (options.backgroundImagePath) {
    const base64 = await imageToBase64(options.backgroundImagePath);
    if (base64) {
      heroImageBase64 = base64;
    }
  }

  // Build JSX template
  const template = buildTemplate(options, config, heroImageBase64);

  // Generate SVG using Satori
  const svg = await satori(template, {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'Inter',
        data: font,
        weight: 700,
        style: 'normal',
      },
    ],
  });

  // Convert SVG to PNG using Resvg
  const resvg = new Resvg(svg, {
    background: 'rgba(0, 0, 0, 0)',
    fitTo: { mode: 'width', value: 1200 },
  });
  const pngBuffer = Buffer.from(resvg.render().asPng());

  // Convert PNG to WebP using Sharp
  const webpBuffer = await sharp(pngBuffer).webp({ quality: 80 }).toBuffer();

  return webpBuffer;
}
