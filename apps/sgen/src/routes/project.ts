import { FastifyInstance } from 'fastify';
import { callAI } from '../services/ai.service';
import { ensureActionConfigForMode } from '../config/action-config';
import { renderTemplateAbsolutePath } from '../utils/template';
import { buildDebugInfo } from '../utils/debug';
import { readFileSync } from 'fs';
import { join } from 'path';

interface GenerateConfigRequest {
  site_name: string;
  site_description: string;
  site_url?: string;
  color_preference?: string;
}

interface GenerateConfigResponse {
  success: boolean;
  branding?: Record<string, unknown>;
  error?: string;
  tokens_used?: number;
  cost_usd?: number;
}

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/**
 * Load illustration styles CSV, excluding realistic_image (photorealistic) styles.
 * Returns formatted text for embedding in prompt.
 */
function loadIllustrationStyles(): { text: string; validIds: Set<string> } {
  const csvPath = join(__dirname, '..', '..', 'config', 'illustration-styles.csv');
  const content = readFileSync(csvPath, 'utf-8');
  const lines = content.trim().split('\n').slice(1); // skip header

  const validIds = new Set<string>();
  const filtered: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const commaIdx = line.indexOf(',');
    const styleId = line.slice(0, commaIdx).trim();
    // Exclude realistic_image styles (photorealistic)
    if (styleId.startsWith('realistic_image')) continue;
    validIds.add(styleId);
    filtered.push(line.trim());
  }

  return { text: filtered.join('\n'), validIds };
}

/**
 * Validate that required branding fields exist and colors are valid hex.
 */
function validateBranding(
  branding: Record<string, unknown>,
  validStyleIds: Set<string>,
  log: any
): string[] {
  const errors: string[] = [];

  const requiredFields = ['badge', 'brand_name', 'site', 'colors', 'illustration_style'];
  for (const field of requiredFields) {
    if (!branding[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate colors are hex
  const colors = branding.colors as Record<string, string> | undefined;
  if (colors && typeof colors === 'object') {
    for (const [key, value] of Object.entries(colors)) {
      if (typeof value === 'string' && !HEX_COLOR_RE.test(value)) {
        errors.push(`Invalid hex color for colors.${key}: ${value}`);
      }
    }
  }

  // Validate dark_mode colors
  const darkMode = branding.dark_mode as Record<string, unknown> | undefined;
  if (darkMode?.colors && typeof darkMode.colors === 'object') {
    for (const [key, value] of Object.entries(darkMode.colors as Record<string, string>)) {
      if (typeof value === 'string' && !HEX_COLOR_RE.test(value)) {
        errors.push(`Invalid hex color for dark_mode.colors.${key}: ${value}`);
      }
    }
  }

  // Validate illustration_style (warn only, don't reject)
  const style = branding.illustration_style as string | undefined;
  if (style && !validStyleIds.has(style)) {
    log.warn({ style }, 'AI selected unknown illustration style — allowing but flagging');
  }

  // Validate typography (optional — warn if present but incomplete)
  const typography = branding.typography as Record<string, unknown> | undefined;
  if (typography && typeof typography === 'object') {
    if (!typography.fontFamily || !typography.googleFonts) {
      log.warn({ typography }, 'Typography missing fontFamily or googleFonts — template defaults will apply');
    }
  }

  return errors;
}

export default async function projectRoutes(app: FastifyInstance) {
  app.post<{ Body: GenerateConfigRequest }>('/generate-config', async (request, reply) => {
    const {
      site_name,
      site_description,
      site_url,
      color_preference,
    } = request.body;

    // Validate required fields
    if (!site_name || typeof site_name !== 'string' || !site_name.trim()) {
      reply.code(400);
      return { success: false, error: 'site_name is required' };
    }
    if (!site_description || typeof site_description !== 'string' || !site_description.trim()) {
      reply.code(400);
      return { success: false, error: 'site_description is required' };
    }

    try {
      const cfg = ensureActionConfigForMode('generate_project_config');
      const { text: stylesText, validIds: validStyleIds } = loadIllustrationStyles();

      const vars = {
        site_name: site_name.trim(),
        site_description: site_description.trim(),
        site_url: site_url?.trim() || site_name.trim(),
        color_preference: color_preference?.trim() || 'No specific preference — choose colors that match the industry and audience',
        illustration_styles: stylesText,
      };

      app.log.info({
        site_name,
        site_url: vars.site_url,
        has_color_pref: !!color_preference,
      }, 'project/generate-config:start');

      const prompt = renderTemplateAbsolutePath(cfg.prompt_path!, vars);

      const { content, tokens, rawContent, debugInfo, usageStats } = await callAI(prompt, {
        provider: cfg.ai_provider || 'openrouter',
        modelId: cfg.ai_model_id || 'anthropic/claude-sonnet-4',
        baseUrl: cfg.ai_base_url,
        pricing: cfg.pricing,
      });

      // Validate response structure
      if (typeof content !== 'object' || !content.colors) {
        app.log.error({ content }, 'Invalid branding response from AI');
        throw new Error('AI returned invalid branding structure (expected object with colors)');
      }

      const validationErrors = validateBranding(content, validStyleIds, app.log);
      if (validationErrors.length > 0) {
        app.log.warn({ errors: validationErrors }, 'Branding validation warnings');
        // Only reject if critical fields are missing
        const critical = validationErrors.filter(e =>
          e.startsWith('Missing required') || e.startsWith('Invalid hex')
        );
        if (critical.length > 0) {
          throw new Error(`Invalid branding: ${critical.join('; ')}`);
        }
      }

      app.log.info({
        brand_name: content.brand_name,
        style: content.illustration_style,
        tokens,
        cost_usd: usageStats.cost_usd,
      }, 'project/generate-config:done');

      return {
        success: true,
        branding: content,
        tokens_used: tokens,
        cost_usd: usageStats.cost_usd,
        debug: debugInfo ? buildDebugInfo(prompt, debugInfo.model_used, debugInfo.generation_time_ms, rawContent) : undefined,
      } as GenerateConfigResponse;
    } catch (err: any) {
      app.log.error({ err, message: err?.message, stack: err?.stack }, 'project/generate-config:error');
      reply.code(500);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Config generation failed',
      } as GenerateConfigResponse;
    }
  });
}
