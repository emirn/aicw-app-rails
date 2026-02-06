/**
 * CLI Routes - Unified Action Endpoint
 *
 * Single endpoint for ALL actions. CLI sends action name and context,
 * API returns file operations for CLI to execute.
 */

import { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { join } from 'path';
import { routeAction, ActionExecuteRequest, ActionExecuteResponse, ActionDefinition } from '../handlers';

// Load action definitions
const CLI_ACTIONS_PATH = join(__dirname, '..', '..', 'config', 'cli-actions.json');
let ACTIONS: { actions: ActionDefinition[] } = { actions: [] };

try {
  ACTIONS = JSON.parse(readFileSync(CLI_ACTIONS_PATH, 'utf-8'));
} catch (err) {
  console.error('Failed to load cli-actions.json:', err);
}

export default async function cliRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/cli/actions
   * Returns list of available actions
   */
  app.get('/actions', async () => {
    return {
      success: true,
      actions: ACTIONS.actions.map((action) => ({
        name: action.name,
        description: action.description,
        usage: action.usage,
        estimatedCost: action.estimatedCost,
        requiresPath: action.requiresPath,
        requiresArticle: action.requiresArticle,
      })),
    };
  });

  /**
   * POST /api/v1/cli/execute
   * Unified action execution endpoint
   *
   * CLI sends: { action, flags, context }
   * API returns: { success, message, operations[], ... }
   */
  app.post<{ Body: ActionExecuteRequest }>('/execute', async (request, reply) => {
    const { action, flags, context } = request.body;

    if (!action) {
      reply.code(400);
      return {
        success: false,
        error: 'Action name is required',
        errorCode: 'MISSING_ACTION',
        operations: [],
      } as ActionExecuteResponse;
    }

    // Find action definition
    const actionDef = ACTIONS.actions.find((a) => a.name === action);
    if (!actionDef) {
      reply.code(400);
      return {
        success: false,
        error: `Unknown action: ${action}`,
        errorCode: 'UNKNOWN_ACTION',
        operations: [],
      } as ActionExecuteResponse;
    }

    // REQUIRED: projectConfig must be provided for all actions
    if (!context?.projectConfig) {
      app.log.error({ action, hasContext: !!context, hasProjectConfig: false }, 'cli/execute:missing_project_config');
      reply.code(400);
      return {
        success: false,
        error: 'Project config is required for all actions. Ensure project exists and has index.json.',
        errorCode: 'MISSING_PROJECT_CONFIG',
        operations: [],
      } as ActionExecuteResponse;
    }

    app.log.info({ action, flags, hasContext: !!context, hasProjectConfig: !!context?.projectConfig }, 'cli/execute:start');

    try {
      // Route to handler
      const result = await routeAction(action, context || {}, flags || {}, app.log);

      if (!result.success) {
        reply.code(400);
      }

      app.log.info({
        action,
        success: result.success,
        operationsCount: result.operations?.length || 0,
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
      }, 'cli/execute:done');

      return result;
    } catch (err: any) {
      app.log.error({ err, action, message: err?.message }, 'cli/execute:error');
      reply.code(500);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Action execution failed',
        errorCode: 'EXECUTION_ERROR',
        operations: [],
      } as ActionExecuteResponse;
    }
  });

  // Legacy endpoint - redirects to new structure
  // Keep for backward compatibility during transition
  app.get('/commands', async () => {
    return {
      success: true,
      commands: ACTIONS.actions.map((action) => ({
        name: action.name,
        description: action.description,
        usage: action.usage,
        estimatedCost: action.estimatedCost,
        local: false, // No more local commands
      })),
    };
  });
}
