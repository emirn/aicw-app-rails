/**
 * Plan Import Handler
 *
 * Parses free-form text content plan into structured article briefs.
 * Processes in batches by splitting on '---' separator.
 * Returns: create_article operations (and optionally create_project)
 */

import { ActionContext, ActionExecuteResponse, FileOperation } from './types';
import { IArticle, IContentPlan, IContentPlanItem } from '@blogpostgen/types';
import { buildCreateArticleOperation } from './utils';
import { callAI } from '../services/ai.service';
import { ensureActionConfigForMode } from '../config/action-config';
import { renderTemplateAbsolutePath } from '../utils/template';
import { IProjectConfig } from '@blogpostgen/types';
import { generatePathFromTitle } from '../utils/articleUpdate';

/**
 * Normalize path - preserves path structure (slashes)
 * - Removes leading/trailing slashes
 * - Converts spaces and special chars to hyphens (but keeps /)
 * - Lowercases
 * - Handles both `/category/article-name` and plain `article-name` formats
 */
function normalizePath(input: string): string {
  return input
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')           // Remove leading/trailing slashes
    .replace(/\/+/g, '/')                 // Collapse multiple slashes
    .split('/')                           // Split by path segments
    .map(segment =>
      segment
        .replace(/[^a-z0-9]+/g, '-')      // Replace non-alphanum with hyphen
        .replace(/^-|-$/g, '')            // Remove leading/trailing hyphens
        .slice(0, 60)                     // Limit segment length
    )
    .filter(s => s.length > 0)            // Remove empty segments
    .join('/');                           // Rejoin with slashes
}

/**
 * Split plan text into chunks by '---' separator
 * Trims whitespace and filters empty chunks
 */
