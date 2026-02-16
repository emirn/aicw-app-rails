/**
 * humanize_text action handler
 *
 * Hybrid action: applies CSV replacements locally, then calls AI for orthography fix.
 * This avoids the 24K char limit issue from embedding the full CSV in the prompt.
 */

import { ActionHandlerFn } from './types';
import { buildArticleOperation, updateArticle } from '../utils';
import { ensureActionConfigForMode } from '../../config/action-config';
import { callAI } from '../../services/ai.service';
import { config } from '../../config/server-config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { countContentStats, buildContentStats } from '../../utils/content-stats';

export const handle: ActionHandlerFn = async ({ article, normalizedMeta, context, log }) => {
  const statsBefore = countContentStats(article.content || '');
  const { maskSafeZones } = await import('../../utils/random-typos');
  const csvPath = join(__dirname, '..', '..', '..', 'config', 'actions', 'humanize_text', 'replacements.csv');

  // Load and parse CSV
  let csv = '';
  try { csv = readFileSync(csvPath, 'utf8'); } catch { }
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lines = csv.split(/\r?\n/).filter(l => l.trim() && !/^\s*#/.test(l));
  const pairs: { from: string; to: string }[] = [];
  for (const line of lines) {
    const idx = line.indexOf(',');
    if (idx <= 0) continue;
    const from = line.slice(0, idx).trim().replace(/^"|"$/g, '');
    const to = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
    if (from) pairs.push({ from, to });
  }

  // Step 1: Apply CSV replacements with safe zone protection (placeholder approach)
  pairs.sort((a, b) => b.from.length - a.from.length);
  let text = article.content || '';

  // Protect safe zones by replacing with placeholders before CSV processing
  const { masked, restore } = maskSafeZones(text);
  let maskedText = masked;

  for (const { from, to } of pairs) {
    const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'gi');
    maskedText = maskedText.replace(re, (match) => {
      if (to.includes('|')) {
        const variants = to.split('|');
        return variants[Math.floor(Math.random() * variants.length)];
      }
      return to;
    });
  }

  // Restore safe zones from placeholders
  text = restore(maskedText);

  let changes = ['humanize_text (static CSV) applied'];
  let tokensUsed = 0;
  let costUsd = 0;

  // Step 2: AI orthography fix
  try {
    const fixPromptPath = join(__dirname, '..', '..', '..', 'config', 'actions', 'humanize_text', 'fix_orthography.md');
    const { renderTemplateAbsolutePath } = await import('../../utils/template');
    const prompt = renderTemplateAbsolutePath(fixPromptPath, { content: text });

    const cfg = ensureActionConfigForMode('humanize_text' as any);
    const provider = cfg?.ai_provider || 'openrouter';
    const modelId = cfg?.ai_model_id || config.ai.defaultModel;

    log.info({ path: context.articlePath, mode: 'humanize_text', action: 'fix_orthography' }, 'enhance:humanize_text:ai_start');
    const aiRes = await callAI(prompt, { provider, modelId, baseUrl: cfg?.ai_base_url, pricing: cfg?.pricing });

    if (aiRes.content && typeof aiRes.content === 'string') {
      const shrinkage = 1 - (aiRes.content.length / text.length);
      if (shrinkage > 0.3) {
        log.error({ shrinkagePct: Math.round(shrinkage * 100) }, 'humanize_text:orthography_shrunk_>30%, preserving original');
      } else {
        text = aiRes.content;
        changes.push('orthography fixed (AI)');
      }
    }
    tokensUsed = aiRes.tokens || 0;
    costUsd = aiRes.usageStats.cost_usd || 0;
  } catch (e: any) {
    log.warn({ err: e }, 'enhance:humanize_text:orthography_fix_failed');
  }

  const updatedArticleObj = updateArticle(normalizedMeta, {
    content: text,
  });

  const statsAfter = countContentStats(text);
  const contentStats = buildContentStats(statsBefore, statsAfter);
  log.info({ path: context.articlePath, mode: 'humanize_text', tokens: tokensUsed, cost_usd: costUsd, words: statsAfter.words }, 'enhance:humanize_text:done');

  return {
    success: true,
    message: `Humanized article (${changes.join(', ')})`,
    tokensUsed,
    costUsd,
    contentStats,
    operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, 'humanize_text')],
  };
};
