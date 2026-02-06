/**
 * Handler Utility Functions
 *
 * Helper functions for the unified article object pattern.
 */

import { IArticle } from '@blogpostgen/types';
import { ActionContext, FileOperation } from './types';

/**
 * Get article from context
 * Returns null if no article is present
 */
export function getArticleFromContext(context: ActionContext): IArticle | null {
  return context.article || null;
}

/**
 * Build an update_article operation with unified article object
 */
export function buildArticleOperation(
  articlePath: string,
  article: IArticle,
  actionName?: string
): FileOperation {
  return {
    type: 'update_article',
    articlePath,
    article,
    action_name: actionName,
  };
}

/**
 * Build a create_article operation with unified article object
 */
export function buildCreateArticleOperation(
  articlePath: string,
  article: IArticle
): FileOperation {
  return {
    type: 'create_article',
    articlePath,
    article,
  };
}

/**
 * Update article with new fields, incrementing version and updating timestamp
 */
export function updateArticle(
  article: IArticle,
  updates: Partial<IArticle>
): IArticle {
  return {
    ...article,
    ...updates,
    version: (article.version || 0) + 1,
    updated_at: new Date().toISOString(),
  };
}
