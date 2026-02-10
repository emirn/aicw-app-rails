/**
 * Image Hero Handler
 *
 * Generates hero images for articles using direct Flux prompt with macro substitution.
 * Uses a template-based approach where {{DESCRIPTION}}, {{TITLE}}, {{KEYWORDS}}, and
 * color macros are replaced before sending directly to Flux.
 *
 * Flow:
 * 1. Check path matching (include_paths)
 * 2. Load prompt template
 * 3. Replace all macros (colors + article info)
 * 4. Generate image via FLUX (no intermediate AI call)
 * 5. Return base64 image + metadata
 */

import { minimatch } from 'minimatch';
import { IBrandingColors } from '@blogpostgen/types';
import { generateImage } from '../services/image.service';
import { generateRecraftImage } from '../services/recraft-image.service';
import { readFileSync } from 'fs';
import { join } from 'path';
import { convertBase64ToWebp } from '../utils/webp-converter';
import { ensureNoUnreplacedMacros } from '../utils/guards';

const DEFAULT_HERO_PROVIDER: 'flux' | 'recraft' = 'recraft';
const DEFAULT_RECRAFT_STYLE = 'digital_illustration';

/**
 * Request body for POST /api/v1/image/hero
 */
export interface HeroImageRequest {
  article: {
    path: string;           // For path matching
    title: string;
    description: string;
    keywords?: string[];
  };

  branding?: {
    colors?: IBrandingColors;
  };

  include_paths?: string[];           // Skip if path doesn't match
  custom_prompt_template?: string;    // User override (with macros)

  options?: {
    width?: number;                   // default 1200
    height?: number;                  // default 630
    provider?: 'flux' | 'recraft';    // default 'recraft'
  };
}

/**
 * Response from POST /api/v1/image/hero
 */
export interface HeroImageResponse {
  success: boolean;                   // true even if skipped (valid skip)

  // Skip case (success=true, skipped=true)
  skipped?: boolean;
  skip_reason?: 'path_not_included' | 'no_include_paths';

  // Success case (success=true, skipped=false)
  image?: {
    data: string;                     // base64 PNG
    width: number;
    height: number;
    suggested_filename: string;
  };

  prompt_used?: string;               // For debugging
  cost_usd?: number;

  // Error case (success=false)
  error?: string;
}

/**
 * Default colors for hero image generation
 */
export const DEFAULT_HERO_COLORS: IBrandingColors = {
  primary: '#3B82F6',
  secondary: '#8B5CF6',
  accent: '#F59E0B',
  background: '#1E293B',
};

/**
 * Convert a string to a URL-friendly slug
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Check if an action should run for a given article path
 *
 * @param articlePath - Relative path to article (e.g., 'blog/my-article')
 * @param includePaths - Glob patterns for paths that should run this action
 * @returns true if action should run, false otherwise
 */
function shouldRunForPath(articlePath: string, includePaths?: string[]): boolean {
  // No include_paths = skip (default behavior saves money)
  if (!includePaths || includePaths.length === 0) {
    return false;
  }

  // Check if any pattern matches the article path
  return includePaths.some((pattern) =>
    minimatch(articlePath, pattern, { matchBase: true })
  );
}

/**
 * Replace color macros in a prompt template
 *
 * @param template - Prompt template with {{color_name}} macros
 * @param colors - Color values to substitute
 * @returns Template with colors replaced
 */
export function replaceColorMacros(template: string, colors: IBrandingColors): string {
  const finalColors = { ...DEFAULT_HERO_COLORS, ...colors };

  return template
    .replace(/\{\{primary_color\}\}/gi, finalColors.primary!)
    .replace(/\{\{secondary_color\}\}/gi, finalColors.secondary!)
    .replace(/\{\{accent_color\}\}/gi, finalColors.accent!)
    .replace(/\{\{background_color\}\}/gi, finalColors.background!);
}

/**
 * Get default hero image prompt template
 */
function getDefaultPromptTemplate(): string {
  const templatePath = join(__dirname, '..', '..', 'config', 'actions', 'generate_image_hero', 'prompt.md');
  return readFileSync(templatePath, 'utf-8');
}

/**
 * Handle hero image generation request
 */
export async function handleHeroImage(
  request: HeroImageRequest,
  log: { info: Function; error: Function; warn: Function }
): Promise<HeroImageResponse> {
  const { article, branding, include_paths, custom_prompt_template, options } = request;

  // 1. Check path matching
  if (!shouldRunForPath(article.path, include_paths)) {
    const skipReason = !include_paths || include_paths.length === 0
      ? 'no_include_paths'
      : 'path_not_included';

    log.info({ path: article.path, skipReason }, 'image-hero:skipped');

    return {
      success: true,
      skipped: true,
      skip_reason: skipReason,
    };
  }

  // 2. Load prompt template
  let promptTemplate = custom_prompt_template || getDefaultPromptTemplate();

  // 3. Replace ALL macros (colors + article info)
  const colors = branding?.colors || {};
  promptTemplate = replaceColorMacros(promptTemplate, colors);

  const imagePrompt = promptTemplate
    .replace(/\{\{DESCRIPTION\}\}/gi, article.description || '')
    .replace(/\{\{TITLE\}\}/gi, article.title)
    .replace(/\{\{KEYWORDS\}\}/gi, article.keywords?.join(', ') || '');

  // Validate no unreplaced macros remain
  ensureNoUnreplacedMacros(imagePrompt, 'generate_image_hero');

  log.info({ path: article.path }, 'image-hero:generating_image');

  // 4. Generate image
  const width = options?.width || 1200;
  const height = options?.height || 630;
  const provider = options?.provider || DEFAULT_HERO_PROVIDER;

  log.info({ path: article.path, provider }, 'image-hero:provider_selected');

  try {
    let generatedImage;

    if (provider === 'recraft') {
      generatedImage = await generateRecraftImage({
        prompt: imagePrompt,
        width,
        height,
        style: DEFAULT_RECRAFT_STYLE,
        colors: branding?.colors,
      });
    } else {
      generatedImage = await generateImage({
        prompt: imagePrompt,
        width,
        height,
      });
    }

    // Convert PNG to WebP for better compression
    const webpData = await convertBase64ToWebp(generatedImage.data);

    log.info({ path: article.path, provider, costUsd: generatedImage.costUsd }, 'image-hero:complete');

    return {
      success: true,
      image: {
        data: webpData,
        width: generatedImage.width,
        height: generatedImage.height,
        suggested_filename: `${slugify(article.title)}-hero.webp`,
      },
      prompt_used: imagePrompt,
      cost_usd: generatedImage.costUsd,
    };
  } catch (err) {
    log.error({ err, path: article.path, provider }, 'image-hero:generation_error');
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
