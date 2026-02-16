/**
 * Enhance Handler
 *
 * Enhances article with AI improvements.
 * Returns: update_article operations
 */

import { ActionContext, ActionExecuteResponse, FileOperation } from './types';
import { IApiArticle, IArticle, IWebsiteInfo } from '@blogpostgen/types';
import { getArticleFromContext, buildArticleOperation, updateArticle } from './utils';
import { callAI } from '../services/ai.service';
import { ensureActionConfigForMode } from '../config/action-config';
import { buildUpdatePrompt } from '../utils/prompts';
import { mergeUpdate, MergeResult, parseLinePatches, applyPatches, extractContentText, parseTextReplacements, applyTextReplacements, fixCitationPattern } from '../utils/articleUpdate';
import { cleanMarkdownUrls } from '../utils/url-cleaner';
import { config } from '../config/server-config';
import { loadPipelinesConfig } from '../config/pipelines-config';
import { extractMarkdownContent, needsNormalization } from '../utils/json-content-extractor';
import { randomUUID } from 'crypto';
import { resolveProjectMacros, resolveProjectMacrosInText } from '../utils/variables';
import { ensureNoUnreplacedMacros, requireBrandingColors } from '../utils/guards';
import { countContentStats, buildContentStats } from '../utils/content-stats';

