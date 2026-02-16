import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import {
  IApiArticle,
  IArticleUpdateBody,
  IArticleUpdateResponse,
  INewArticleBody,
  INewArticleResponse,
} from '../types';
import { callAI } from '../services/ai.service';
import { config } from '../config/server-config';
import { buildArticlePrompt, buildUpdatePrompt } from '../utils/prompts';
import { ACTION_CONFIG, ensureActionConfigForMode, isValidActionMode, VALID_ACTION_MODES } from '../config/action-config';
import { ensureTemplateExistsNonEmpty, ensureNonEmptyText } from '../utils/guards';
import { mergeUpdate, MergeResult, parseLinePatches as updParseLinePatches, applyPatches as updApplyPatches, extractContentText, generatePathFromTitle, parseTextReplacements, applyTextReplacements } from '../utils/articleUpdate';
import { collectKnownPaths, ensureUniquePath } from '../utils/article-path';
import { buildDebugInfo } from '../utils/debug';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateWebsiteInfo, validateArticle, isNonEmptyString, formatValidationErrors } from '../utils/validation';
import { cleanMarkdownUrls } from '../utils/url-cleaner';
import { findSafeZones } from '../utils/random-typos';
import { stripDuplicateTitleH1 } from '../utils/content';
import { truncateError, truncateString } from '../utils/log-truncate';

