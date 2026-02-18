/**
 * generate_favicon action handler
 *
 * Generates favicon.ico and favicon.png files from site name and primary color.
 * Project-level action (no article required).
 *
 * Ported from wbuilder/templates/default/src/integrations/favicon.ts
 */

import { ActionHandlerFn } from './types';
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';

function getFirstLetter(siteName: string): string {
  if (!siteName?.trim()) return '?';
  const match = siteName.trim().match(/[a-zA-Z0-9]/);
  return match ? match[0].toUpperCase() : '?';
}

function isLightColor(hex: string): boolean {
  const color = hex.replace('#', '');
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

function generateLetterFaviconSvg(siteName: string, bgColor: string, size: number = 32): string {
  const letter = getFirstLetter(siteName);
  const textColor = isLightColor(bgColor) ? '#1F2937' : '#FFFFFF';
  const fontSize = Math.round(size * 0.5625);
  const rx = Math.round(size * 0.1875);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${rx}" fill="${bgColor}"/>
    <text x="50%" y="50%" dy=".35em" text-anchor="middle"
          font-family="system-ui, -apple-system, sans-serif"
          font-size="${fontSize}" font-weight="600" fill="${textColor}">
      ${letter}
    </text>
  </svg>`;
}

function svgToPng(svgString: string, size: number): Buffer {
  const resvg = new Resvg(svgString, {
    fitTo: { mode: 'width', value: size },
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

function decodeBase64DataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { buffer: Buffer.from(match[2], 'base64'), mimeType: match[1] };
}

function isBase64DataUrl(str: string): boolean {
  return str.startsWith('data:') && str.includes('base64,');
}

export const handle: ActionHandlerFn = async ({ context, log }) => {
  const branding = (context.projectConfig as any)?.branding;
  const siteName = branding?.site?.name || 'Site';
  const primaryColor = branding?.colors?.primary || '#3B82F6';
  const faviconUrl = branding?.site?.favicon_url;

  log.info({ siteName, primaryColor, hasFaviconUrl: !!faviconUrl }, 'generate_favicon:start');

  let pngBuffers: { size: number; buffer: Buffer }[] = [];

  try {
    if (faviconUrl && isBase64DataUrl(faviconUrl)) {
      log.info('generate_favicon:using_custom_base64');
      const decoded = decodeBase64DataUrl(faviconUrl);
      if (!decoded) {
        return { success: false, error: 'Failed to decode base64 favicon', errorCode: 'DECODE_FAILED', operations: [] };
      }

      if (decoded.mimeType.includes('svg')) {
        const svgString = decoded.buffer.toString('utf-8');
        for (const size of [16, 32, 48]) {
          pngBuffers.push({ size, buffer: svgToPng(svgString, size) });
        }
      } else if (decoded.mimeType.includes('png')) {
        pngBuffers.push({ size: 32, buffer: decoded.buffer });
      } else {
        return { success: false, error: `Unsupported favicon format: ${decoded.mimeType}`, errorCode: 'UNSUPPORTED_FORMAT', operations: [] };
      }
    } else {
      log.info({ siteName }, 'generate_favicon:generating_letter');
      for (const size of [16, 32, 48]) {
        const svg = generateLetterFaviconSvg(siteName, primaryColor, size);
        pngBuffers.push({ size, buffer: svgToPng(svg, size) });
      }
    }

    // Generate ICO with multiple sizes
    const icoBuffer = await pngToIco(pngBuffers.map(p => p.buffer));

    // Get 32x32 PNG
    const png32 = pngBuffers.find(p => p.size === 32) || pngBuffers[0];

    log.info('generate_favicon:complete');

    return {
      success: true,
      message: 'Generated favicon.ico and favicon.png',
      operations: [],
      files: [
        {
          path: 'config/assets/branding/favicon.ico',
          content: Buffer.from(icoBuffer).toString('base64'),
        },
        {
          path: 'config/assets/branding/favicon.png',
          content: png32.buffer.toString('base64'),
        },
      ],
    };
  } catch (err) {
    log.error({ err }, 'generate_favicon:error');
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      errorCode: 'FAVICON_GENERATION_FAILED',
      operations: [],
    };
  }
};
