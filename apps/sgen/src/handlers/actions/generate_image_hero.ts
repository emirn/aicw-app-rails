/**
 * generate_image_hero action handler
 *
 * Generates a hero image for an article using Recraft AI.
 * Requires branding colors in project config.
 */

import { ActionHandlerFn } from './types';
import { buildArticleOperation, updateArticle } from '../utils';
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveProjectMacros, resolveProjectMacrosInText } from '../../utils/variables';
import { ensureNoUnreplacedMacros, requireBrandingColors } from '../../utils/guards';
import { convertBase64ToWebp } from '@blogpostgen/og-image-gen';

export const handle: ActionHandlerFn = async ({ article, normalizedMeta, context, flags, cfg, log }) => {
  const imageEngine = cfg?.image_engine;
  const imageModelId = cfg?.image_model_id;
  if (!imageEngine) {
    throw new Error('generate_image_hero: image_engine not set in config.json (expected "recraft" or "flux")');
  }
  if (!imageModelId) {
    throw new Error('generate_image_hero: image_model_id not set in config.json');
  }

  const brandingColors = requireBrandingColors(
    (context.projectConfig as any)?.branding?.colors,
    'generate_image_hero'
  );
  const { replaceVariables } = await import('../../utils/variables');

  const description = normalizedMeta.description;
  if (!description) {
    return {
      success: false,
      error: 'Article description is required for hero image generation. Check meta.md has a description field.',
      errorCode: 'MISSING_DESCRIPTION',
      operations: [],
    };
  }

  const templatePath = join(__dirname, '..', '..', '..', 'config', 'actions', 'generate_image_hero', 'prompt.md');
  let promptTemplate = readFileSync(templatePath, 'utf-8');

  if (flags.custom_prompt_template) {
    promptTemplate = flags.custom_prompt_template;
  }

  const resolvedColors = resolveProjectMacros(
    (cfg as any)?.colors || {},
    context.projectConfig as unknown as Record<string, unknown>
  );
  const variables = { ...cfg?.variables, ...resolvedColors, ...flags.custom_variables };
  promptTemplate = replaceVariables(promptTemplate, variables);

  if (cfg?.supports_custom_prompt) {
    const customPrompt = flags.custom_prompt ?? '';
    promptTemplate = promptTemplate.replace(/\{\{custom\}\}/gi, customPrompt);
  }

  const normalizedContent = normalizedMeta.content || '';
  const headings = normalizedContent
    .split('\n')
    .filter(line => /^##\s/.test(line))
    .map(line => line.replace(/^#+\s*/, '').trim())
    .slice(0, 5)
    .join(', ');

  let imagePrompt = promptTemplate
    .replace(/\{\{DESCRIPTION\}\}/gi, description)
    .replace(/\{\{TITLE\}\}/gi, article.title)
    .replace(/\{\{KEYWORDS\}\}/gi, article.keywords || '')
    .replace(/\{\{CONTENT_EXCERPT\}\}/gi, headings);

  imagePrompt = resolveProjectMacrosInText(
    imagePrompt,
    context.projectConfig as unknown as Record<string, unknown>
  );

  ensureNoUnreplacedMacros(imagePrompt, 'generate_image_hero');

  log.info({ path: context.articlePath, mode: 'generate_image_hero' }, 'generate_image_hero:generating');

  try {
    let generatedImage;
    if (imageEngine === 'recraft') {
      const { generateRecraftImage } = await import('../../services/recraft-image.service');
      const branding = (context.projectConfig as any)?.branding;
      const recraftStyle = branding?.illustration_style || 'digital_illustration/pastel_gradient';
      generatedImage = await generateRecraftImage({
        prompt: imagePrompt,
        model: imageModelId,
        width: 1200,
        height: 630,
        style: recraftStyle,
        colors: brandingColors,
        log,
      });
    } else {
      const { generateImage } = await import('../../services/image.service');
      generatedImage = await generateImage({
        prompt: imagePrompt,
        width: 1200,
        height: 630,
      });
    }

    const webpData = await convertBase64ToWebp(generatedImage.data);

    const heroFilename = 'hero.webp';
    const heroPath = `assets/${context.articlePath}/${heroFilename}`;

    const updatedArticleObj = updateArticle(normalizedMeta, {
      image_hero: `/${heroPath}`,
    });

    log.info({ path: context.articlePath, mode: 'generate_image_hero', costUsd: generatedImage.costUsd }, 'generate_image_hero:complete');

    return {
      success: true,
      message: `Generated hero image`,
      tokensUsed: 0,
      costUsd: generatedImage.costUsd,
      operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, 'generate_image_hero')],
      files: [{
        path: heroPath,
        content: webpData,
      }],
    };
  } catch (err) {
    log.error({ err, path: context.articlePath }, 'generate_image_hero:recraft_error');
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      errorCode: 'IMAGE_GENERATION_FAILED',
      operations: [],
    };
  }
};
