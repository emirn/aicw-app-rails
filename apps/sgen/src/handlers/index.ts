/**
 * Action Handlers Index
 *
 * Exports all handlers and provides action routing.
 */

export * from './types';
export { handlePlanImport } from './plan-import';
export { handleGenerate } from './generate';
export { handleEnhance } from './enhance';
export { handleStatus } from './status';

import { ActionContext, ActionExecuteResponse, ActionHandler } from './types';
import { handlePlanImport } from './plan-import';
import { handleGenerate } from './generate';
import { handleEnhance } from './enhance';
import { handleStatus } from './status';

/**
 * Map of action names to their handlers
 *
 * Note: article-seed is handled locally by CLI (no API call needed)
 */
const ACTION_HANDLERS: Record<string, ActionHandler> = {
  'plan-import': handlePlanImport,
  'generate': handleGenerate,
  'enhance': handleEnhance,
  'enhance-interlink-articles': handleEnhance,  // Uses enhance handler with mode='add_internal_links'
  'status': handleStatus,
};

/**
 * Route an action to its handler
 */
export async function routeAction(
  action: string,
  context: ActionContext,
  flags: Record<string, any>,
  log: { info: Function; error: Function; warn: Function }
): Promise<ActionExecuteResponse> {
  const handler = ACTION_HANDLERS[action];

  if (!handler) {
    return {
      success: false,
      error: `Unknown action: ${action}`,
      errorCode: 'UNKNOWN_ACTION',
      operations: [],
    };
  }

  return handler(context, flags, log);
}
