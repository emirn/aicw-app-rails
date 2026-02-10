/**
 * Project Configuration Manager
 *
 * Handles project-level settings stored in index.json.
 * Uses the unified format with optional override files.
 *
 * NOTE: This module only supports the unified format (index.json).
 * Use the 'migrate' command to convert old format (_project.json) to new format.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { IProjectConfig } from '@blogpostgen/types';
import { UnifiedSerializer, isUnifiedFormat, isOldProjectFormat } from './unified-serializer';

const DRAFTS_DIR = 'drafts';
const READY_DIR = 'ready';
const ASSETS_DIR = 'assets';
const ASSETS_IMAGES_DIR = 'images';

/**
 * Error thrown when old project format is detected
 */
export class LegacyProjectFormatError extends Error {
  constructor(projectDir: string) {
    super(
      `Legacy project format detected in "${projectDir}". ` +
      `Found _project.json instead of index.json. ` +
      `Run 'blogpostgen migrate' to convert to the new unified format.`
    );
    this.name = 'LegacyProjectFormatError';
  }
}

/**
 * Check for legacy format and throw error if found
 */
async function assertUnifiedFormat(projectDir: string): Promise<void> {
  if (await isOldProjectFormat(projectDir)) {
    throw new LegacyProjectFormatError(projectDir);
  }
}

/**
 * Get the path to the drafts directory (work in progress articles)
 *
 * @param projectDir - Absolute path to project root
 */
export function getDraftsDir(projectDir: string): string {
  return path.join(projectDir, DRAFTS_DIR);
}

/**
 * Alias for getDraftsDir (content = drafts folder)
 */
export function getContentDir(projectDir: string): string {
  return getDraftsDir(projectDir);
}

/**
 * Get the path to the ready directory (finalized articles)
 *
 * @param projectDir - Absolute path to project root
 */
export function getReadyDir(projectDir: string): string {
  return path.join(projectDir, READY_DIR);
}

/**
 * Get the path to the assets directory
 *
 * @param projectDir - Absolute path to project root
 */
export function getAssetsDir(projectDir: string): string {
  return path.join(projectDir, ASSETS_DIR);
}

/**
 * Load project configuration from index.json
 *
 * @param projectDir - Absolute path to project root
 * @returns Project config or null if not found
 * @throws LegacyProjectFormatError if old format is detected
 */
export async function loadProjectConfig(projectDir: string): Promise<IProjectConfig | null> {
  // Check for legacy format and throw error
  await assertUnifiedFormat(projectDir);

  // Load from unified format (index.json)
  if (!await isUnifiedFormat(projectDir)) {
    return null;
  }

  const serializer = new UnifiedSerializer<IProjectConfig>(projectDir);
  const { data } = await serializer.read();
  return data;
}

/**
 * Save project configuration to index.json
 *
 * @param projectDir - Absolute path to project root
 * @param config - Project configuration
 */
export async function saveProjectConfig(
  projectDir: string,
  config: IProjectConfig
): Promise<void> {
  await fs.mkdir(projectDir, { recursive: true });

  const serializer = new UnifiedSerializer<IProjectConfig>(projectDir);
  await serializer.write(config);
}

/**
 * Update project configuration (partial update)
 *
 * @param projectDir - Absolute path to project root
 * @param updates - Partial config to update
 * @returns Updated config
 * @throws LegacyProjectFormatError if old format is detected
 */
export async function updateProjectConfig(
  projectDir: string,
  updates: Partial<IProjectConfig>
): Promise<IProjectConfig> {
  // Check for legacy format and throw error
  await assertUnifiedFormat(projectDir);

  const existing = await loadProjectConfig(projectDir) || {} as IProjectConfig;
  const merged = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  } as IProjectConfig;

  const serializer = new UnifiedSerializer<IProjectConfig>(projectDir);
  await serializer.write(merged);

  return merged;
}

/**
 * Check if a project exists (has index.json)
 *
 * @param projectDir - Absolute path to project root
 * @throws LegacyProjectFormatError if old format is detected
 */
export async function projectExists(projectDir: string): Promise<boolean> {
  // Check for legacy format and throw error
  await assertUnifiedFormat(projectDir);

  return isUnifiedFormat(projectDir);
}

/**
 * Initialize a new project with folder structure
 *
 * @param projectDir - Absolute path to project root
 * @param config - Initial project configuration
 */
export async function initializeProject(
  projectDir: string,
  config: IProjectConfig
): Promise<void> {
  // Create directory structure
  await fs.mkdir(projectDir, { recursive: true });
  await fs.mkdir(getDraftsDir(projectDir), { recursive: true });
  await fs.mkdir(getReadyDir(projectDir), { recursive: true });
  await fs.mkdir(path.join(getAssetsDir(projectDir), ASSETS_IMAGES_DIR), { recursive: true });

  // Save project config with timestamps
  const fullConfig: IProjectConfig = {
    ...config,
    publish_to_local_folder: config.publish_to_local_folder ?? {
      enabled: false,
      path: "",
      content_subfolder: "articles",
      assets_subfolder: "assets",
      templatePath: "",
      template_settings: {},
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await saveProjectConfig(projectDir, fullConfig);
}

/**
 * Create a project config from website info
 *
 * @param websiteInfo - Website information
 * @returns Project configuration
 */
export function createProjectConfig(websiteInfo: {
  url: string;
  title: string;
}): IProjectConfig {
  // Determine URL: use provided URL, or derive from domain-like title
  let url = websiteInfo.url;
  if (!url && websiteInfo.title && websiteInfo.title.includes('.')) {
    // Title looks like a domain (e.g., "legalaitoolbox.com")
    url = websiteInfo.title.startsWith('http')
      ? websiteInfo.title
      : `https://${websiteInfo.title}`;
  }

  return {
    url,
    title: websiteInfo.title,
  };
}

/**
 * Get project name from URL (for folder naming)
 *
 * @param url - Website URL
 * @returns Safe folder name derived from URL
 */
export function projectNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Use hostname, replace dots with hyphens
    return parsed.hostname
      .replace(/^www\./, '')
      .replace(/\./g, '-')
      .toLowerCase();
  } catch {
    // Fallback: sanitize the input directly
    return url
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9-]/gi, '-')
      .toLowerCase();
  }
}

/**
 * Validate project configuration
 *
 * @param config - Project configuration to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateProjectConfig(config: Partial<IProjectConfig>): string[] {
  const errors: string[] = [];

  if (!config.url) {
    errors.push('URL is required');
  } else {
    try {
      new URL(config.url);
    } catch {
      errors.push('Invalid URL format');
    }
  }

  if (!config.title) {
    errors.push('Title is required');
  }

  return errors;
}

/**
 * Get all project directories in a parent directory
 * (useful for listing projects)
 *
 * @param parentDir - Directory to search for projects
 * @returns Array of project directory paths
 */
export async function listProjects(parentDir: string): Promise<string[]> {
  const projects: string[] = [];

  try {
    const entries = await fs.readdir(parentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projectDir = path.join(parentDir, entry.name);
        // Check for unified format (don't throw on legacy, just skip)
        if (await isUnifiedFormat(projectDir)) {
          projects.push(projectDir);
        }
      }
    }
  } catch {
    // Parent directory doesn't exist
  }

  return projects;
}
