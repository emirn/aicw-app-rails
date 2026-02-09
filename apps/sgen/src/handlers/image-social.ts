/**
 * Image Social Handler
 *
 * Generates OG/social preview images for articles using Satori + Resvg.
 * This is a local, template-based approach (no AI, no API costs).
 *
 * Flow:
 * 1. Load optional custom template and config
 * 2. Generate social image using Satori
 * 3. Convert SVG to PNG using Resvg
 * 4. Return base64 image + metadata
 */

import { SocialImageGenerator, SocialImageConfig } from '../utils/social-image-generator';

/**
 * Request body for POST /api/v1/image/social
 */
export interface SocialImageRequest {
  article: {
    title: string;
    description?: string;
    author?: string;
    published_at?: string;  // Formatted date string (e.g., "Jan 26, 2026")
  };

  branding?: {
    brand_name?: string;
    badge?: string;  // e.g., "BLOG", "GUIDE"
  };

  // Optional hero image for background (base64 data URL)
  hero_image_base64?: string;

  // Optional custom template (HTML with {{placeholders}})
  custom_template?: string;

  // Optional config for styling
  config?: SocialImageConfig;
}

/**
 * Response from POST /api/v1/image/social
 */
export interface SocialImageResponse {
  success: boolean;

  // Success case
  image?: {
    data: string;                     // base64 PNG
    filename: string;                 // suggested filename
  };

  cost_usd: number;                   // Always 0 (local rendering)

  // Error case
  error?: string;
}

/**
 * Handle social image generation request
 */
export async function handleSocialImage(
  request: SocialImageRequest,
  log: { info: Function; error: Function; warn: Function }
): Promise<SocialImageResponse> {
  const { article, branding, hero_image_base64, custom_template, config } = request;

  try {
    log.info({ title: article.title }, 'image-social:generating');

    const generator = new SocialImageGenerator();

    // Load optional config and template
    generator.loadConfig(config);
    generator.loadHtmlTemplate(custom_template);

    // Generate the social image
    const result = await generator.generate({
      title: article.title,
      description: article.description,
      author: article.author,
      published_at: article.published_at,
      badge: branding?.badge,
      brandName: branding?.brand_name,
      heroImageBase64: hero_image_base64,
    });

    log.info({ title: article.title, size: result.buffer.length }, 'image-social:complete');

    return {
      success: true,
      image: {
        data: result.buffer.toString('base64'),
        filename: result.filename,
      },
      cost_usd: 0,  // Local rendering - no API costs
    };
  } catch (err) {
    log.error({ err, title: article.title }, 'image-social:error');
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      cost_usd: 0,
    };
  }
}
