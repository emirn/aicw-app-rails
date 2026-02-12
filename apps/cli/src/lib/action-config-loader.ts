/**
 * Action Config Loader
 *
 * Loads per-action configuration from {project}/config/actions/{actionName}/config.json
 * Supports path-based filtering to selectively run actions on specific content paths.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { minimatch } from 'minimatch';

/**
 * Color configuration for hero image generation
 */
export interface ActionColors {
  primary?: string;
  secondary?: string;
  background?: string;
}

/**
 * Configuration for path-based action filtering
 */
export interface ActionPathConfig {
  /** Glob patterns for paths that should run this action */
  include_paths?: string[];
  /** Color palette for image generation (legacy - use variables instead) */
  colors?: ActionColors;
  /** Custom variables for prompt template (e.g., brand colors) */
  variables?: Record<string, string>;
}

/**
 * Default colors for hero image generation
 */
export const DEFAULT_HERO_COLORS: ActionColors = {
  primary: '#3B82F6',
  secondary: '#8B5CF6',
  background: '#1E293B',
};

/**
 * Load action configuration from project config folder
 *
 * @param projectRoot - Absolute path to project root
 * @param actionName - Name of the action (e.g., 'generate_image_hero')
 * @returns Parsed config or null if not found
 */
export async function loadActionConfig(
  projectRoot: string,
  actionName: string
): Promise<ActionPathConfig | null> {
  const configPath = path.join(projectRoot, 'config', 'actions', actionName, 'config.json');
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Check if an action should run for a given article path
 *
 * @param articlePath - Relative path to article (e.g., 'blog/my-article')
 * @param config - Action config with include_paths patterns
 * @returns true if action should run, false otherwise
 *
 * Behavior:
 * - No config file → false (skip action by default, saves money)
 * - Path matches include_paths → true (generate)
 * - Path doesn't match → false (skip)
 */
export function shouldRunForPath(
  articlePath: string,
  config: ActionPathConfig | null
): boolean {
  // No config = skip (default behavior saves money)
  if (!config?.include_paths?.length) {
    return false;
  }

  // Check if any pattern matches the article path
  return config.include_paths.some((pattern) =>
    minimatch(articlePath, pattern, { matchBase: true })
  );
}

/**
 * Load custom prompt template from action config folder
 *
 * @param projectRoot - Absolute path to project root
 * @param actionName - Name of the action (e.g., 'generate_image_hero')
 * @param filename - Prompt filename (default: 'prompt.md')
 * @returns Prompt content or null if not found
 */
export async function loadActionPrompt(
  projectRoot: string,
  actionName: string,
  filename: string = 'prompt.md'
): Promise<string | null> {
  const promptPath = path.join(projectRoot, 'config', 'actions', actionName, filename);
  try {
    return await fs.readFile(promptPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Load custom.md content from action config folder
 *
 * @param projectRoot - Absolute path to project root
 * @param actionName - Name of the action (e.g., 'write_draft')
 * @returns custom.md content or null if not found
 */
export async function loadActionCustomContent(
  projectRoot: string,
  actionName: string
): Promise<string | null> {
  const customPath = path.join(projectRoot, 'config', 'actions', actionName, 'custom.md');
  try {
    return await fs.readFile(customPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Replace color macros in a prompt template
 *
 * @param template - Prompt template with {{color_name}} macros
 * @param colors - Color values to substitute
 * @returns Template with colors replaced
 */
export function replaceColorMacros(template: string, colors: ActionColors): string {
  const finalColors = { ...DEFAULT_HERO_COLORS, ...colors };

  return template
    .replace(/\{\{primary_color\}\}/g, finalColors.primary!)
    .replace(/\{\{secondary_color\}\}/g, finalColors.secondary!)
    .replace(/\{\{background_color\}\}/g, finalColors.background!);
}

/**
 * Get the base path for action configs
 */
export function getActionConfigPath(projectRoot: string, actionName: string): string {
  return path.join(projectRoot, 'config', 'actions', actionName);
}

/**
 * Get the base path for pipeline configs
 */
export function getPipelineConfigPath(projectRoot: string): string {
  return path.join(projectRoot, 'config', 'pipelines');
}
