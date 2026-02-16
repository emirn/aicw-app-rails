/**
 * Folder-scanning action handler discovery
 *
 * Automatically discovers handler files in this directory.
 * Each file exports a `handle` function matching ActionHandlerFn.
 */

import { readdirSync } from 'fs';
import { ActionHandlerFn } from './types';

const SKIP = new Set(['index', 'types']);
const handlerNames = readdirSync(__dirname)
  .filter(f => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'))
  .map(f => f.replace(/\.(ts|js)$/, ''))
  .filter(name => !SKIP.has(name));

const cache = new Map<string, ActionHandlerFn>();

export function hasActionHandler(mode: string): boolean {
  return handlerNames.includes(mode);
}

export async function getActionHandler(mode: string): Promise<ActionHandlerFn | null> {
  if (!hasActionHandler(mode)) return null;
  if (cache.has(mode)) return cache.get(mode)!;
  const mod = await import(`./${mode}`);
  const handler: ActionHandlerFn = mod.handle;
  cache.set(mode, handler);
  return handler;
}
