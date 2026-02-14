/**
 * Generate Handler
 *
 * Generates article content from brief.
 * Returns: update_article operations
 */

import { ActionContext, ActionExecuteResponse, FileOperation } from './types';
import { IArticle, IWebsiteInfo } from '@blogpostgen/types';
import { getArticleFromContext, buildArticleOperation, updateArticle } from './utils';
import { callAI } from '../services/ai.service';
import { ACTION_CONFIG } from '../config/action-config';
import { buildArticlePrompt } from '../utils/prompts';
import { collectKnownPaths, ensureUniquePath } from '../utils/article-path';
import { generatePathFromTitle } from '../utils/articleUpdate';
import { config } from '../config/server-config';
import { randomUUID } from 'crypto';
import { stripDuplicateTitleH1 } from '../utils/content';
import { extractMarkdownContent } from '../utils/json-content-extractor';
import { truncateError, truncateString } from '../utils/log-truncate';

export async function handleGenerate(
  context: ActionContext,
  flags: Record<string, any>,
  log: { info: Function; error: Function; warn: Function }
): Promise<ActionExecuteResponse> {
  // Check if batch mode
  if (flags.all && context.articles && context.articles.length > 0) {
    return handleGenerateBatch(context, flags, log);
  }

  // Single article mode - get article from unified object
  const article = getArticleFromContext(context);
  if (!article?.content) {
    return {
      success: false,
      error: 'Article with content (brief) is required for article generation',
      errorCode: 'MISSING_BRIEF',
      operations: [],
    };
  }

  // Validate promptParts is provided and customized
  if (!context.promptParts?.project_requirements) {
    return {
      success: false,
      error: 'promptParts.project_requirements is required. Load from project prompts/write_draft/requirements.md file.',
      errorCode: 'MISSING_PROMPT_PARTS',
      operations: [],
    };
  }

  if (context.promptParts.project_requirements.includes('CUSTOMIZE_THIS_TEMPLATE_AND_REMOVE_THIS_TAG')) {
    return {
      success: false,
      error: 'Project requirements have not been customized. Please edit prompts/write_draft/requirements.md and remove the DEFAULT_TEMPLATE marker.',
      errorCode: 'UNCUSTOMIZED_PROMPT_PARTS',
      operations: [],
    };
  }

  const cleanedRequirements = context.promptParts.project_requirements.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (cleanedRequirements.length < 50) {
    return {
      success: false,
      error: 'Project requirements appear empty or too short. Please add meaningful content to prompts/write_draft/prompt.md.',
      errorCode: 'EMPTY_PROMPT_PARTS',
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

  // Check last_pipeline - only seed articles (null/missing last_pipeline) can be generated
  if (article.last_pipeline) {
    return {
      success: false,
      error: `Article already processed by pipeline '${article.last_pipeline}'. Only seed articles (no last_pipeline) can be generated.`,
      errorCode: 'ALREADY_PROCESSED',
      operations: [],
    };
  }

  const briefContent = article.content || '';
  const targetWords = article.target_words || flags.words || 2000;

  // Build website info from project config (optional) with fallbacks
  const websiteInfo: IWebsiteInfo = {
    url: context.projectConfig?.url || '',
    title: context.projectConfig?.title || context.projectName || 'Untitled',
    description: '',
    focus_keywords: '',
    focus_instruction: '',
  };

  // Track prompt for history/debugging
  let prompt: string | undefined;

  try {
    // Pass custom prompt template and custom content if provided (from project's config/actions/write_draft/)
    const customTemplate = context.promptParts?.custom_prompt_template;
    const customContent = context.promptParts?.custom_content;
    prompt = buildArticlePrompt(briefContent, websiteInfo, context.promptParts!, article, customTemplate, customContent, context.articlePath);
    const genCfg = ACTION_CONFIG['write_draft'];
    const provider = genCfg?.ai_provider || 'openrouter';
    const modelId = genCfg?.ai_model_id || (provider === 'openai'
      ? config.ai.defaultModel.replace(/^openai\//, '')
      : config.ai.defaultModel);

    log.info({ path: context.articlePath, words: targetWords, provider, modelId }, 'generate:start');
    const { content, tokens, rawContent, usageStats } = await callAI(prompt, {
      provider,
      modelId,
      baseUrl: genCfg?.ai_base_url,
    });

    // Debug: Log content type and structure
    log.info({
      contentType: typeof content,
      isObject: typeof content === 'object',
      hasContentField: typeof content === 'object' && content !== null && 'content' in content,
      rawContentPreview: rawContent.substring(0, 200)
    }, 'generate:ai_response_debug');

    // Use shared multi-strategy extractor
    const extraction = extractMarkdownContent(content, rawContent, log);

    let generatedContent: string;
    let generatedTitle: string;
    let generatedPath: string;
    let generatedDescription: string | undefined;
    let generatedKeywords: string | string[] | undefined;

    if (extraction.success) {
      generatedContent = extraction.content;
      generatedTitle = extraction.metadata?.title || article.title || 'Untitled';
      generatedPath = extraction.metadata?.path || '';
      generatedDescription = extraction.metadata?.description;
      generatedKeywords = extraction.metadata?.keywords;
      log.info({
        strategy: extraction.strategy,
        contentLength: generatedContent.length,
        hasMetadata: !!extraction.metadata,
        warning: extraction.warning,
      }, 'generate:extraction_success');

      // Quality validation: word count check
      const wordCount = generatedContent.split(/\s+/).filter(w => w.length > 0).length;
      const minWords = Math.floor(targetWords * 0.5);
      if (wordCount < minWords) {
        log.error({
          wordCount,
          targetWords,
          minWords,
          strategy: extraction.strategy,
        }, 'generate:content_too_short');
        return {
          success: false,
          error: `Generated content too short: ${wordCount} words (minimum: ${minWords}, target: ${targetWords}). AI response may have been truncated.`,
          errorCode: 'CONTENT_TOO_SHORT',
          prompt,
          operations: [],
        };
      }

      // Quality validation: truncation detection
      const trimmedContent = generatedContent.trimEnd();
      const lastChar = trimmedContent[trimmedContent.length - 1];
      if (lastChar && !/[.!?:)\]"'\n#*-]/.test(lastChar)) {
        log.error({
          lastChar,
          contentEnd: trimmedContent.substring(Math.max(0, trimmedContent.length - 100)),
          strategy: extraction.strategy,
        }, 'generate:content_truncated');
        return {
          success: false,
          error: `Generated content appears truncated (ends with "${lastChar}" instead of sentence-ending punctuation). AI response may have been cut off.`,
          errorCode: 'CONTENT_TRUNCATED',
          prompt,
          operations: [],
        };
      }
    } else {
      // All extraction strategies failed - this is a FAILURE, not a fallback
      // The article content is likely truncated JSON that cannot be recovered
      log.error({
        strategy: 'all_failed',
        rawContentPreview: rawContent.substring(0, 500),
        rawContentEnd: rawContent.substring(Math.max(0, rawContent.length - 200)),
      }, 'generate:extraction_failed_content_truncated');

      // Return failure - do NOT save corrupt content to index.md
      return {
        success: false,
        error: 'Content extraction failed. AI response may have been truncated. Try regenerating with higher token limit.',
        errorCode: 'CONTENT_EXTRACTION_FAILED',
        prompt,
        operations: [],
      };
    }

    // Strip duplicate H1 title from content if it matches the article title
    generatedContent = stripDuplicateTitleH1(generatedContent, generatedTitle);

    // Ensure path
    const known = collectKnownPaths(websiteInfo);
    if (!generatedPath) {
      generatedPath = generatePathFromTitle(generatedTitle);
    }
    generatedPath = ensureUniquePath(generatedPath, known);

    // Normalize keywords to array if string
    let keywordsArray: string[] | undefined;
    if (generatedKeywords) {
      if (Array.isArray(generatedKeywords)) {
        keywordsArray = generatedKeywords;
      } else if (typeof generatedKeywords === 'string') {
        keywordsArray = (generatedKeywords as string).split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
      }
    }

    // Build updated article with AI-generated fields (unified object)
    // Note: last_pipeline is NOT set here — the CLI will set last_pipeline: 'generate'
    // after all actions in the pipeline succeed (matching the enhance.ts pattern)
    const updatedArticle = updateArticle(article, {
      content: generatedContent,
      title: generatedTitle,
      description: generatedDescription || article.description,
      keywords: keywordsArray || article.keywords || [],
    });

    log.info({ path: context.articlePath, words: generatedContent.split(/\s+/).length, tokens, cost_usd: usageStats.cost_usd }, 'generate:done');

    return {
      success: true,
      message: `Generated article: ${generatedTitle} (${generatedContent.split(/\s+/).length} words)`,
      tokensUsed: tokens,
      costUsd: usageStats.cost_usd,
      prompt,  // Include for history tracking
      rawResponse: flags.debug ? rawContent : undefined,  // Include raw AI response when debug flag set
      operations: [buildArticleOperation(context.articlePath!, updatedArticle)],
    };
  } catch (err: any) {
    log.error({ err: truncateError(err), path: context.articlePath, message: truncateString(err?.message || '', 500) }, 'generate:error');
    return {
      success: false,
      error: `Article generation failed: ${truncateString(err?.message || 'Unknown error', 500)}`,
      errorCode: 'GENERATION_FAILED',
      prompt,  // Include for debugging failed calls
      operations: [],
    };
  }
}

/**
 * Handle batch generation for multiple articles
 */
async function handleGenerateBatch(
  context: ActionContext,
  flags: Record<string, any>,
  log: { info: Function; error: Function; warn: Function }
): Promise<ActionExecuteResponse> {
  const articles = context.articles || [];
  const limit = flags.limit || 0;

  // Filter to seed articles (no last_pipeline set)
  const eligibleArticles = articles.filter((a) => !a.article.last_pipeline);

  if (eligibleArticles.length === 0) {
    return {
      success: true,
      message: 'No seed articles found (all articles have last_pipeline set)',
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

  log.info({ total: toProcess.length, limit }, 'generate:batch:start');

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

    const result = await handleGenerate(articleContext, flags, log);

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
    message: `Generated ${operations.length}/${toProcess.length} article(s)`,
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
