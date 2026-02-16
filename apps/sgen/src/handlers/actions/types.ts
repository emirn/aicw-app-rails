/**
 * Shared types for per-action handler files
 */

import { IActionConfig, IApiArticle, IArticle } from '@blogpostgen/types';
import { ActionContext, ActionExecuteResponse } from '../types';

export interface ActionHandlerContext {
  article: IApiArticle;
  articleObj: IArticle;
  normalizedMeta: IArticle;
  context: ActionContext;
  flags: Record<string, any>;
  cfg: IActionConfig;
  log: { info: Function; error: Function; warn: Function };
}

export type ActionHandlerFn = (ctx: ActionHandlerContext) => Promise<ActionExecuteResponse>;
