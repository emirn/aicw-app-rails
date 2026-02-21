/**
 * Recraft V3 Image Service
 *
 * Generates images using Recraft V3 API.
 * Default provider for hero images — produces high-quality illustrations
 * with brand color control at $0.04/image.
 */

import fetch from 'node-fetch';
import sharp from 'sharp';
import { config } from '../config/server-config';
import { IBrandingColors } from '@blogpostgen/types';
import { GeneratedImage } from './image.service';

/** Recraft API endpoint */
export const RECRAFT_API_URL = 'https://external.api.recraft.ai/v1/images/generations';

/** Recraft supported sizes (width x height) */
const RECRAFT_SIZES: [number, number][] = [
  [1024, 1024],
  [1365, 1024],
  [1024, 1365],
  [1536, 1024],
  [1024, 1536],
  [1820, 1024],
  [1024, 1820],
  [1024, 2048],
  [2048, 1024],
  [1434, 1024],
  [1024, 1434],
  [1024, 1280],
  [1280, 1024],
  [1024, 1707],
  [1707, 1024],
];

interface RecraftResponse {
  data: Array<{
    b64_json?: string;
    url?: string;
  }>;
}

/**
 * Convert hex color string to RGB array [r, g, b]
 */
function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '');
  const num = parseInt(cleaned, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Find the closest supported Recraft size for the target dimensions.
 * Prefers sizes with a similar aspect ratio.
 */
function findClosestRecraftSize(targetW: number, targetH: number): [number, number] {
  const targetRatio = targetW / targetH;
  let best: [number, number] = RECRAFT_SIZES[0];
  let bestScore = Infinity;

  for (const [w, h] of RECRAFT_SIZES) {
    const ratio = w / h;
    // Weighted score: aspect ratio similarity + total pixel difference
    const ratioDiff = Math.abs(ratio - targetRatio);
    const pixelDiff = Math.abs(w * h - targetW * targetH) / 1_000_000;
    const score = ratioDiff * 10 + pixelDiff;
    if (score < bestScore) {
      bestScore = score;
      best = [w, h];
    }
  }

  return best;
}

/**
 * Build Recraft color controls from branding colors
 */
function buildColorControls(colors?: IBrandingColors): {
  colors?: Array<{ rgb: [number, number, number] }>;
  background_color?: { rgb: [number, number, number] };
} {
  if (!colors) return {};

  const controls: {
    colors?: Array<{ rgb: [number, number, number] }>;
    background_color?: { rgb: [number, number, number] };
  } = {};

  // Collect brand colors for palette (primary, secondary)
  const palette: Array<{ rgb: [number, number, number] }> = [];
  if (colors.primary) palette.push({ rgb: hexToRgb(colors.primary) });
  if (colors.secondary) palette.push({ rgb: hexToRgb(colors.secondary) });

  if (palette.length > 0) {
    controls.colors = palette;
  }

  if (colors.background) {
    controls.background_color = { rgb: hexToRgb(colors.background) };
  }

  return controls;
}

export interface RecraftImageOptions {
  prompt: string;
  model: string;
  width?: number;
  height?: number;
  style?: string;
  colors?: IBrandingColors;
  log?: { info: Function; error: Function; warn: Function };
}

/**
 * Generate an image using Recraft V3 API
 *
 * Picks the closest supported Recraft size, generates at that size,
 * then resizes with sharp to the exact target dimensions.
 */
export async function generateRecraftImage(options: RecraftImageOptions): Promise<GeneratedImage> {
  const {
    prompt: rawPrompt,
    width = 1200,
    height = 630,
    style = 'digital_illustration',
    colors,
    log,
  } = options;

  const apiKey = config.recraft.apiKey;
  if (!apiKey) {
    throw new Error('SGEN_RECRAFT_API_KEY environment variable not set');
  }

  // Truncate prompt to Recraft's 1000-char limit
  const RECRAFT_PROMPT_LIMIT = 1000;
  let prompt = rawPrompt;
  if (prompt.length > RECRAFT_PROMPT_LIMIT) {
    prompt = prompt.substring(0, RECRAFT_PROMPT_LIMIT - 3).replace(/\s+\S*$/, '') + '...';
    if (log) {
      log.warn({ originalLength: rawPrompt.length, truncatedLength: prompt.length }, 'recraft:prompt_truncated');
    }
  }

  // Find closest supported size
  const [genWidth, genHeight] = findClosestRecraftSize(width, height);

  // Split style on '/' to extract style and substyle (e.g. "digital_illustration/hand_drawn")
  const [recraftStyle, recraftSubstyle] = style.includes('/')
    ? style.split('/', 2)
    : [style, undefined];

  // Build request
  const requestBody: Record<string, unknown> = {
    prompt,
    style: recraftStyle,
    ...(recraftSubstyle && { substyle: recraftSubstyle }),
    size: `${genWidth}x${genHeight}`,
    response_format: 'b64_json',
    negative_prompt: 'text, words, letters, numbers, typography, signs, labels, captions, watermarks, titles',
  };

  // Always add controls object (for no_text); merge with color controls if present
  const colorControls = buildColorControls(colors);
  requestBody.controls = {
    ...colorControls,
    no_text: true,
  };

  if (log) {
    const logBody = {
      ...requestBody,
      prompt: prompt.length > 200 ? prompt.substring(0, 200) + '…[truncated]' : prompt,
    };
    log.info({ requestBody: logBody }, 'recraft:request');
  }

  const response = await fetch(RECRAFT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (log) {
      log.error({ status: response.status, error: errorText.substring(0, 500) }, 'recraft:error');
    }
    throw new Error(`Recraft API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as RecraftResponse;

  if (log) {
    log.info({
      status: response.status,
      hasImage: !!data.data?.[0]?.b64_json,
      imageBytes: data.data?.[0]?.b64_json?.length || 0,
    }, 'recraft:response');
  }

  if (!data.data?.[0]?.b64_json) {
    throw new Error('No image data in Recraft response');
  }

  let base64Data = data.data[0].b64_json;

  // Resize to exact target dimensions if generation size differs
  if (genWidth !== width || genHeight !== height) {
    const inputBuffer = Buffer.from(base64Data, 'base64');
    const resizedBuffer = await sharp(inputBuffer)
      .resize(width, height, { fit: 'cover' })
      .png()
      .toBuffer();
    base64Data = resizedBuffer.toString('base64');
  }

  // Generate filename from prompt
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 4)
    .join('-') || 'hero';

  return {
    data: base64Data,
    filename: `${slug}.webp`,
    prompt,
    model: options.model,
    width,
    height,
    costUsd: 0.04,
  };
}