export async function handleEnhance(
  context: ActionContext,
  flags: Record<string, any>,
  log: { info: Function; error: Function; warn: Function }
): Promise<ActionExecuteResponse> {
  const mode = flags.mode || 'improve_seo';

  // Check if batch mode
  if (flags.all && context.articles && context.articles.length > 0) {
    return handleEnhanceBatch(context, flags, log);
  }

  // Single article mode - get article from unified object
  const articleObj = getArticleFromContext(context);
  if (!articleObj?.content) {
    return {
      success: false,
      error: 'Article with content is required for enhancement',
      errorCode: 'MISSING_CONTENT',
      operations: [],
    };
  }

  if (!context.articlePath) {
    return {
      success: false,
      error: 'Article path is required',
      errorCode: 'MISSING_ARTICLE_PATH',
      operations: [],
    };
  }

  // Check last_pipeline against expected value from pipelines.json
  const pipelinesConfig = loadPipelinesConfig();
  const effectivePipelineName = flags.pipelineName || context.pipelineName;
  const pipelineConfig = effectivePipelineName ? pipelinesConfig.pipelines[effectivePipelineName] : null;
  const expectedLastPipeline = pipelineConfig?.articleFilter?.last_pipeline ?? 'generate';

  const currentPipeline = articleObj.last_pipeline || null;
  const isValidPipeline = currentPipeline === expectedLastPipeline;

  if (!isValidPipeline) {
    if (flags.force) {
      // Log warning when bypassing pipeline check with --force
      log.warn({
        path: context.articlePath,
        mode,
        last_pipeline: currentPipeline,
        expected: expectedLastPipeline,
      }, 'enhance:force:bypassing_pipeline_check');
    } else {
      return {
        success: false,
        error: `Article last_pipeline is '${currentPipeline}'. Expected: '${expectedLastPipeline}' (from pipeline '${effectivePipelineName}'). Use --force to override.`,
        errorCode: 'INVALID_LAST_PIPELINE',
        operations: [],
      };
    }
  }

  // Check if action was already applied (unless --force)
  // Return success with skipped=true so pipeline can continue to next action
  if (articleObj.applied_actions?.includes(mode)) {
    if (flags.force) {
      // Log warning when bypassing applied_actions check with --force
      log.warn({
        path: context.articlePath,
        mode,
        applied_actions: articleObj.applied_actions
      }, 'enhance:force:bypassing_applied_actions_check');
    } else {
      log.info({ path: context.articlePath, mode }, 'enhance:skipped (already applied)');
      return {
        success: true,  // Not an error - pipeline should continue
        message: `Skipped '${mode}' (already applied)`,
        skipped: true,  // Signal to CLI this was skipped
        operations: [],  // No changes needed
      };
    }
  }

  // Normalize JSON content if needed (fix articles with JSON in index.md)
  let normalizedContent = articleObj.content;
  let normalizedMeta = articleObj;
  if (normalizedContent && needsNormalization(normalizedContent)) {
    log.info({ path: context.articlePath }, 'enhance:normalizing_json_content');

    const extraction = extractMarkdownContent(normalizedContent, normalizedContent, log);

    if (extraction.success) {
      // Replace content with normalized version
      normalizedContent = extraction.content;

      // Merge extracted metadata (only if not already set)
      if (extraction.metadata) {
        normalizedMeta = {
          ...articleObj,
          content: normalizedContent,
          title: extraction.metadata.title || articleObj.title || '',
          description: extraction.metadata.description || articleObj.description || '',
          keywords: extraction.metadata.keywords || articleObj.keywords || [],
        };
      }

      log.info({
        strategy: extraction.strategy,
        contentLength: extraction.content.length
      }, 'enhance:normalized_json_to_markdown');
    } else {
      // Normalization failed - cannot enhance JSON content
      return {
        success: false,
        error: 'Article content is JSON format and could not be normalized to markdown',
        errorCode: 'JSON_NORMALIZATION_FAILED',
        operations: [],
      };
    }
  }

  // Actions that require website URL in project config
  const ACTIONS_REQUIRING_URL = ['add_content_jsonld', 'add_faq_jsonld'];

  if (ACTIONS_REQUIRING_URL.includes(mode) && !context.projectConfig?.url) {
    throw new Error(
      `Action '${mode}' requires a website URL. ` +
      `Please add "url" field to your project's index.json. ` +
      `Example: "url": "${context.projectName || 'example.com'}"`
    );
  }

  // Build article object for prompt builder
  const articlePath = context.articlePath || '';
  const article: IApiArticle = {
    id: `article-${randomUUID()}`,
    path: articlePath,
    title: normalizedMeta.title || 'Untitled',
    description: normalizedMeta.description || '',
    keywords: Array.isArray(normalizedMeta.keywords)
      ? normalizedMeta.keywords.join(', ')
      : (normalizedMeta.keywords as any) || '',
    content: normalizedContent || '',
  };

  // Normalize URL: add https:// if not present (supports both "example.com" and "https://example.com")
  const normalizeUrl = (url: string | undefined): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `https://${url}`;
  };

  // Build website info (projectConfig is optional)
  const websiteInfo: IWebsiteInfo = {
    url: normalizeUrl(context.projectConfig?.url),
    title: context.projectConfig?.title || context.projectName || 'Untitled',
    description: '',
    focus_keywords: '',
    focus_instruction: '',
  };

  // Track prompt for history/debugging (set when AI is called)
  let prompt: string | undefined;

  try {
    // Guard add_links - requires related_articles context (run via interlinking pipeline)
    if (mode === 'add_links') {
      const relatedArticles = (context as any)?.related_articles;
      if (!relatedArticles || relatedArticles.length === 0) {
        return {
          success: false,
          error: 'add_links requires related_articles context. Use the interlinking pipeline separately.',
          errorCode: 'MISSING_CONTEXT',
          operations: [],
        };
      }
    }

    // Guard add_internal_links - requires sitemap_xml from CLI (passed via flags)
    const sitemapXml = flags.sitemap_xml || context.sitemap_xml;
    if (mode === 'add_internal_links') {
      if (!sitemapXml) {
        return {
          success: false,
          error: 'add_internal_links requires sitemap_xml. Ensure project has a valid URL with /sitemap.xml.',
          errorCode: 'MISSING_SITEMAP',
          operations: [],
        };
      }
    }

    const cfg = ensureActionConfigForMode(mode as any);
    const outMode = cfg?.output_mode || 'text_replace_all';

    // Dispatch to per-action handler if one exists
    const { hasActionHandler, getActionHandler } = await import('./actions');
    if (hasActionHandler(mode)) {
      log.info({ path: context.articlePath, mode }, 'enhance:action_handler');
      const handler = await getActionHandler(mode);
      return handler!({ article, articleObj: articleObj!, normalizedMeta, context, flags, cfg, log });
    }

    // Guard: config says local but no handler file found
    if (cfg?.local) {
      return { success: false, error: `Action '${mode}' is marked local but has no handler file`, errorCode: 'MISSING_HANDLER', operations: [] };
    }

    // For add_faq_jsonld: skip if no FAQ content exists
    if (mode === 'add_faq_jsonld' && (!normalizedMeta.faq || !normalizedMeta.faq.trim())) {
      log.info({ path: context.articlePath, mode }, 'add_faq_jsonld:skipped (no faq content)');
      return { success: true, message: 'Skipped add_faq_jsonld (no FAQ content)', skipped: true, operations: [] };
    }

    // Build context with required variables
    const contextForPrompt: Record<string, unknown> = {
      website_info: websiteInfo,
      projectConfig: context.projectConfig,  // For resolving {{project.*}} macros in prompts
    };

    // For improve_seo: get keywords from article's meta
    if (mode === 'improve_seo') {
      contextForPrompt.target_keywords = normalizedMeta.keywords || [];
    }

    // For add_links: pass through related_articles from context
    if (mode === 'add_links') {
      contextForPrompt.related_articles = (context as any)?.related_articles || [];
    }

    // For add_internal_links: parse sitemap and pass links
    if (mode === 'add_internal_links' && sitemapXml) {
      const { parseSitemapForPrompt } = await import('../utils/sitemap-parser');
      const links = parseSitemapForPrompt(sitemapXml, websiteInfo.url || '');
      contextForPrompt.sitemap_links = links;
    }

    // For add_faq_jsonld: pass FAQ content for prompt
    if (mode === 'add_faq_jsonld') {
      contextForPrompt.faq_content = normalizedMeta.faq || '';
    }

    // For add_diagrams: merge server config variables with custom variables from CLI
    // Also resolve {{project.*}} macros in colors from action config
    if (mode === 'add_diagrams') {
      requireBrandingColors(
        (context.projectConfig as any)?.branding?.colors,
        'add_diagrams'
      );
      // Debug: trace projectConfig availability
      const projectConfig = context.projectConfig as unknown as Record<string, unknown>;
      log.info({
        hasProjectConfig: !!projectConfig,
        hasBranding: !!(projectConfig as any)?.branding,
        hasColors: !!(projectConfig as any)?.branding?.colors,
        cfgColors: Object.keys((cfg as any)?.colors || {}),
      }, 'enhance:add_diagrams:projectConfig_check');

      // Resolve colors using project config (e.g., {{project.branding.colors.primary}} -> "#1E40AF")
      const resolvedColors = resolveProjectMacros(
        (cfg as any)?.colors || {},
        projectConfig
      );

      log.info({ resolvedColors }, 'enhance:add_diagrams:resolved_colors');

      const variables = { ...cfg?.variables, ...resolvedColors, ...flags.custom_variables };
      contextForPrompt.variables = variables;
    }

    prompt = buildUpdatePrompt(article, mode, contextForPrompt, outMode);

    const statsBefore = countContentStats(article.content);
    const wordsBefore = statsBefore.words;
    log.info({ path: context.articlePath, mode, output_mode: outMode, words_before: wordsBefore }, 'enhance:start');

    const provider = cfg?.ai_provider || 'openrouter';
    const modelId = cfg?.ai_model_id || (provider === 'openai'
      ? config.ai.defaultModel.replace(/^openai\//, '')
      : config.ai.defaultModel);

    const { content, tokens, rawContent, usageStats } = await callAI(prompt, {
      provider,
      modelId,
      baseUrl: cfg?.ai_base_url,
      webSearch: cfg?.web_search,
      pricing: cfg?.pricing,
    });

    // Handle output modes properly
    let updatedArticle: IApiArticle;
    if (outMode === 'insert_content') {
      const text = extractContentText(content, rawContent);
      const patches = parseLinePatches(text);
      if (patches.length > 0) {
        const patchResult = applyPatches(article.content, patches, {
          validateStructures: true,
          logger: (msg) => log.warn({ mode }, msg),
        });

        // Handle both string and ApplyPatchesResult return types
        const patched = typeof patchResult === 'string' ? patchResult : patchResult.content;

        // Log adjustments if any (patches moved to avoid breaking tables/lists)
        if (typeof patchResult === 'object' && patchResult.adjustments.length > 0) {
          log.warn({ mode, adjustments: patchResult.adjustments }, 'insert_content:patch_adjustments');
        }

        updatedArticle = { ...article, content: patched };
      } else {
        const mergeResult = mergeUpdate(article, mode, content, rawContent);
        if (mergeResult.rejected) {
          log.error({ path: context.articlePath, mode, reason: mergeResult.reason }, 'enhance:merge_rejected');
          return {
            success: false,
            error: `Enhancement ${mode} failed: ${mergeResult.reason}`,
            operations: [],
          };
        }
        updatedArticle = mergeResult.article;
      }
    } else if (outMode === 'insert_content_top') {
      const text = extractContentText(content, rawContent);
      const sep = article.content.startsWith('\n') || text.endsWith('\n') ? '' : '\n';
      updatedArticle = { ...article, content: `${text}${sep}${article.content}` };
    } else if (outMode === 'insert_content_bottom') {
      const text = extractContentText(content, rawContent);

      // Special handling for add_faq, add_content_jsonld, add_faq_jsonld: store in meta instead of content
      if (mode === 'add_faq') {
        // Store FAQ HTML in article.faq (unified object)
        const updatedArticleObj = updateArticle(normalizedMeta, {
          faq: text,
        });

        const contentStats = buildContentStats(statsBefore, countContentStats(article.content));

        log.info({
          path: context.articlePath,
          mode,
          tokens,
          cost_usd: usageStats.cost_usd,
          words: contentStats.words_after,
        }, 'enhance:done (faq stored in meta)');

        return {
          success: true,
          message: `Added FAQ section (stored separately, ${contentStats.words_after} words in article)`,
          tokensUsed: tokens,
          costUsd: usageStats.cost_usd,
          contentStats,
          prompt,
          rawResponse: rawContent,
          operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
          requireChanges: cfg?.require_changes,
        };
      }

      if (mode === 'add_content_jsonld') {
        // Store content JSON-LD in article.content_jsonld (unified object)
        const updatedArticleObj = updateArticle(normalizedMeta, {
          content_jsonld: text,
        });

        const contentStats = buildContentStats(statsBefore, countContentStats(article.content));

        log.info({
          path: context.articlePath,
          mode,
          tokens,
          cost_usd: usageStats.cost_usd,
          words: contentStats.words_after,
        }, 'enhance:done (content_jsonld stored in meta)');

        return {
          success: true,
          message: `Added content JSON-LD schema (stored separately, ${contentStats.words_after} words in article)`,
          tokensUsed: tokens,
          costUsd: usageStats.cost_usd,
          contentStats,
          prompt,
          rawResponse: rawContent,
          operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
          requireChanges: cfg?.require_changes,
        };
      }

      if (mode === 'add_faq_jsonld') {
        // Store FAQ JSON-LD in article.faq_jsonld (unified object)
        const updatedArticleObj = updateArticle(normalizedMeta, {
          faq_jsonld: text,
        });

        const contentStats = buildContentStats(statsBefore, countContentStats(article.content));

        log.info({
          path: context.articlePath,
          mode,
          tokens,
          cost_usd: usageStats.cost_usd,
          words: contentStats.words_after,
        }, 'enhance:done (faq_jsonld stored in meta)');

        return {
          success: true,
          message: `Added FAQ JSON-LD schema (stored separately, ${contentStats.words_after} words in article)`,
          tokensUsed: tokens,
          costUsd: usageStats.cost_usd,
          contentStats,
          prompt,
          rawResponse: rawContent,
          operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
          requireChanges: cfg?.require_changes,
        };
      }

      // Default insert_content_bottom behavior for other modes
      const sep = article.content.endsWith('\n') || text.startsWith('\n') ? '' : '\n';
      updatedArticle = { ...article, content: `${article.content}${sep}${text}` };
    } else if (outMode === 'text_replace') {
      // Text replacement mode: AI returns { replacements: [{find, replace}] }
      let replacements = parseTextReplacements(content);

      // Fix OpenAI search model citation format for external links
      // Converts "text. ([domain](url))" to "[text](url)."
      if (mode === 'add_external_links') {
        replacements = replacements.map(r => ({
          ...r,
          replace: fixCitationPattern(r.replace)
        }));

      }

      if (replacements.length > 0) {
        const { result, applied, skipped } = applyTextReplacements(article.content, replacements);

        // Safety guard: reject if content shrunk by more than 30%
        const shrinkage = 1 - (result.length / article.content.length);
        if (shrinkage > 0.3) {
          log.error({ mode, shrinkagePct: Math.round(shrinkage * 100) },
            'text_replace:content_shrunk_>30%, preserving original');
          updatedArticle = article;
        } else {
          updatedArticle = { ...article, content: result };
        }

        if (skipped.length > 0) {
          log.warn({ mode, skipped }, 'text_replace:some_replacements_not_found');
        }
        log.info({ mode, total: replacements.length, applied, skipped: skipped.length }, 'text_replace:applied');
      } else {
        // No replacements found - preserve original article (do NOT call mergeUpdate which destroys content)
        log.warn({ mode }, 'text_replace:no_replacements_found, preserving original article');
        updatedArticle = article;
      }
    } else {
      const mergeResult = mergeUpdate(article, mode, content, rawContent);
      if (mergeResult.rejected) {
        log.error({ path: context.articlePath, mode, reason: mergeResult.reason }, 'enhance:merge_rejected');
        return {
          success: false,
          error: `Enhancement ${mode} failed: ${mergeResult.reason}`,
          operations: [],
        };
      }
      updatedArticle = mergeResult.article;
    }

    // Clean external URLs - remove tracking params from AI-added links
    // but preserve project's own URL tracking for analytics
    const projectUrl = websiteInfo?.url;
    updatedArticle.content = cleanMarkdownUrls(updatedArticle.content, projectUrl);

    // Build updated article (unified object)
    // Note: last_pipeline stays 'generate' until the full enhance pipeline completes
    // The CLI will set last_pipeline: 'enhance' after all actions in the pipeline succeed
    // For create_meta mode, include extracted metadata fields
    const metaUpdates: Partial<IArticle> = {
      content: updatedArticle.content,
    };

    // For create_meta mode, copy extracted metadata from updatedArticle
    if (mode === 'create_meta') {
      if (updatedArticle.title) metaUpdates.title = updatedArticle.title;
      if (updatedArticle.description) metaUpdates.description = updatedArticle.description;
      if (updatedArticle.keywords) {
        // Convert comma-separated string back to array if needed
        metaUpdates.keywords = typeof updatedArticle.keywords === 'string'
          ? updatedArticle.keywords.split(',').map(k => k.trim()).filter(k => k)
          : updatedArticle.keywords as any;
      }
    }

    const updatedArticleObj = updateArticle(normalizedMeta, metaUpdates);

    const statsAfter = countContentStats(updatedArticle.content);
    const contentStats = buildContentStats(statsBefore, statsAfter);

    log.info({
      path: context.articlePath,
      mode,
      tokens,
      cost_usd: usageStats.cost_usd,
      words_before: contentStats.words_before,
      words_after: contentStats.words_after,
      word_delta: contentStats.word_delta,
      word_delta_pct: contentStats.word_delta_pct,
    }, 'enhance:done');

    return {
      success: true,
      message: `Enhanced article with ${mode} (${statsAfter.words} words)`,
      tokensUsed: tokens,
      costUsd: usageStats.cost_usd,
      contentStats,
      prompt,  // Include for history tracking
      rawResponse: rawContent,
      operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
      requireChanges: cfg?.require_changes,
    };
  } catch (err: any) {
    log.error({ err, path: context.articlePath, mode, message: err?.message }, 'enhance:error');
    return {
      success: false,
      error: `Enhancement failed: ${err.message}`,
      errorCode: 'ENHANCEMENT_FAILED',
      prompt,  // Include for debugging failed calls
      operations: [],
    };
  }
}

