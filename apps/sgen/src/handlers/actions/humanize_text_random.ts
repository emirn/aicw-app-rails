/**
 * humanize_text_random action handler
 *
 * Applies random typos from CSV to humanize AI-generated content.
 * No AI call needed — purely local processing.
 */

import { ActionHandlerFn } from './types';
import { buildArticleOperation, updateArticle } from '../utils';
import { readFileSync } from 'fs';
import { join } from 'path';

export const handle: ActionHandlerFn = async ({ article, normalizedMeta, context, log }) => {
  const { applyRandomTypos, loadTyposFromCSV, DEFAULT_TYPO_CONFIG } = await import('../../utils/random-typos');
  const typosPath = join(__dirname, '..', '..', '..', 'config', 'actions', 'humanize_text_random', 'typos.csv');

  let csvContent = '';
  try {
    csvContent = readFileSync(typosPath, 'utf8');
  } catch {
    log.warn({ mode: 'humanize_text_random' }, 'humanize_text_random: No typos.csv found, using algorithmic typos only');
  }

  const commonTypos = loadTyposFromCSV(csvContent);
  const rate = (context as any)?.typo_rate ?? DEFAULT_TYPO_CONFIG.rate;

  const { result, typosApplied } = applyRandomTypos(
    article.content || '',
    commonTypos,
    { rate }
  );

  const updatedArticleObj = updateArticle(normalizedMeta, {
    content: result,
  });

  log.info({ path: context.articlePath, mode: 'humanize_text_random', typos_applied: typosApplied.length }, 'enhance:local_action:done');

  return {
    success: true,
    message: `Applied ${typosApplied.length} typos`,
    tokensUsed: 0,
    costUsd: 0,
    operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, 'humanize_text_random')],
  };
};
