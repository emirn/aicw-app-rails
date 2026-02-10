/**
 * Prompt Sync - Write bundled default custom.md files to projects
 *
 * For actions that support custom prompts (supports_custom_prompt: true),
 * this module writes CLI-bundled default custom.md templates to the local
 * project if they don't already exist.
 *
 * Note: prompt.md files are NOT synced - they stay on the server.
 * Only custom.md is synced for project customization.
 * config.json files are also no longer synced - all configuration
 * comes from the server.
 */

import { promises as fs } from 'fs';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { IActionConfig } from '@blogpostgen/types';

/** Directory containing CLI-bundled action templates */
const BUNDLED_DIR = path.join(__dirname, '..', 'config', 'actions');

/**
 * Read a bundled custom.md template from CLI's config directory
 */
function getBundledCustomMd(actionName: string): string | null {
  const p = path.join(BUNDLED_DIR, actionName, 'custom.md');
  return existsSync(p) ? readFileSync(p, 'utf-8') : null;
}

/** Minimum file size to consider a file valid (bytes) */
const MIN_SIZE = 3;

/**
 * Check if a file exists and has valid content (> MIN_SIZE bytes)
 */
async function existsAndValid(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.size > MIN_SIZE;
  } catch {
    return false;
  }
}

/**
 * Write a file, creating parent directories as needed
 */
async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Sync missing custom.md files from CLI-bundled templates
 *
 * For each action with supports_custom_prompt: true in the config:
 * - If custom.md file doesn't exist locally, write it from CLI's bundled defaults
 *
 * Note: prompt.md files are NOT synced - they stay on the server.
 * config.json files are also no longer synced - configuration comes
 * from the server only.
 *
 * @param projectRoot - Absolute path to project root
 * @param actionConfig - Action config map from server API
 * @returns Array of relative paths that were synced
 */
export async function syncActionPrompts(
  projectRoot: string,
  actionConfig: Record<string, IActionConfig>
): Promise<string[]> {
  const synced: string[] = [];

  for (const [name, cfg] of Object.entries(actionConfig)) {
    // Only sync custom.md for actions that support customization
    if (!cfg.supports_custom_prompt) {
      continue;
    }

    // Write bundled custom.md if not already present locally
    const defaultContent = getBundledCustomMd(name);
    if (defaultContent) {
      const relativePath = `config/actions/${name}/custom.md`;
      const localPath = path.join(projectRoot, relativePath);
      if (!(await existsAndValid(localPath))) {
        await writeFile(localPath, defaultContent);
        synced.push(relativePath);
      }
    }

    // config.json files are no longer synced - configuration comes from server
  }

  return synced;
}
