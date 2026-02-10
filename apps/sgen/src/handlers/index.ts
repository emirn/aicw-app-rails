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
import { loadPipelinesConfig } from '../config/pipelines-config';

/**
 * Map of action names to their handlers
 *
 * Note: article-seed is handled locally by CLI (no API call needed)
 * Note: Pipeline names not listed here (e.g., enhance-image-hero, enhance-image-og)
 * are resolved dynamically from pipelines.json and routed to handleEnhance.
 */
const ACTION_HANDLERS: Record<string, ActionHandler> = {
  'plan-import': handlePlanImport,
  'generate': handleGenerate,
  'enhance': handleEnhance,
  'status': handleStatus,
};

/**
 * Route an action to its handler.
 *
 * Lookup order:
 * 1. Explicit ACTION_HANDLERS map (plan-import, generate, enhance, status)
 * 2. Dynamic lookup in pipelines.json — any known pipeline routes to handleEnhance
 * 3. Unknown action error
 */
export async function routeAction(
  action: string,
  context: ActionContext,
  flags: Record<string, any>,
  log: { info: Function; error: Function; warn: Function }
): Promise<ActionExecuteResponse> {
  let handler = ACTION_HANDLERS[action];

  // Dynamic routing: if not in explicit map, check pipelines.json
  if (!handler) {
    const pipelinesConfig = loadPipelinesConfig();
    if (pipelinesConfig.pipelines[action]) {
      handler = handleEnhance;
    }
  }

  if (!handler) {
    return {
      success: false,
      error: `Unknown action: ${action}`,
      errorCode: 'UNKNOWN_ACTION',
      operations: [],
    };
  }

  // Set pipelineName so handlers can look up config (e.g., articleFilter.last_pipeline)
  context.pipelineName = action;

  return handler(context, flags, log);
}
