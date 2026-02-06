import { FastifyInstance } from 'fastify';
import {
  IContentPlan,
  IWebsiteInfo,
} from '../types';
import { callAI } from '../services/ai.service';
import { ensureActionConfigForMode } from '../config/action-config';
import { renderTemplateAbsolutePath } from '../utils/template';
import { buildDebugInfo } from '../utils/debug';
import { validateWebsiteInfo, isPositiveInteger, formatValidationErrors } from '../utils/validation';

interface PlanGenerateRequest {
  website_info: IWebsiteInfo;
  target_articles?: number;
  ideas?: string[];
  additional_context?: string;
}

interface PlanGenerateResponse {
  success: boolean;
  plan?: IContentPlan;
  error?: string;
  tokens_used?: number;
  cost_usd?: number;
}

export default async function planRoutes(app: FastifyInstance) {
  app.post<{ Body: PlanGenerateRequest }>('/generate', async (request, reply) => {
    const {
      website_info,
      target_articles = 10,
      ideas = [],
      additional_context = '',
    } = request.body;

    // Validate input
    const websiteValidation = validateWebsiteInfo(website_info);
    if (!websiteValidation.valid) {
      reply.code(400);
      return {
        success: false,
        error: `Invalid website_info: ${formatValidationErrors(websiteValidation.errors)}`,
      };
    }

    if (target_articles !== undefined && !isPositiveInteger(target_articles)) {
      reply.code(400);
      return {
        success: false,
        error: 'target_articles must be a positive integer',
      };
    }

    try {
      const cfg = ensureActionConfigForMode('make_plan');

      // Prepare template variables for manual input
      const ideasList = ideas.length > 0
        ? ideas.map((idea: string) => `- ${idea}`).join('\n')
        : '(No specific ideas provided - generate topics based on website context)';

      const vars = {
        website_title: website_info.title || 'Untitled Website',
        website_url: website_info.url || '',
        website_description: website_info.description || 'No description provided',
        focus_keywords: website_info.focus_keywords || 'No keywords provided',
        focus_instruction: website_info.focus_instruction || 'General audience',
        brand_voice: website_info.brand_voice || 'Professional and informative',
        target_articles: target_articles.toString(),
        ideas_list: ideasList,
        additional_context: additional_context || 'None provided',
      };

      app.log.info({
        url: website_info.url,
        target_articles,
        has_ideas: ideas.length > 0
      }, 'plan/generate:start');

      const prompt = renderTemplateAbsolutePath(cfg.prompt_path!, vars);

      const { content, tokens, rawContent, debugInfo, usageStats } = await callAI(prompt, {
        provider: cfg.ai_provider || 'openrouter',
        modelId: cfg.ai_model_id || 'openai/gpt-4o',
        baseUrl: cfg.ai_base_url,
      });

      // Validate JSON response
      if (typeof content !== 'object' || !content.items) {
        app.log.error({ content }, 'Invalid plan response from AI');
        throw new Error('AI returned invalid plan structure (expected IContentPlan with items array)');
      }

      // Ensure plan has proper structure
      const plan: IContentPlan = {
        website: content.website || {
          url: website_info.url,
          title: website_info.title,
          focus_keywords: website_info.focus_keywords,
          audience: website_info.focus_instruction,
        },
        total_articles: content.total_articles || target_articles,
        items: content.items || [],
        summary: content.summary,
        clusters: content.clusters,
      };

      // Validate items structure
      if (!Array.isArray(plan.items) || plan.items.length === 0) {
        throw new Error('Plan must contain at least one article item');
      }

      app.log.info({
        items: plan.items.length,
        clusters: plan.clusters?.length || 0,
        tokens,
        cost_usd: usageStats.cost_usd
      }, 'plan/generate:done');

      return {
        success: true,
        plan,
        tokens_used: tokens,
        cost_usd: usageStats.cost_usd,
        debug: debugInfo ? buildDebugInfo(prompt, debugInfo.model_used, debugInfo.generation_time_ms, rawContent) : undefined,
      } as PlanGenerateResponse;
    } catch (err: any) {
      app.log.error({ err, message: err?.message, stack: err?.stack }, 'plan/generate:error');
      reply.code(500);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Plan generation failed',
      } as PlanGenerateResponse;
    }
  });
}
