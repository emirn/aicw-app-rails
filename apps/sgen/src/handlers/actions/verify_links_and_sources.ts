/**
 * verify_links_and_sources action handler
 *
 * Verifies that all external URLs in article content are accessible.
 * Sgen has network access to check URLs directly.
 */

import { ActionHandlerFn } from './types';
import { verifyLinks } from '../../utils/link-verifier';

export const handle: ActionHandlerFn = async ({ article, context, log }) => {
  log.info({ path: context.articlePath, mode: 'verify_links_and_sources' }, 'verify_links:checking');

  const result = await verifyLinks(article.content);

  if (result.totalChecked === 0) {
    log.info({ path: context.articlePath }, 'verify_links:no_external_links');
    return {
      success: true,
      message: 'No external links found',
      tokensUsed: 0,
      costUsd: 0,
      operations: [],
    };
  }

  if (!result.success) {
    const failedList = result.failed
      .map(l => {
        const status = l.statusCode ? `HTTP ${l.statusCode}` : l.errorType || 'error';
        return `${l.url} (${status})`;
      })
      .join(', ');

    log.error({
      path: context.articlePath,
      mode: 'verify_links_and_sources',
      failed: result.failed.length,
      total: result.totalChecked,
    }, 'verify_links:failed');

    return {
      success: false,
      error: `${result.failed.length} broken link(s): ${failedList}`,
      errorCode: 'BROKEN_LINKS',
      operations: [],
    };
  }

  log.info({
    path: context.articlePath,
    mode: 'verify_links_and_sources',
    checked: result.totalChecked,
  }, 'verify_links:passed');

  return {
    success: true,
    message: `Verified ${result.totalChecked} link(s) - all accessible`,
    tokensUsed: 0,
    costUsd: 0,
    operations: [],
  };
};
