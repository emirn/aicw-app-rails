/**
 * add_toc action handler
 *
 * Generates a table of contents from article headings.
 * No AI call needed — local heading extraction and HTML generation.
 */

import { ActionHandlerFn } from './types';
import { buildArticleOperation, updateArticle } from '../utils';
import { applyTextReplacements } from '../../utils/articleUpdate';

export const handle: ActionHandlerFn = async ({ article, normalizedMeta, context, log }) => {
  // Skip if toc already exists on the article
  if (normalizedMeta.toc && normalizedMeta.toc.trim()) {
    log.info({ path: context.articlePath, mode: 'add_toc' }, 'add_toc:skipped (toc already exists)');
    return {
      success: true,
      message: 'Skipped (toc already exists)',
      skipped: true,
      operations: [],
    };
  }

  const { generateTOCLocal } = await import('../../utils/toc-generator');
  const tocResult = generateTOCLocal(article.content);

  if (tocResult.skipped) {
    log.info({ path: context.articlePath, mode: 'add_toc' }, 'add_toc:skipped (existing TOC found)');
    return {
      success: true,
      message: 'Skipped add_toc (existing TOC found)',
      skipped: true,
      operations: [],
    };
  }

  if (tocResult.headings.length === 0) {
    log.info({ path: context.articlePath, mode: 'add_toc' }, 'add_toc:no headings found');
    return {
      success: true,
      message: 'No headings found for TOC',
      tokensUsed: 0,
      costUsd: 0,
      operations: [],
    };
  }

  // Apply anchor replacements to content if any new anchors needed
  let updatedContent = article.content;
  let applied = 0;
  let skippedReplacements: string[] = [];
  if (tocResult.anchorReplacements.length > 0) {
    const replaceResult = applyTextReplacements(
      article.content,
      tocResult.anchorReplacements
    );
    updatedContent = replaceResult.result;
    applied = replaceResult.applied;
    skippedReplacements = replaceResult.skipped;
  }

  const updatedArticleObj = updateArticle(normalizedMeta, {
    content: updatedContent,
    toc: tocResult.tocHtml,
  });

  log.info({
    path: context.articlePath,
    mode: 'add_toc',
    headings: tocResult.headings.length,
    anchorsAdded: applied,
    anchorsSkipped: skippedReplacements.length,
  }, 'add_toc:local applied');

  return {
    success: true,
    message: `Added TOC with ${tocResult.headings.length} headings (local, no AI)`,
    tokensUsed: 0,
    costUsd: 0,
    operations: [buildArticleOperation(context.articlePath!, updatedArticleObj, 'add_toc')],
  };
};
