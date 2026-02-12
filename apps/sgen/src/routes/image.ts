import { FastifyInstance } from 'fastify';
import { handleHeroImage, HeroImageRequest, HeroImageResponse } from '../handlers/image-hero';
import { handleSocialImage, SocialImageRequest, SocialImageResponse } from '../handlers/image-social';

/**
 * Image routes - endpoints for image generation
 */
export default async function imageRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/image/hero
   *
   * Generate a hero image for an article.
   * This endpoint handles the complete flow:
   * 1. Path matching (skip if path not in include_paths)
   * 2. AI prompt generation (using project's custom template or default)
   * 3. FLUX image generation
   *
   * Request body:
   * {
   *   article: { path, title, description, keywords? },
   *   branding?: { colors?: { primary, secondary, background } },
   *   include_paths?: string[],  // Glob patterns for paths to include
   *   custom_prompt_template?: string,  // Custom prompt with {{color}} macros
   *   options?: { width?, height? }
   * }
   *
   * Response:
   * - Success: { success: true, image: { data: base64, width, height, suggested_filename }, prompt_used, cost_usd }
   * - Skipped: { success: true, skipped: true, skip_reason: 'path_not_included' | 'no_include_paths' }
   * - Error: { success: false, error: string, cost_usd? }
   */
  app.post<{
    Body: HeroImageRequest;
    Reply: HeroImageResponse;
  }>('/hero', async (request, reply) => {
    const result = await handleHeroImage(request.body, app.log as any);

    if (!result.success) {
      reply.code(result.error?.includes('API error') ? 502 : 400);
    }

    return result;
  });

  /**
   * POST /api/v1/image/social
   *
   * Generate a social preview (OG) image for an article.
   * This uses Satori + Resvg for local rendering (no API costs).
   *
   * Request body:
   * {
   *   article: { title, description?, author?, date? },
   *   branding?: { brand_name?, badge? },
   *   hero_image_base64?: string,  // Optional background image
   *   custom_template?: string,    // Optional HTML template with {{placeholders}}
   *   config?: { badge?, brand_name?, gradient?, font? }
   * }
   *
   * Response:
   * - Success: { success: true, image: { data: base64, filename }, cost_usd: 0 }
   * - Error: { success: false, error: string, cost_usd: 0 }
   */
  app.post<{
    Body: SocialImageRequest;
    Reply: SocialImageResponse;
  }>('/social', async (request, reply) => {
    const result = await handleSocialImage(request.body, app.log as any);

    if (!result.success) {
      reply.code(400);
    }

    return result;
  });
}
