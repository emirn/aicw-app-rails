/**
 * Image Service
 *
 * Generates images using FLUX via OpenRouter API.
 * Moved from CLI to sgen for centralized image generation.
 */

import fetch from 'node-fetch';
import { config } from '../config/server-config';

export interface ImageGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;  // default 1200
  height?: number; // default 630 (Open Graph recommended)
  model?: string;  // default 'black-forest-labs/flux-1.1-pro'
}

export interface GeneratedImage {
  /** Base64-encoded PNG data */
  data: string;
  /** Suggested filename */
  filename: string;
  /** Prompt used for generation */
  prompt: string;
  /** Model used */
  model: string;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** Cost in USD */
  costUsd: number;
}

interface ImageItem {
  type: 'image_url' | 'text';
  index?: number;
  image_url?: {
    url: string;  // data:image/png;base64,... or https://...
  };
  text?: string;
}

interface OpenRouterImageResponse {
  id: string;
  choices?: Array<{
    message: {
      content?: string | ImageItem[];
      // FLUX.2 returns images in message.images, not content
      images?: ImageItem[];
    };
  }>;
  // Alternative format - images at top level
  images?: ImageItem[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Calculate cost for FLUX.2 Pro image generation
 * Pricing: $0.07 for first megapixel, $0.03 each additional megapixel
 * See: https://openrouter.ai/black-forest-labs/flux.2-pro
 */
export function calculateImageCost(width: number, height: number): number {
  const megapixels = (width * height) / 1_000_000;
  if (megapixels <= 1) {
    return megapixels * 0.07;
  }
  // First megapixel at $0.07, additional at $0.03
  return 0.07 + (megapixels - 1) * 0.03;
}

/**
 * Generate a safe filename from the prompt
 */
function generateFilename(prompt: string): string {
  // Take first few words, sanitize for filesystem
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 4);

  const slug = words.join('-') || 'hero';
  return `${slug}.png`;
}

/**
 * Generate an image using FLUX via OpenRouter
 * Model updated to FLUX.2 Pro (Jan 2026)
 * See: https://openrouter.ai/black-forest-labs/flux.2-pro
 */
export async function generateImage(options: ImageGenerationOptions): Promise<GeneratedImage> {
  const {
    prompt,
    width = 1200,
    height = 630,
    model = 'black-forest-labs/flux.2-pro',
  } = options;

  const apiKey = config.ai.apiKey;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable not set');
  }

  // Build the request to OpenRouter
  const requestBody = {
    model,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    // Request image output
    modalities: ['image'],
    // Image generation parameters (provider-specific)
    provider: {
      order: ['BFL'],  // Black Forest Labs
    },
    // Image dimensions
    response_format: {
      type: 'b64_json',
    },
    // FLUX-specific parameters via extra body
    extra_body: {
      width,
      height,
    },
  };

  const response = await fetch(`${config.ai.openrouterBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://blogpostgen.local',
      'X-Title': 'Sgen Hero Image Generator',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as OpenRouterImageResponse;

  // Extract image from response - handle multiple response formats
  let imageUrl: string | undefined;

  // Format 1: Top-level images array
  if (data.images && data.images.length > 0) {
    imageUrl = data.images[0]?.image_url?.url;
  }

  // Format 2: Inside choices[0].message.images (FLUX.2 format)
  if (!imageUrl) {
    const messageImages = data.choices?.[0]?.message?.images;
    if (messageImages && messageImages.length > 0) {
      const imageItem = messageImages.find(item => item.type === 'image_url');
      imageUrl = imageItem?.image_url?.url;
    }
  }

  // Format 3: Inside choices[0].message.content (array format)
  if (!imageUrl) {
    const content = data.choices?.[0]?.message?.content;
    if (Array.isArray(content) && content.length > 0) {
      const imageItem = content.find(item => item.type === 'image_url');
      imageUrl = imageItem?.image_url?.url;
    }
  }

  if (!imageUrl) {
    // Log the response for debugging
    console.error('Unexpected image response format:', JSON.stringify(data).substring(0, 500));
    throw new Error('No image content in response');
  }
  let base64Data: string;

  // Handle base64 data URL or remote URL
  if (imageUrl.startsWith('data:')) {
    // Extract base64 data from data URL
    const base64Match = imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
    if (!base64Match) {
      throw new Error('Invalid base64 data URL format');
    }
    base64Data = base64Match[1];
  } else {
    // Fetch remote URL and convert to base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }
    const arrayBuffer = await imageResponse.arrayBuffer();
    base64Data = Buffer.from(arrayBuffer).toString('base64');
  }

  // Calculate cost based on megapixels
  const costUsd = calculateImageCost(width, height);

  // Generate filename from prompt
  const filename = generateFilename(prompt);

  return {
    data: base64Data,
    filename,
    prompt,
    model,
    width,
    height,
    costUsd,
  };
}
