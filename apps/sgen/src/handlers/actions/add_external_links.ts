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

interface DomainList {
  domains: string[];
  patterns: string[];
}

function parseDomainList(content: string): DomainList {
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

function isDomainBlocked(url: string, blocklist: DomainList): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    if (blocklist.domains.some(d => hostname === d || hostname.endsWith('.' + d))) return true;
    for (const p of blocklist.patterns) {
      const suffix = p.replace('*', '');
      if (hostname.endsWith(suffix)) return true;
    }
    return false;
  } catch {
    return true; // reject unparseable URLs
  }
}

function isHomepageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === '/' || parsed.pathname === '';
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

  // 2. Resolve domains content once (project override or bundled default)
  const domainsPath = join(__dirname, '..', '..', '..', 'config', 'actions', 'add_external_links', 'domains.txt');
  const domainsContent = flags.domains_txt || readFileSync(domainsPath, 'utf8');

  // 3. Extract ~100-word excerpt (body text only, no headings)
  const excerptWords = article.content
    .split('\n')
    .filter(line => !line.trimStart().startsWith('#') && line.trim().length > 0)
    .join(' ')
    .split(/\s+/)
    .slice(0, 100)
    .join(' ');

  // 4. Load and render prompt template with dynamic target and domains
  const { renderTemplateAbsolutePath } = await import('../../utils/template');
  const promptPath = join(__dirname, '..', '..', '..', 'config', 'actions', 'add_external_links', 'prompt.md');
  const prompt = renderTemplateAbsolutePath(promptPath, { content: article.content, target_links: targetLinks, domains: domainsContent, title: article.title || '', keywords: article.keywords || '', excerpt: excerptWords });

  // 5. Call AI
  const provider = cfg?.ai_provider || 'openrouter';
  const modelId = cfg?.ai_model_id || (provider === 'openai'
    ? config.ai.defaultModel.replace(/^openai\//, '')
    : config.ai.defaultModel);

  log.info({ path: context.articlePath, mode, target_links: targetLinks, words: statsBefore.words }, 'enhance:add_external_links:start');

  const { content, tokens, rawContent, usageStats } = await callAI(prompt, {
    provider,
    modelId,
    baseUrl: cfg?.ai_base_url,
    pricing: cfg?.pricing,
  });

  // 5. Parse response as link insertions
  let links = parseLinkInsertions(content);

  if (links.length === 0) {
    log.warn({ mode, rawContentLength: rawContent?.length, rawContentFull: rawContent },
      'add_external_links:no_links_parsed');
    const contentStats = buildContentStats(statsBefore, statsBefore);
    return {
      success: true,
      skipped: true,
      message: 'No external links found to insert (parse returned 0 links)',
      tokensUsed: tokens,
      costUsd: usageStats.cost_usd,
      contentStats,
      prompt,
      rawResponse: rawContent,
      operations: [],
      requireChanges: cfg?.require_changes,
    };
  }

  // 6. Domain blocklist — reject links from disallowed domains
  const disallowPath = join(__dirname, '..', '..', '..', 'config', 'actions', 'add_external_links', 'disallow_domains.txt');
  let disallowContent = '';
  try { disallowContent = readFileSync(disallowPath, 'utf8'); } catch { /* no blocklist file = no rejections */ }
  const blocklist = parseDomainList(disallowContent);
  const blockedDomains: string[] = [];
  links = links.filter(link => {
    if (isDomainBlocked(link.url, blocklist)) {
      try {
        blockedDomains.push(`${new URL(link.url).hostname} (${link.url})`);
      } catch {
        blockedDomains.push(link.url);
      }
      return false;
    }
    return true;
  });
  if (blockedDomains.length > 0) {
    log.warn({ mode, blocked: blockedDomains }, 'add_external_links:domains_blocked');
  }

  if (links.length === 0 && blockedDomains.length > 0) {
    const contentStats = buildContentStats(statsBefore, statsBefore);
    return {
      success: true,
      skipped: true,
      message: `All links rejected by blocklist (${blockedDomains.length} blocked)`,
      tokensUsed: tokens,
      costUsd: usageStats.cost_usd,
      contentStats,
      prompt,
      rawResponse: rawContent,
      operations: [],
      requireChanges: cfg?.require_changes,
    };
  }

  // 6b. Homepage URL filter — reject URLs that point to domain root instead of a specific page
  const rejectedHomepages: string[] = [];
  links = links.filter(link => {
    if (isHomepageUrl(link.url)) {
      rejectedHomepages.push(link.url);
      return false;
    }
    return true;
  });
  if (rejectedHomepages.length > 0) {
    log.warn({ mode, rejectedHomepages }, 'add_external_links:homepage_urls_rejected');
  }

  if (links.length === 0) {
    log.warn({ mode, rejectedHomepages }, 'add_external_links:all_links_rejected_as_homepages');
    const contentStats = buildContentStats(statsBefore, statsBefore);
    return {
      success: true,
      skipped: true,
      message: `No external links had specific page URLs (${rejectedHomepages.length} homepage URLs rejected)`,
      tokensUsed: tokens,
      costUsd: usageStats.cost_usd,
      contentStats,
      prompt,
      rawResponse: rawContent,
      operations: [],
      requireChanges: cfg?.require_changes,
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
  contentStats.changes = applied;

  log.info({
    path: context.articlePath,
    mode,
    tokens,
    cost_usd: usageStats.cost_usd,
    words: statsAfter.words,
    links_applied: applied,
    links_blocked: blockedDomains.length,
    links_rejected_homepage: rejectedHomepages.length,
  }, 'enhance:add_external_links:done');

  return {
    success: true,
    message: `Added ${applied} external link(s) (${statsAfter.words} words)`,
    tokensUsed: tokens,
    costUsd: usageStats.cost_usd,
    contentStats,
    prompt,
    rawResponse: rawContent,
    operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, mode)],
    requireChanges: cfg?.require_changes,
  };
};
