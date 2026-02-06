/**
 * Project Reinit - Initialize/reinitialize project with default action configs
 *
 * Creates missing config files for actions that support customization:
 * - config.json for actions with supports_custom_config: true
 * - custom.md for actions with supports_custom_prompt: true
 *
 * Does NOT overwrite existing files - only creates missing ones.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { getProjectPaths } from '../config/user-paths';
import { IActionConfig } from '@blogpostgen/types';

/**
 * Metadata for a created file
 */
export interface CreatedFile {
  path: string;           // Relative path: config/actions/write_draft/custom.md
  actionName: string;     // Action name: write_draft
  description: string;    // Action description from config
  fileType: 'prompt' | 'config';  // custom.md = prompt, config.json = config
}

/**
 * Result of reinit operation
 */
export interface ReinitResult {
  created: CreatedFile[];
  skipped: string[];
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reinitialize a project by adding missing default configs
 *
 * For each action in the API config:
 * - If supports_custom_config: true AND config.json doesn't exist -> create it
 * - If supports_custom_prompt: true AND prompt.md doesn't exist -> create it
 *
 * @param projectName - Name of the project to reinitialize
 * @param actionConfig - Action config map from server API (from executor.getActionConfig())
 * @returns ReinitResult with created and skipped file paths
 */
export async function reinitProject(
  projectName: string,
  actionConfig: Record<string, IActionConfig>
): Promise<ReinitResult> {
  const paths = getProjectPaths(projectName);
  const result: ReinitResult = { created: [], skipped: [] };

  for (const [actionName, cfg] of Object.entries(actionConfig)) {
    const actionDir = path.join(paths.root, 'config', 'actions', actionName);

    // Handle supports_custom_config -> config.json
    if (cfg.supports_custom_config) {
      const configPath = path.join(actionDir, 'config.json');
      const relativePath = path.relative(paths.root, configPath);

      if (await fileExists(configPath)) {
        result.skipped.push(relativePath);
      } else {
        await fs.mkdir(actionDir, { recursive: true });
        const configContent = {
          variables: cfg.variables || {},
        };
        await fs.writeFile(configPath, JSON.stringify(configContent, null, 2) + '\n');
        result.created.push({
          path: relativePath,
          actionName,
          description: cfg.description || '',
          fileType: 'config',
        });
      }
    }

    // Handle supports_custom_prompt -> custom.md
    if (cfg.supports_custom_prompt && cfg.custom_content) {
      const customPath = path.join(actionDir, 'custom.md');
      const relativePath = path.relative(paths.root, customPath);

      if (await fileExists(customPath)) {
        result.skipped.push(relativePath);
      } else {
        await fs.mkdir(actionDir, { recursive: true });
        await fs.writeFile(customPath, cfg.custom_content);
        result.created.push({
          path: relativePath,
          actionName,
          description: cfg.description || '',
          fileType: 'prompt',
        });
      }
    }
  }

  return result;
}

/**
 * Format created files for display, grouped by action
 * @param created - Array of created files
 * @param logger - Logger function (e.g., console.log or Logger.log)
 * @param projectRootPath - Optional absolute path to project root (for showing full paths)
 */
export function formatCreatedFilesOutput(
  created: CreatedFile[],
  logger: { log: (msg: string) => void },
  projectRootPath?: string
): void {
  // Early return only if nothing to show
  if (created.length === 0 && !projectRootPath) return;

  // Show customizable files if any were created
  if (created.length > 0) {
    // Group created files by action
    const byAction = new Map<string, CreatedFile[]>();
    for (const file of created) {
      const existing = byAction.get(file.actionName) || [];
      existing.push(file);
      byAction.set(file.actionName, existing);
    }

    logger.log('');
    logger.log('Customizable files created:');
    logger.log('');

    for (const [actionName, files] of byAction) {
      logger.log(`  ${actionName}`);
      for (const file of files) {
        const typeLabel = file.fileType === 'prompt' ? 'prompt template' : 'config variables';
        // Show full absolute path if projectRootPath is provided
        const displayPath = projectRootPath
          ? path.join(projectRootPath, file.path)
          : path.basename(file.path);
        logger.log(`    └─ ${displayPath} (${typeLabel})`);
        if (file.description) {
          logger.log(`       "${file.description}"`);
        }
      }
      logger.log('');
    }
  }

  // Show project settings path
  if (projectRootPath) {
    logger.log('Project settings (colors, badge, brand_name):');
    logger.log(`  ${path.join(projectRootPath, 'index.json')}`);
    logger.log('');
  }

  logger.log('⚠ Customize these files before generating articles to match your brand voice and style.');
}
