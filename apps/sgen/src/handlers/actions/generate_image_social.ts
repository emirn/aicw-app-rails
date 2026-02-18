/**
 * generate_image_social action handler
 *
 * Generates a social preview (OG) image using local Satori rendering.
 * No external AI call — free, local rendering.
 */

import { ActionHandlerFn } from './types';
import { buildArticleOperation, updateArticle } from '../utils';
import { requireBrandingColors } from '../../utils/guards';
import { readFileSync } from 'fs';
import { join } from 'path';

export const handle: ActionHandlerFn = async ({ article, normalizedMeta, context, flags, log }) => {
  requireBrandingColors(
    (context.projectConfig as any)?.branding?.colors,
    'generate_image_social'
  );
  const { SocialImageGenerator } = await import('@blogpostgen/og-image-gen');

  const title = normalizedMeta.title;
  if (!title) {
    return {
      success: false,
      error: 'Article title is required for social image generation',
      errorCode: 'MISSING_TITLE',
      operations: [],
    };
  }

  let heroImageBase64: string | undefined;
  const heroPath = normalizedMeta.image_hero;
  if (heroPath && flags.project_assets_dir) {
    try {
      const fullHeroPath = join(flags.project_assets_dir, heroPath.replace(/^\//, ''));
      const heroBuffer = readFileSync(fullHeroPath);
      const ext = heroPath.split('.').pop()?.toLowerCase() || 'png';
      const mimeType = ext === 'webp' ? 'image/webp' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
      heroImageBase64 = `data:${mimeType};base64,${heroBuffer.toString('base64')}`;
    } catch {
      log.warn({ heroPath }, 'generate_image_social:hero_image_not_found');
    }
  }

  const branding = (context.projectConfig as any)?.branding || {};
  const customConfig = flags.custom_variables || {};

  log.info({ path: context.articlePath, mode: 'generate_image_social' }, 'generate_image_social:generating');

  try {
    const generator = new SocialImageGenerator();
    generator.loadConfig({
      badge: customConfig.badge || branding.badge,
      brand_name: customConfig.brand_name || branding.brand_name || context.projectConfig?.title,
      gradient: customConfig.gradient || branding.gradient,
    });

    const result = await generator.generate({
      title,
      description: normalizedMeta.description,
      heroImageBase64,
    });

    const articlePath = context.articlePath || '';
    const ogPath = `assets/${articlePath}/og.webp`;

    const updatedArticleObj = updateArticle(normalizedMeta, {
      image_og: `/${ogPath}`,
    });

    log.info({ path: context.articlePath, mode: 'generate_image_social' }, 'generate_image_social:complete');

    return {
      success: true,
      message: 'Generated social preview image',
      tokensUsed: 0,
      costUsd: 0,
      operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, 'generate_image_social')],
      files: [{
        path: ogPath,
        content: result.buffer.toString('base64'),
      }],
    };
  } catch (err) {
    log.error({ err, path: context.articlePath }, 'generate_image_social:error');
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      errorCode: 'SOCIAL_IMAGE_GENERATION_FAILED',
      operations: [],
    };
  }
};