/**
 * Handle batch enhancement for multiple articles
 */
async function handleEnhanceBatch(
  context: ActionContext,
  flags: Record<string, any>,
  log: { info: Function; error: Function; warn: Function }
): Promise<ActionExecuteResponse> {
  const articles = context.articles || [];
  const limit = flags.limit || 0;
  const mode = flags.mode || 'improve_seo';

  // Filter to articles ready for enhancement using config-driven expected value
  const pipelinesConfig = loadPipelinesConfig();
  const effectivePipelineName = flags.pipelineName || context.pipelineName;
  const pipelineConfig = effectivePipelineName ? pipelinesConfig.pipelines[effectivePipelineName] : null;
  const expectedLP = pipelineConfig?.articleFilter?.last_pipeline ?? 'generate';

  const eligibleArticles = articles.filter((a) => {
    const lp = a.article.last_pipeline ?? null;
    return lp === expectedLP;
  });

  if (eligibleArticles.length === 0) {
    return {
      success: true,
      message: `No articles ready for enhancement (need last_pipeline: '${expectedLP}' for pipeline '${effectivePipelineName}').`,
      operations: [],
      batch: { total: 0, processed: 0, errors: [] },
    };
  }

  // Sort by created_at (oldest first - FIFO)
  const sortedArticles = [...eligibleArticles].sort((a, b) => {
    const dateA = new Date(a.article.created_at || 0).getTime();
    const dateB = new Date(b.article.created_at || 0).getTime();
    return dateA - dateB;
  });

  const toProcess = limit > 0 ? sortedArticles.slice(0, limit) : sortedArticles;

  log.info({ total: toProcess.length, mode, limit }, 'enhance:batch:start');

  const operations: FileOperation[] = [];
  const errors: Array<{ path: string; error: string }> = [];
  let totalTokens = 0;
  let totalCost = 0;

  for (const batchArticle of toProcess) {
    const articleContext: ActionContext = {
      ...context,
      articlePath: batchArticle.path,
      article: batchArticle.article,
    };

    const result = await handleEnhance(articleContext, flags, log);

    if (result.success) {
      operations.push(...result.operations);
      totalTokens += result.tokensUsed || 0;
      totalCost += result.costUsd || 0;
    } else {
      errors.push({ path: batchArticle.path, error: result.error || 'Unknown error' });
    }
  }

  return {
    success: operations.length > 0 || errors.length === 0,
    message: `Enhanced ${operations.length}/${toProcess.length} article(s) with ${mode}`,
    tokensUsed: totalTokens,
    costUsd: totalCost,
    operations,
    batch: {
      total: toProcess.length,
      processed: operations.length,
      errors,
    },
  };
}
