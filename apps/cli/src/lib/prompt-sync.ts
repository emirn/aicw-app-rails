/**
 * Prompt Sync - Automatically sync action custom.md files from server
 *
 * When CLI fetches action config from server, this module syncs any
 * missing custom.md files to the local project for actions that support
 * custom prompts (supports_custom_prompt: true).
 *
 * Note: prompt.md files are NOT synced - they stay on the server.
 * Only custom.md is synced for project customization.
 * config.json files are also no longer synced - all configuration
 * comes from the server.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { IActionConfig } from '@blogpostgen/types';

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
 * Sync missing custom.md files from server config
 *
 * For each action with supports_custom_prompt: true in the config:
 * - If custom.md file doesn't exist locally, write it from server
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

    // Sync custom.md if exists on server (not prompt.md)
    if (cfg.custom_content && cfg.custom_relative_path) {
      const localPath = path.join(projectRoot, cfg.custom_relative_path);
      if (!(await existsAndValid(localPath))) {
        await writeFile(localPath, cfg.custom_content);
        synced.push(cfg.custom_relative_path);
      }
    }

    // config.json files are no longer synced - configuration comes from server
  }

  return synced;
}
