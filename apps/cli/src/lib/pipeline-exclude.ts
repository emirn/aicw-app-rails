import { existsSync, readFileSync } from 'fs';
import path from 'path';

/**
 * Load excluded actions from config/pipelines/<pipeline>_exclude.md
 * Returns empty array if file doesn't exist
 *
 * File format: one action per line, lines starting with # are comments
 * Example:
 *   # Exclude TOC and FAQ from enhance pipeline
 *   add_toc
 *   add_faq
 */
export function loadExcludedActions(projectRoot: string, pipelineName: string): string[] {
  const excludeFile = path.join(projectRoot, 'config', 'pipelines', `${pipelineName}_exclude.md`);

  if (!existsSync(excludeFile)) {
    return [];
  }

  const content = readFileSync(excludeFile, 'utf-8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#')); // Allow comments
}

/**
 * Load section-specific excluded actions from config/pipelines/{section}/{pipeline}_exclude.md
 * Returns empty array if file doesn't exist. Merged with global excludes by caller.
 */
export function loadSectionExcludedActions(
  projectRoot: string,
  pipelineName: string,
  articlePath: string
): string[] {
  const section = articlePath.split('/')[0];
  if (!section) return [];
  const excludeFile = path.join(projectRoot, 'config', 'pipelines', section, `${pipelineName}_exclude.md`);
  if (!existsSync(excludeFile)) return [];
  const content = readFileSync(excludeFile, 'utf-8');
  return content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}

/**
 * Filter out excluded actions from the pipeline actions list
 * Returns a new array with exclusions removed
 */
export function filterPipelineActions(
  actions: string[],
  excludedActions: string[],
  logger?: { log: (msg: string) => void }
): string[] {
  if (excludedActions.length === 0) {
    return actions;
  }

  const excludeSet = new Set(excludedActions);
  const filtered = actions.filter(action => !excludeSet.has(action));

  // Log what was excluded
  const actuallyExcluded = actions.filter(action => excludeSet.has(action));
  if (actuallyExcluded.length > 0 && logger) {
    logger.log(`Excluding ${actuallyExcluded.length} action(s): ${actuallyExcluded.join(', ')}`);
  }

  return filtered;
}
