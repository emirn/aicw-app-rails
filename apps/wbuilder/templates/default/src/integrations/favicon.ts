/**
 * Astro Integration for Favicon Generation
 *
 * Generates favicon.ico and favicon.png files during build time.
 * Supports both custom base64 favicons and auto-generated letter-based favicons.
 *
 * Output: dist/favicon.ico, dist/favicon.png
 */

import type { AstroIntegration } from 'astro';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';

interface SiteConfig {
  branding?: {
    site?: {
      name?: string;
      favicon_url?: string;
    };
    logo?: {
      mark_text?: string;
      style?: string;
    };
    colors?: {
      primary?: string;
    };
  };
}

/**
 * Load site config from data/site-config.json
 */
async function loadSiteConfig(projectRoot: string): Promise<SiteConfig> {
  const configPath = path.join(projectRoot, 'data/site-config.json');

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Get first letter from site name
 */
function getFirstLetter(siteName: string): string {
  if (!siteName?.trim()) return '?';
  const match = siteName.trim().match(/[a-zA-Z0-9]/);
  return match ? match[0].toUpperCase() : '?';
}

/**
 * Check if color is light (for text contrast)
 */
function isLightColor(hex: string): boolean {
  const color = hex.replace('#', '');
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

/**
 * Generate SVG favicon with letter(s) from site name or logo mark_text.
 * Supports logo style: monogram-circle → circular, pill → rounded-rect, default → rounded-rect.
 */
function generateLetterFaviconSvg(
  siteName: string,
  bgColor: string,
  size: number = 32,
  markText?: string,
  logoStyle?: string,
): string {
  // Use mark_text if provided (e.g., "LV"), otherwise fall back to first letter
  const displayText = markText && markText.length <= 3 ? markText : getFirstLetter(siteName);
  const textColor = isLightColor(bgColor) ? '#1F2937' : '#FFFFFF';

  // Adjust font size based on character count
  const charCount = displayText.length;
  const baseFontRatio = charCount === 1 ? 0.5625 : charCount === 2 ? 0.45 : 0.375;
  const fontSize = Math.round(size * baseFontRatio);

  // Shape based on logo style
  const isCircle = logoStyle === 'monogram-circle';
  const rx = isCircle ? Math.round(size / 2) : Math.round(size * 0.1875);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${rx}" fill="${bgColor}"/>
    <text x="50%" y="50%" dy=".35em" text-anchor="middle"
          font-family="system-ui, -apple-system, sans-serif"
          font-size="${fontSize}" font-weight="600" fill="${textColor}">
      ${displayText}
    </text>
  </svg>`;
}

/**
 * Convert SVG string to PNG buffer at specified size
 */
function svgToPng(svgString: string, size: number): Buffer {
  const resvg = new Resvg(svgString, {
    fitTo: {
      mode: 'width',
      value: size,
    },
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

/**
 * Decode base64 data URL to buffer
 */
function decodeBase64DataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  const mimeType = match[1];
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, 'base64');

  return { buffer, mimeType };
}

/**
 * Check if string is a base64 data URL
 */
function isBase64DataUrl(str: string): boolean {
  return str.startsWith('data:') && str.includes('base64,');
}

export function favicon(): AstroIntegration {
  return {
    name: 'favicon',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const distDir = fileURLToPath(dir);
        const projectRoot = path.resolve(distDir, '..');

        logger.info('Generating favicon files...');

        // Load site config
        const config = await loadSiteConfig(projectRoot);
        const siteName = config.branding?.site?.name || 'Site';
        const primaryColor = config.branding?.colors?.primary || '#3B82F6';
        const faviconUrl = config.branding?.site?.favicon_url;
        const markText = config.branding?.logo?.mark_text;
        const logoStyle = config.branding?.logo?.style;

        let pngBuffers: { size: number; buffer: Buffer }[] = [];

        try {
          if (faviconUrl && isBase64DataUrl(faviconUrl)) {
            // Custom base64 favicon provided
            logger.info('Using custom base64 favicon');

            const decoded = decodeBase64DataUrl(faviconUrl);
            if (!decoded) {
              throw new Error('Failed to decode base64 favicon');
            }

            if (decoded.mimeType.includes('svg')) {
              // SVG favicon - render at multiple sizes
              const svgString = decoded.buffer.toString('utf-8');
              for (const size of [16, 32, 48]) {
                pngBuffers.push({
                  size,
                  buffer: svgToPng(svgString, size),
                });
              }
            } else if (decoded.mimeType.includes('png')) {
              // PNG favicon - use as-is for 32x32, resize for others
              // For simplicity, use the same buffer (ICO will handle sizing)
              pngBuffers.push({ size: 32, buffer: decoded.buffer });
            } else {
              throw new Error(`Unsupported favicon format: ${decoded.mimeType}`);
            }
          } else {
            // Generate letter-based favicon
            logger.info(`Generating letter favicon for "${siteName}"`);

            for (const size of [16, 32, 48]) {
              const svg = generateLetterFaviconSvg(siteName, primaryColor, size, markText, logoStyle);
              pngBuffers.push({
                size,
                buffer: svgToPng(svg, size),
              });
            }
          }

          // Generate ICO file with multiple sizes
          const icoBuffer = await pngToIco(pngBuffers.map((p) => p.buffer));

          // Write favicon.ico
          const icoPath = path.join(distDir, 'favicon.ico');
          await fs.writeFile(icoPath, icoBuffer);
          logger.info('  Generated: /favicon.ico');

          // Write favicon.png (32x32)
          const png32 = pngBuffers.find((p) => p.size === 32) || pngBuffers[0];
          const pngPath = path.join(distDir, 'favicon.png');
          await fs.writeFile(pngPath, png32.buffer);
          logger.info('  Generated: /favicon.png');

          logger.info('Favicon generation complete');
        } catch (err) {
          logger.error(`Favicon generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      },
    },
  };
}
