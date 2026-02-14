/**
 * add_external_links action handler
 *
 * Safe link insertion: LLM returns anchor_text + URL pairs,
 * code wraps the anchor text with the link. Content destruction is
 * structurally impossible because only small phrases are modified.
 */

import { ActionHandlerFn } from './types';
import { buildArticleOperation, updateArticle } from '../utils';
import { callAI } from '../../services/ai.service';
import { config } from '../../config/server-config';
import { parseLinkInsertions, applyLinkInsertions } from '../../utils/articleUpdate';
import { cleanMarkdownUrls } from '../../utils/url-cleaner';
import { join } from 'path';

export const handle: ActionHandlerFn = async ({ article, normalizedMeta, context, flags, cfg, log }) => {
  const mode = 'add_external_links';

  // 1. Load and render prompt template
  const { renderTemplateAbsolutePath } = await import('../../utils/template');
  const promptPath = join(__dirname, '..', '..', '..', 'config', 'actions', 'add_external_links', 'prompt.md');
  const prompt = renderTemplateAbsolutePath(promptPath, { content: article.content });

  // 2. Call AI
  const provider = cfg?.ai_provider || 'openrouter';
  const modelId = cfg?.ai_model_id || (provider === 'openai'
    ? config.ai.defaultModel.replace(/^openai\//, '')
    : config.ai.defaultModel);

  log.info({ path: context.articlePath, mode }, 'enhance:add_external_links:start');

  const { content, tokens, rawContent, usageStats } = await callAI(prompt, {
    provider,
    modelId,
    baseUrl: cfg?.ai_base_url,
    webSearch: cfg?.web_search,
    pricing: cfg?.pricing,
  });

  // 3. Parse response as link insertions
  let links = parseLinkInsertions(content);

  if (links.length === 0) {
    log.warn({ mode, rawContentLength: rawContent?.length }, 'add_external_links:no_links_parsed');
    const updatedArticleObj = updateArticle(normalizedMeta, {
      content: article.content,
    });
    return {
      success: true,
      message: 'No external links found to insert',
      tokensUsed: tokens,
      costUsd: usageStats.cost_usd,
      prompt,
      rawResponse: flags.debug ? rawContent : undefined,
      operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
    };
  }

  // 4. Deduplicate URLs (simple Set-based check)
  const seenUrls = new Set<string>();
  const deduped: typeof links = [];
  const removedDups: string[] = [];
  for (const link of links) {
    if (seenUrls.has(link.url)) {
      removedDups.push(`Duplicate URL "${link.url}" for anchor "${link.anchor_text.substring(0, 40)}"`);
    } else {
      seenUrls.add(link.url);
      deduped.push(link);
    }
  }
  if (removedDups.length > 0) {
    log.warn({ mode, removed: removedDups }, 'add_external_links:duplicate_urls_removed');
  }
  links = deduped;

  // 5. Apply link insertions
  const { result, applied, skipped } = applyLinkInsertions(article.content, links);

  if (skipped.length > 0) {
    log.warn({ mode, skipped }, 'link_insert:some_links_not_applied');
  }
  log.info({ mode, total: links.length, applied, skipped: skipped.length }, 'link_insert:applied');

  // 6. Clean URLs (remove tracking params)
  const projectUrl = context.projectConfig?.url;
  const normalizeUrl = (url: string | undefined): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `https://${url}`;
  };
  const cleanedContent = cleanMarkdownUrls(result, normalizeUrl(projectUrl));

  // 7. Build updated article
  const updatedArticleObj = updateArticle(normalizedMeta, {
    content: cleanedContent,
  });

  const wordCount = cleanedContent.split(/\s+/).length;
  log.info({
    path: context.articlePath,
    mode,
    tokens,
    cost_usd: usageStats.cost_usd,
    words: wordCount,
    links_applied: applied,
  }, 'enhance:add_external_links:done');

  return {
    success: true,
    message: `Added ${applied} external link(s) (${wordCount} words)`,
    tokensUsed: tokens,
    costUsd: usageStats.cost_usd,
    prompt,
    rawResponse: flags.debug ? rawContent : undefined,
    operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
  };
};