export default async function articleRoutes(app: FastifyInstance) {
  // Moved update helpers into ../utils/articleUpdate
  app.post<{ Body: INewArticleBody }>('/generate', async (request, reply) => {
    const { description, website_info, target_words = 2000, prompt_parts } = request.body;

    // Validate input
    if (!isNonEmptyString(description)) {
      reply.code(400);
      return {
        success: false,
        error: 'description is required and must be a non-empty string',
      };
    }

    const websiteValidation = validateWebsiteInfo(website_info);
    if (!websiteValidation.valid) {
      reply.code(400);
      return {
        success: false,
        error: `Invalid website_info: ${formatValidationErrors(websiteValidation.errors)}`,
      };
    }

    // Validate prompt_parts is provided and customized
    if (!prompt_parts?.project_requirements) {
      reply.code(400);
      return {
        success: false,
        error: 'prompt_parts.project_requirements is required. Load from project prompts/write_draft/requirements.md file.',
      };
    }

    if (prompt_parts.project_requirements.includes('CUSTOMIZE_THIS_TEMPLATE_AND_REMOVE_THIS_TAG')) {
      reply.code(400);
      return {
        success: false,
        error: 'Project requirements have not been customized. Please edit prompts/write_draft/requirements.md and remove the DEFAULT_TEMPLATE marker.',
      };
    }

    // Check minimum length (after stripping HTML comments)
    const cleanedRequirements = prompt_parts.project_requirements.replace(/<!--[\s\S]*?-->/g, '').trim();
    if (cleanedRequirements.length < 50) {
      reply.code(400);
      return {
        success: false,
        error: 'Project requirements appear empty or too short. Please add meaningful content to prompts/write_draft/prompt.md.',
      };
    }

    try {
      // Pass custom prompt template if provided
      const customTemplate = prompt_parts?.custom_prompt_template;
      const prompt = buildArticlePrompt(description, website_info, prompt_parts, undefined, customTemplate);
      const genCfg = ACTION_CONFIG['write_draft'];
      const provider = genCfg?.ai_provider || 'openrouter';
      const modelId = genCfg?.ai_model_id || (provider === 'openai'
        ? config.ai.defaultModel.replace(/^openai\//, '')
        : config.ai.defaultModel);
      app.log.info({ title: website_info.title, words: target_words, provider, modelId }, 'generate:start');
      const { content, tokens, rawContent, debugInfo, usageStats } = await callAI(prompt, {
        provider,
        modelId,
        baseUrl: genCfg?.ai_base_url,
        pricing: genCfg?.pricing,
      });

      let article: IApiArticle;

      if (typeof content === 'object' && content.content) {
        // AI returned proper JSON with IArticle structure
        article = {
          id: content.id || `article-${randomUUID()}`,
          path: content.path || '',
          title: content.title || website_info.title,
          description: content.description || description,
          keywords: content.keywords || website_info.focus_keywords,
          content: content.content,
        };
      } else {
        // Fallback for raw content or malformed JSON
        const contentText = typeof content === 'string' ? content : rawContent;

        // Try to extract title from markdown content (first # heading)
        let extractedTitle = website_info.title; // fallback
        const titleMatch = contentText.match(/^#\s+(.+)$/m);
        if (titleMatch && titleMatch[1]) {
          extractedTitle = titleMatch[1].trim();
        }

        article = {
          id: `article-${randomUUID()}`,
          path: '',
          title: extractedTitle,
          description,
          keywords: website_info.focus_keywords,
          content: contentText,
        };
      }

      // Strip duplicate H1 title from content if it matches the article title
      article.content = stripDuplicateTitleH1(article.content, article.title);

      // Ensure path exists and is unique vs site published/main pages
      const known = collectKnownPaths(website_info);
      if (!article.path || !article.path.trim()) {
        if (article.title) article.path = generatePathFromTitle(article.title);
      }
      if (article.path) {
        article.path = ensureUniquePath(article.path, known);
      }

      const response: INewArticleResponse = {
        article,
        success: true,
        tokens_used: tokens,
        cost_usd: usageStats.cost_usd,
        debug: debugInfo ? buildDebugInfo(prompt, debugInfo.model_used, debugInfo.generation_time_ms, rawContent) : undefined,
      };
      app.log.info({ id: article.id, words: article.content.split(/\s+/).length, tokens_used: tokens || 0, cost_usd: usageStats.cost_usd }, 'generate:done');
      return response;
    } catch (err: any) {
      app.log.error({ err: truncateError(err), message: truncateString(err?.message || '', 500) }, 'generate:error');
      reply.code(500);
      return {
        success: false,
        error: err instanceof Error ? truncateString(err.message, 500) : 'AI generation failed',
        error_details: err?.stack ? String(err.stack).split('\n').slice(0, 5).join('\n') : undefined,
      };
    }
  });

  app.post<{ Body: IArticleUpdateBody }>('/update', async (request, reply) => {
    const { article, mode, context, output_mode } = request.body;

    // Validate mode
    if (!isValidActionMode(mode)) {
      reply.code(400);
      return {
        article,
        success: false,
        error: `Invalid mode '${mode}'. Valid modes: ${VALID_ACTION_MODES.join(', ')}`,
      } as IArticleUpdateResponse;
    }

    // Validate article
    const articleValidation = validateArticle(article);
    if (!articleValidation.valid) {
      reply.code(400);
      return {
        article,
        success: false,
        error: `Invalid article: ${formatValidationErrors(articleValidation.errors)}`,
      } as IArticleUpdateResponse;
    }

    if (mode === 'write_draft') {
      reply.code(400);
      return {
        article,
        success: false,
        error: 'Use /api/v1/article/generate for creation; /update handles single edit actions.',
      } as IArticleUpdateResponse;
    }

    const contentRequired = new Set([
      'add_images',
      'add_links',
      'add_external_links',
      'add_diagrams',
      'add_faq',
      'add_content_jsonld',
      'fact_check',
      'humanize_text',
      'improve_seo',
      'validate_format',
    ]);
    if (contentRequired.has(mode) && (!article.content || article.content.trim() === '')) {
      reply.code(400);
      return {
        article,
        success: false,
        error: `article.content is required for mode '${mode}'`,
      } as IArticleUpdateResponse;
    }

    // Special action: validate_links (deterministic code action)
    if (mode === 'validate_links') {
      try {
        const { LinkValidator } = await import('../utils/link-validator');
        const { cleanedContent, removedLinks, checkedCount } = await LinkValidator.validateAndClean(article.content || '');

        const updated: IApiArticle = {
          ...article,
          content: cleanedContent,
        };

        return {
          article: updated,
          success: true,
          changes_made: [`validate_links applied: checked ${checkedCount}, removed ${removedLinks.length}`],
          tokens_used: 0,
          cost_usd: 0,
          debug: {
            model_used: 'link-validator',
            generation_time_ms: 0,
            prompt_tokens: 0,
            completion_tokens: 0,
            raw_response: JSON.stringify({ removedLinks, checkedCount })
          }
        };
      } catch (err: any) {
        app.log.error({ err }, 'validate_links:error');
        return { article, success: false, error: err?.message || 'validate_links failed' };
      }
    }

    // Special action: humanize_text (AI if configured; fallback to static replacements)
    if (mode === 'humanize_text') {
      try {
        const mappingPrimary = join(__dirname, '..', '..', 'config', 'actions', 'humanize_text', 'replacements.csv');
        const mappingFallback = join(__dirname, '..', '..', 'config', 'actions', 'humanize_content', 'ai-to-human-words.csv');
        let csv = '';
        try { csv = readFileSync(mappingPrimary, 'utf8'); } catch { }
        if (!csv) { csv = readFileSync(mappingFallback, 'utf8'); }
        const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const lines = (csv || '').split(/\r?\n/).filter((l) => l.trim().length > 0 && !/^\s*#/.test(l));
        const pairs: { from: string; to: string }[] = [];
        for (const line of lines) {
          // naive CSV: first comma splits source,target
          const idx = line.indexOf(',');
          if (idx <= 0) continue;
          const from = line.slice(0, idx).trim().replace(/^"|"$/g, '');
          const to = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
          if (!from) continue;
          pairs.push({ from, to });
        }

        // If AI is configured for this action, delegate to LLM with guardrails
        // const cfg = ensureActionConfigForMode('humanize_text' as any);
        // if (cfg?.ai_model_id) {
        //   const replacements = pairs.map(p => `${p.from} => ${p.to}`).join('\n');
        //   const outMode = 'text_replace_all' as const;
        //   const prompt = buildUpdatePrompt(article, 'humanize_text' as any, { replacements }, outMode);
        //   const provider = cfg.ai_provider || 'openrouter';
        //   const modelId = cfg.ai_model_id || (provider === 'openai' ? config.ai.defaultModel.replace(/^openai\//, '') : config.ai.defaultModel);
        //   const { content, tokens, rawContent, debugInfo, usageStats } = await callAI(prompt, { provider, modelId });
        //   const updated = mergeUpdate(article, mode, content, rawContent);
        //   return {
        //     article: updated,
        //     success: true,
        //     changes_made: ['humanize_text (LLM) applied'],
        //     tokens_used: tokens,
        //     cost_usd: usageStats.cost_usd,
        //     debug: debugInfo ? buildDebugInfo(prompt, debugInfo.model_used, debugInfo.generation_time_ms, rawContent) : undefined,
        //   };
        // }

        // 1. Apply static replacements (with safe zone protection)
        pairs.sort((a, b) => b.from.length - a.from.length);
        let text = article.content || '';

        // Find safe zones ONCE before all replacements
        const safeZones = findSafeZones(text);

        for (const { from, to } of pairs) {
          const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'gi');
          text = text.replace(re, (match, offset) => {
            // Check if this match is in a safe zone (code blocks, URLs, etc.)
            for (const zone of safeZones) {
              if (offset >= zone.start && offset < zone.end) {
                return match; // Don't replace - in safe zone
              }
            }
            // Support random variant selection with pipe syntax: "option1|option2|option3"
            if (to.includes('|')) {
              const variants = to.split('|');
              return variants[Math.floor(Math.random() * variants.length)];
            }
            return to;
          });
        }

        let changes = ['humanize_text (static) applied'];
        let tokensUsed = 0;
        let costUsd = 0;
        let debugInfo: any = undefined;

        // 2. Apply AI fix for orthography (if configured or default)
        // We always try to fix orthography after static replacement to ensure quality
        try {
          const fixPromptPath = join(__dirname, '..', '..', 'config', 'actions', 'humanize_text', 'fix_orthography.md');

          const cfg = ACTION_CONFIG['humanize_text'];
          const provider = cfg?.ai_provider || 'openrouter';
          const modelId = cfg?.ai_model_id || (provider === 'openai' ? config.ai.defaultModel.replace(/^openai\//, '') : config.ai.defaultModel);

          // Render prompt manually since buildUpdatePrompt is tied to specific modes/templates
          const { renderTemplateAbsolutePath } = await import('../utils/template');
          const vars = { content: text };

          // Use absolute path rendering
          const prompt = renderTemplateAbsolutePath(fixPromptPath, vars);

          app.log.info({ mode: 'humanize_text', action: 'fix_orthography' }, 'ai_fix:start');
          const aiRes = await callAI(prompt, { provider, modelId, baseUrl: cfg?.ai_base_url, pricing: cfg?.pricing });

          if (aiRes.content && typeof aiRes.content === 'string') {
            text = aiRes.content; // Update text with AI fixed version
            changes.push('orthography fixed (AI)');
            tokensUsed += aiRes.tokens || 0;
            costUsd += aiRes.usageStats.cost_usd || 0;
            debugInfo = aiRes.debugInfo;
          }
        } catch (e) {
          app.log.warn({ err: e }, 'Failed to apply orthography fix, returning static replacement only');
        }

        const updated: IApiArticle = { ...article, content: text };
        return {
          article: updated,
          success: true,
          changes_made: changes,
          tokens_used: tokensUsed,
          cost_usd: costUsd,
          debug: debugInfo
        };
      } catch (err: any) {
        app.log.error({ err }, 'humanize_text:error');
        return { article, success: false, error: err?.message || 'humanize_text failed' };
      }
    }

    // Special action: humanize_text_random (deterministic code action - no AI)
    if (mode === 'humanize_text_random') {
      try {
        const { applyRandomTypos, loadTyposFromCSV, DEFAULT_TYPO_CONFIG } = await import('../utils/random-typos');

        // Load typos CSV
        const typosPath = join(__dirname, '..', '..', 'config', 'actions', 'humanize_text_random', 'typos.csv');
        let csvContent = '';
        try {
          csvContent = readFileSync(typosPath, 'utf8');
        } catch (e) {
          app.log.warn({ err: e }, 'humanize_text_random: No typos.csv found, using algorithmic typos only');
        }

        const commonTypos = loadTyposFromCSV(csvContent);

        // Allow rate override from context (default: 4 typos per 1000 chars = 0.4%)
        const rate = context?.typo_rate ?? DEFAULT_TYPO_CONFIG.rate;
        const seed = context?.seed; // Optional reproducibility

        const { result, typosApplied } = applyRandomTypos(
          article.content || '',
          commonTypos,
          { rate, seed }
        );

        const updated: IApiArticle = {
          ...article,
          content: result,
        };

        app.log.info({ mode: 'humanize_text_random', typos_applied: typosApplied.length, rate }, 'humanize_text_random:done');

        return {
          article: updated,
          success: true,
          changes_made: [`humanize_text_random applied: ${typosApplied.length} typos introduced`],
          tokens_used: 0,
          cost_usd: 0,
          debug: {
            model_used: 'random-typos',
            generation_time_ms: 0,
            prompt_tokens: 0,
            completion_tokens: 0,
            raw_response: JSON.stringify({ typosApplied, rate }),
          },
        };
      } catch (err: any) {
        app.log.error({ err }, 'humanize_text_random:error');
        return { article, success: false, error: err?.message || 'humanize_text_random failed' };
      }
    }

    // Sanity checks for config/prompts per action
    try {
      const defaultCfg = ensureActionConfigForMode(mode as any);
      if (defaultCfg?.prompt_path) ensureTemplateExistsNonEmpty(defaultCfg.prompt_path);
      const outMode = output_mode || defaultCfg?.output_mode || 'text_replace_all';
      const prompt = buildUpdatePrompt(article, mode, context, outMode);
      app.log.info({ id: article.id, mode, output_mode: outMode, desc: defaultCfg?.description }, 'update:start');
      const provider = defaultCfg?.ai_provider || 'openrouter';
      const modelId = defaultCfg?.ai_model_id || (provider === 'openai' ? config.ai.defaultModel.replace(/^openai\//, '') : config.ai.defaultModel);
      const { content, tokens, rawContent, debugInfo, usageStats } = await callAI(prompt, {
        provider,
        modelId,
        baseUrl: defaultCfg?.ai_base_url,
        webSearch: defaultCfg?.web_search,
        pricing: defaultCfg?.pricing,
      });

      let updated: IApiArticle;
      if (outMode === 'insert_content') {
        const text = extractContentText(content, rawContent);
        ensureNonEmptyText('AI patch output', text);
        const patches = updParseLinePatches(text);
        if (patches.length > 0) {
          const patchResult = updApplyPatches(article.content, patches, {
            validateStructures: true,
            logger: (msg) => app.log.warn({ mode }, msg),
          });

          // Handle both string and ApplyPatchesResult return types
          const patched = typeof patchResult === 'string' ? patchResult : patchResult.content;

          // Log adjustments if any (patches moved to avoid breaking tables/lists)
          if (typeof patchResult === 'object' && patchResult.adjustments.length > 0) {
            app.log.warn(
              { mode, adjustments: patchResult.adjustments },
              'insert_content:patch_adjustments'
            );
          }

          updated = { ...article, content: patched };
        } else {
          // Fallback to regular merge if no patches detected
          const mergeResult = mergeUpdate(article, mode, content, rawContent);
          if (mergeResult.rejected) {
            reply.code(400);
            return {
              article,
              success: false,
              error: `Update ${mode} failed: ${mergeResult.reason}`,
            } as IArticleUpdateResponse;
          }
          updated = mergeResult.article;
        }
      } else if (outMode === 'insert_content_top') {
        const text = extractContentText(content, rawContent);
        ensureNonEmptyText('AI insert_top output', text);
        const sep = article.content.startsWith('\n') || text.endsWith('\n') ? '' : '\n';
        const combined = `${text}${sep}${article.content}`;
        updated = { ...article, content: combined };
      } else if (outMode === 'insert_content_bottom') {
        const text = extractContentText(content, rawContent);
        ensureNonEmptyText('AI insert_bottom output', text);
        const sep = article.content.endsWith('\n') || text.startsWith('\n') ? '' : '\n';
        const combined = `${article.content}${sep}${text}`;
        updated = { ...article, content: combined };
      } else if (outMode === 'text_replace') {
        // Text replacement mode: AI returns { replacements: [{find, replace}] }
        const replacements = parseTextReplacements(content);
        if (replacements.length > 0) {
          const { result, applied, skipped } = applyTextReplacements(article.content, replacements);

          // Safety guard: reject if content shrunk by more than 30%
          const shrinkage = 1 - (result.length / article.content.length);
          if (shrinkage > 0.3) {
            app.log.error({ mode, shrinkagePct: Math.round(shrinkage * 100) },
              'text_replace:content_shrunk_>30%, preserving original');
            updated = article;
          } else {
            updated = { ...article, content: result };
          }

          if (skipped.length > 0) {
            app.log.warn({ mode, skipped }, 'text_replace:some_replacements_not_found');
          }
          app.log.info({ mode, total: replacements.length, applied, skipped: skipped.length }, 'text_replace:applied');
        } else {
          // No replacements found - preserve original article (do NOT call mergeUpdate which destroys content)
          app.log.warn({ mode }, 'text_replace:no_replacements_found, preserving original article');
          updated = article;
        }
      } else {
        const mergeResult = mergeUpdate(article, mode, content, rawContent);
        if (mergeResult.rejected) {
          reply.code(400);
          return {
            article,
            success: false,
            error: `Update ${mode} failed: ${mergeResult.reason}`,
          } as IArticleUpdateResponse;
        }
        updated = mergeResult.article;
      }

      // Clean external URLs - remove tracking params from AI-added links
      // but preserve project's own URL tracking for analytics
      const projectUrl = context?.website_info?.url;
      updated.content = cleanMarkdownUrls(updated.content, projectUrl);

      // Enforce unique path if present using provided context website_info and optional plan
      try {
        const known = collectKnownPaths(context?.website_info, context?.plan || context?.plan_paths);
        if (updated.path) updated.path = ensureUniquePath(updated.path, known);
      } catch (e) {
        app.log.warn({ err: e }, 'Failed to ensure unique path');
      }

      const response: IArticleUpdateResponse = {
        article: updated,
        success: true,
        changes_made: [`${mode} applied`],
        tokens_used: tokens,
        cost_usd: usageStats.cost_usd,
        debug: debugInfo ? buildDebugInfo(prompt, debugInfo.model_used, debugInfo.generation_time_ms, rawContent) : undefined,
      };
      app.log.info({ id: updated.id, mode, output_mode: outMode, tokens_used: tokens || 0, cost_usd: usageStats.cost_usd, words: updated.content.split(/\s+/).length }, 'update:done');
      return response;
    } catch (err: any) {
      app.log.error({ err: truncateError(err), mode, message: truncateString(err?.message || '', 500) }, 'update:error');
      reply.code(500);
      return {
        article,
        success: false,
        error: err instanceof Error ? truncateString(err.message, 500) : 'AI update failed',
        error_details: err?.stack ? String(err.stack).split('\n').slice(0, 5).join('\n') : undefined,
      };
    }
  });
}

// (Removed duplicate local patch helpers; see utils/articleUpdate.ts)
