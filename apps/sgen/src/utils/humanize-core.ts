/**
 * Shared humanization logic for any article text field.
 *
 * Applies CSV word replacements + AI orthography fix.
 * Used by humanize_text (content) and humanize_text_faq (faq).
 */

import { ActionHandlerContext } from '../handlers/actions/types';
import { ActionExecuteResponse } from '../handlers/types';
import { buildArticleOperation, updateArticle } from '../handlers/utils';
import { ensureActionConfigForMode } from '../config/action-config';
import { callAI } from '../services/ai.service';
import { config } from '../config/server-config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { countContentStats, buildContentStats } from './content-stats';

export type HumanizableField = 'content' | 'faq';

export async function humanizeField(
  ctx: ActionHandlerContext,
  field: HumanizableField,
  actionName: string
): Promise<ActionExecuteResponse> {
  const { normalizedMeta, context, log } = ctx;

  const text0 = (normalizedMeta as any)[field] as string | undefined;
  if (!text0 || !text0.trim()) {
    return { success: true, skipped: true, message: `No ${field} content to humanize`, operations: [] };
  }

  const statsBefore = countContentStats(text0);
  const { maskSafeZones } = await import('./random-typos');

  // CSV loading + parsing (reuse humanize_text's CSV for all fields)
  const csvPath = join(__dirname, '..', '..', 'config', 'actions', 'humanize_text', 'replacements.csv');
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

  // Step 1: CSV replacements with safe zone protection
  pairs.sort((a, b) => b.from.length - a.from.length);
  const { masked, restore } = maskSafeZones(text0);
  let maskedText = masked;

  for (const { from, to } of pairs) {
    const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'gi');
    maskedText = maskedText.replace(re, (_match) => {
      if (to.includes('|')) {
        const variants = to.split('|');
        return variants[Math.floor(Math.random() * variants.length)];
      }
      return to;
    });
  }

  let text = restore(maskedText);
  let changes = [`${actionName} (static CSV) applied`];
  let tokensUsed = 0;
  let costUsd = 0;

  // Step 2: AI orthography fix (reuse humanize_text's prompt for all fields)
  try {
    const fixPromptPath = join(__dirname, '..', '..', 'config', 'actions', 'humanize_text', 'fix_orthography.md');
    const { renderTemplateAbsolutePath } = await import('./template');
    const prompt = renderTemplateAbsolutePath(fixPromptPath, { content: text });

    const cfg = ensureActionConfigForMode(actionName as any);
    const provider = cfg?.ai_provider || 'openrouter';
    const modelId = cfg?.ai_model_id || config.ai.defaultModel;

    log.info({ path: context.articlePath, mode: actionName, action: 'fix_orthography' }, `enhance:${actionName}:ai_start`);
    const aiRes = await callAI(prompt, { provider, modelId, baseUrl: cfg?.ai_base_url, pricing: cfg?.pricing });

    if (aiRes.content && typeof aiRes.content === 'string') {
      const shrinkage = 1 - (aiRes.content.length / text.length);
      if (shrinkage > 0.3) {
        log.error({ shrinkagePct: Math.round(shrinkage * 100) }, `${actionName}:orthography_shrunk_>30%, preserving original`);
      } else {
        text = aiRes.content;
        changes.push('orthography fixed (AI)');
      }
    }
    tokensUsed = aiRes.tokens || 0;
    costUsd = aiRes.usageStats.cost_usd || 0;
  } catch (e: any) {
    log.warn({ err: e }, `enhance:${actionName}:orthography_fix_failed`);
  }

  const updatedArticleObj = updateArticle(normalizedMeta, {
    [field]: text,
  });

  const statsAfter = countContentStats(text);
  const contentStats = buildContentStats(statsBefore, statsAfter);
  log.info({ path: context.articlePath, mode: actionName, tokens: tokensUsed, cost_usd: costUsd, words: statsAfter.words }, `enhance:${actionName}:done`);

  return {
    success: true,
    message: `Humanized ${field} (${changes.join(', ')})`,
    tokensUsed,
    costUsd,
    contentStats,
    operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, actionName)],
  };
}