function splitPlanIntoChunks(planText: string): string[] {
  return planText
    .split(/^---$/m)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

/**
 * Process a single chunk of plan text
 */
async function processChunk(
  chunkText: string,
  chunkIndex: number,
  totalChunks: number,
  projectConfig: IProjectConfig,
  cfg: any,
  log: { info: Function; error: Function; warn: Function }
): Promise<{
  items: IContentPlanItem[];
  tokens: number;
  cost: number;
}> {
  const vars = {
    website_title: projectConfig.title || '',
    website_url: projectConfig.url || '',
    plan_text: chunkText,
  };

  log.info({
    chunk: chunkIndex + 1,
    totalChunks,
    chunkLength: chunkText.length,
  }, 'plan-import:chunk:start');

  const prompt = renderTemplateAbsolutePath(cfg.template, vars);
  const { content, tokens, usageStats } = await callAI(prompt, {
    provider: cfg.ai_provider || 'openrouter',
    modelId: cfg.ai_model_id || 'openai/gpt-4o',
    baseUrl: cfg.ai_base_url,
    pricing: cfg.pricing,
  });

  if (typeof content !== 'object' || !content.items) {
    throw new Error(`AI returned invalid plan structure for chunk ${chunkIndex + 1}`);
  }

  log.info({
    chunk: chunkIndex + 1,
    items: content.items.length,
    tokens,
    cost_usd: usageStats.cost_usd,
  }, 'plan-import:chunk:done');

  return {
    items: content.items || [],
    tokens,
    cost: usageStats.cost_usd,
  };
}

export async function handlePlanImport(
  context: ActionContext,
  flags: Record<string, any>,
  log: { info: Function; error: Function; warn: Function }
): Promise<ActionExecuteResponse> {
  // Require planText
  if (!context.planText || context.planText.trim().length === 0) {
    return {
      success: false,
      error: 'Plan text is required for plan-import. Provide --file or --clipboard.',
      errorCode: 'MISSING_PLAN_TEXT',
      operations: [],
    };
  }

  // Require project config (project must exist)
  if (!context.projectConfig) {
    return {
      success: false,
      error: 'Project config is required. The project must already exist.',
      errorCode: 'MISSING_PROJECT_CONFIG',
      operations: [],
    };
  }

  const projectConfig = context.projectConfig;

  try {
    const cfg = ensureActionConfigForMode('parse_plan');

    // Split plan into chunks by '---' separator
    const chunks = splitPlanIntoChunks(context.planText);

    log.info({
      project: context.projectName,
      planTextLength: context.planText.length,
      chunks: chunks.length,
    }, 'plan-import:start');

    // Process chunks in parallel batches for better performance
    // BATCH_SIZE controls concurrency to avoid rate limits
    const BATCH_SIZE = 5;
    const allItems: IContentPlanItem[] = [];
    let totalTokens = 0;
    let totalCost = 0;
    const errors: string[] = [];

    for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, chunks.length);
      const batch = chunks.slice(batchStart, batchEnd);

      log.info({
        batch: Math.floor(batchStart / BATCH_SIZE) + 1,
        totalBatches: Math.ceil(chunks.length / BATCH_SIZE),
        chunksInBatch: batch.length,
      }, 'plan-import:batch:start');

      // Process batch chunks in parallel
      const batchResults = await Promise.allSettled(
        batch.map((chunk, j) =>
          processChunk(
            chunk,
            batchStart + j,
            chunks.length,
            projectConfig,
            cfg,
            log
          )
        )
      );

      // Collect results from batch
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          allItems.push(...result.value.items);
          totalTokens += result.value.tokens;
          totalCost += result.value.cost;
        } else {
          const errorMsg = `Chunk ${batchStart + j + 1}: ${result.reason?.message || 'Unknown error'}`;
          errors.push(errorMsg);
          log.error({ chunk: batchStart + j + 1, error: result.reason?.message }, 'plan-import:chunk:error');
        }
      }
    }

    log.info({
      totalItems: allItems.length,
      totalTokens,
      totalCost,
      errors: errors.length,
    }, 'plan-import:parsed');

    // Build file operations
    const operations: FileOperation[] = [];

    // Create article operations for each plan item
    const now = new Date().toISOString();
    for (const item of allItems) {
      // Use provided path if available, otherwise generate SEO-optimized path from title
      const articlePath = item.path ? normalizePath(item.path) : generatePathFromTitle(item.title);

      const meta: IArticle = {
        title: item.title,
        description: item.description,
        keywords: Array.isArray(item.target_keywords)
          ? item.target_keywords
          : [],
        // No last_pipeline = seed article (ready for generate pipeline)
        version: 0,
        created_at: now,
        updated_at: now,
        reviewed_by: [],
      };

      // Brief content for index.md (no H1 title - title is in meta.md)
      const briefContent = [
        '## Must Cover',
        item.notes
          ? `${item.notes}`
          : '<!-- Add specific topics that MUST be included -->',
        '',
        '## Description',
        item.description || '<!-- Add article description -->',
        '',
        '## Notes',
        '<!-- Add any additional notes or requirements -->',
        '',
      ].join('\n');

      // Use unified article object pattern
      operations.push(buildCreateArticleOperation(articlePath, { ...meta, content: briefContent }));
    }

    const message = errors.length > 0
      ? `Imported ${allItems.length} article(s) from content plan (${errors.length} chunk errors)`
      : `Imported ${allItems.length} article(s) from content plan`;

    return {
      success: allItems.length > 0 || errors.length === 0,
      message,
      tokensUsed: totalTokens,
      costUsd: totalCost,
      operations,
      batch: {
        total: chunks.length,
        processed: chunks.length - errors.length,
        errors: errors.map((e) => ({ path: 'chunk', error: e })),
      },
    };
  } catch (err: any) {
    log.error({ err, message: err?.message }, 'plan-import:error');
    return {
      success: false,
      error: `Plan import failed: ${err.message}`,
      errorCode: 'PLAN_IMPORT_FAILED',
      operations: [],
    };
  }
}
