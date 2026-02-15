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
import { countContentStats, buildContentStats } from '../../utils/content-stats';
import { join } from 'path';
import { readFileSync } from 'fs';

interface AllowedDomainsConfig {
  domains: string[];
  patterns: string[];
}

function parseAllowedDomains(content: string): AllowedDomainsConfig {
  const domains: string[] = [];
  const patterns: string[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('*')) patterns.push(line);
    else domains.push(line);
  }
  return { domains, patterns };
}

function loadAllowedDomains(flagsContent?: string): AllowedDomainsConfig {
  if (flagsContent) {
    return parseAllowedDomains(flagsContent);
  }
  const configPath = join(__dirname, '..', '..', '..', 'config', 'actions', 'add_external_links', 'domains.txt');
  return parseAllowedDomains(readFileSync(configPath, 'utf8'));
}

function isDomainAllowed(url: string, allowedDomains: string[], patterns: string[]): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    if (allowedDomains.some(d => hostname === d || hostname.endsWith('.' + d))) return true;
    for (const p of patterns) {
      const suffix = p.replace('*', '');
      if (hostname.endsWith(suffix)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function computeTargetLinks(wordCount: number): string {
  if (wordCount < 1000) return '2-4';
  if (wordCount < 2000) return '4-7';
  if (wordCount < 3000) return '6-10';
  return '8-12';
}

export const handle: ActionHandlerFn = async ({ article, normalizedMeta, context, flags, cfg, log }) => {
  const mode = 'add_external_links';
  const statsBefore = countContentStats(article.content);

  // 1. Compute dynamic target link count based on article length
  const targetLinks = computeTargetLinks(statsBefore.words);

  // 2. Load and render prompt template with dynamic target
  const { renderTemplateAbsolutePath } = await import('../../utils/template');
  const promptPath = join(__dirname, '..', '..', '..', 'config', 'actions', 'add_external_links', 'prompt.md');
  const prompt = renderTemplateAbsolutePath(promptPath, { content: article.content, target_links: targetLinks });

  // 3. Call AI
  const provider = cfg?.ai_provider || 'openrouter';
  const modelId = cfg?.ai_model_id || (provider === 'openai'
    ? config.ai.defaultModel.replace(/^openai\//, '')
    : config.ai.defaultModel);

  log.info({ path: context.articlePath, mode, target_links: targetLinks, words: statsBefore.words }, 'enhance:add_external_links:start');

  const { content, tokens, rawContent, usageStats } = await callAI(prompt, {
    provider,
    modelId,
    baseUrl: cfg?.ai_base_url,
    webSearch: cfg?.web_search,
    pricing: cfg?.pricing,
  });

  // 4. Parse response as link insertions
  let links = parseLinkInsertions(content);

  if (links.length === 0) {
    log.warn({ mode, rawContentLength: rawContent?.length }, 'add_external_links:no_links_parsed');
    const contentStats = buildContentStats(statsBefore, statsBefore);
    const updatedArticleObj = updateArticle(normalizedMeta, {
      content: article.content,
    });
    return {
      success: true,
      message: 'No external links found to insert',
      tokensUsed: tokens,
      costUsd: usageStats.cost_usd,
      contentStats,
      prompt,
      rawResponse: flags.debug ? rawContent : undefined,
      operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
    };
  }

  // 5. Deduplicate URLs (simple Set-based check)
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

  // 6. Domain allowlist validation — reject links to non-allowlisted domains
  const allowlist = loadAllowedDomains(flags.domains_txt);
  const allowedLinks: typeof links = [];
  const rejectedDomains: string[] = [];
  for (const link of links) {
    if (isDomainAllowed(link.url, allowlist.domains, allowlist.patterns)) {
      allowedLinks.push(link);
    } else {
      try {
        const hostname = new URL(link.url).hostname;
        rejectedDomains.push(`${hostname} (${link.url})`);
      } catch {
        rejectedDomains.push(link.url);
      }
    }
  }
  if (rejectedDomains.length > 0) {
    log.warn({ mode, rejected: rejectedDomains }, 'add_external_links:domains_not_allowlisted');
  }
  links = allowedLinks;

  if (links.length === 0) {
    log.warn({ mode }, 'add_external_links:all_links_rejected_by_allowlist');
    const contentStats = buildContentStats(statsBefore, statsBefore);
    const updatedArticleObj = updateArticle(normalizedMeta, {
      content: article.content,
    });
    return {
      success: true,
      message: 'No external links passed domain allowlist',
      tokensUsed: tokens,
      costUsd: usageStats.cost_usd,
      contentStats,
      prompt,
      rawResponse: flags.debug ? rawContent : undefined,
      operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
    };
  }

  // 7. Apply link insertions
  const { result, applied, skipped } = applyLinkInsertions(article.content, links);

  if (skipped.length > 0) {
    log.warn({ mode, skipped }, 'link_insert:some_links_not_applied');
  }
  log.info({ mode, total: links.length, applied, skipped: skipped.length }, 'link_insert:applied');

  // 8. Clean URLs (remove tracking params)
  const projectUrl = context.projectConfig?.url;
  const normalizeUrl = (url: string | undefined): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `https://${url}`;
  };
  const cleanedContent = cleanMarkdownUrls(result, normalizeUrl(projectUrl));

  // 9. Build updated article
  const updatedArticleObj = updateArticle(normalizedMeta, {
    content: cleanedContent,
  });

  const statsAfter = countContentStats(cleanedContent);
  const contentStats = buildContentStats(statsBefore, statsAfter);

  log.info({
    path: context.articlePath,
    mode,
    tokens,
    cost_usd: usageStats.cost_usd,
    words: statsAfter.words,
    links_applied: applied,
    links_rejected: rejectedDomains.length,
  }, 'enhance:add_external_links:done');

  return {
    success: true,
    message: `Added ${applied} external link(s) (${statsAfter.words} words)`,
    tokensUsed: tokens,
    costUsd: usageStats.cost_usd,
    contentStats,
    prompt,
    rawResponse: flags.debug ? rawContent : undefined,
    operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
  };
};
