/**
 * verify_assets action handler
 *
 * Verifies that all local asset paths referenced in article content
 * and metadata exist on disk. Uses available_assets list from CLI.
 */

import { ActionHandlerFn } from './types';
import { verifyAssets } from '../../utils/asset-verifier';

export const handle: ActionHandlerFn = async ({ article, normalizedMeta, context, flags, log }) => {
  const availableAssets: string[] = flags.existing_assets || [];

  const result = verifyAssets(
    article.content,
    { image_hero: normalizedMeta.image_hero, image_og: normalizedMeta.image_og },
    availableAssets
  );

  if (!result.success) {
    const missingList = result.missing
      .map(a => `${a.path} (${a.source})`)
      .join(', ');

    log.error({
      path: context.articlePath,
      mode: 'verify_assets',
      missing: result.missing.length,
    }, 'verify_assets:failed');

    return {
      success: false,
      error: `${result.missing.length} missing asset(s): ${missingList}`,
      errorCode: 'MISSING_ASSETS',
      operations: [],
    };
  }

  log.info({
    path: context.articlePath,
    mode: 'verify_assets',
    checked: result.totalChecked,
  }, 'verify_assets:passed');

  return {
    success: true,
    message: `Verified ${result.totalChecked} asset(s) - all exist`,
    tokensUsed: 0,
    costUsd: 0,
    operations: [],
  };
};
