import { platform } from 'os';
import path from 'path';
import { existsSync, mkdirSync, realpathSync, lstatSync } from 'fs';

/**
 * User data paths for BlogPostGen
 *
 * Environment variable:
 *   - BLOGPOSTGEN_DATA_FOLDER: Full path to data folder (required)
 *     Example: /path/to/blogpostgen-data/aicw.io
 *
 * Structure:
 *   BLOGPOSTGEN_DATA_FOLDER/
 *   ├── settings.json
 *   ├── projects/
 *   ├── cache/
 *   ├── logs/
 *   └── config/
 */

/**
 * Get the root user data directory for BlogPostGen
 * Used by the CLI for storing articles, logs, cache, config, and settings
 */
export function getUserDataDir(): string {
  const dataFolder = process.env.BLOGPOSTGEN_DATA_FOLDER;

  // BLOGPOSTGEN_DATA_FOLDER is required
  if (dataFolder === undefined) {
    throw new Error(
      'BLOGPOSTGEN_DATA_FOLDER environment variable is required. ' +
      'Set it to the full path where blogpostgen data should be stored. ' +
      'Example: export BLOGPOSTGEN_DATA_FOLDER="/path/to/data/aicw.io"'
    );
  }

  // Validate BLOGPOSTGEN_DATA_FOLDER is not empty
  if (!dataFolder.trim()) {
    throw new Error('BLOGPOSTGEN_DATA_FOLDER is set but empty. Provide a valid path.');
  }

  // Validate folder exists
  const resolvedFolder = path.resolve(dataFolder);
  if (!existsSync(resolvedFolder)) {
    throw new Error(`BLOGPOSTGEN_DATA_FOLDER path does not exist: ${resolvedFolder}`);
  }

  return resolvedFolder;
}

// All paths under USER_DATA_DIR (flattened structure - no 'data/' nesting)
export const USER_DATA_DIR = getUserDataDir();
export const USER_PROJECTS_DIR = path.join(USER_DATA_DIR, 'projects');
export const USER_CACHE_DIR = path.join(USER_DATA_DIR, 'cache');
export const USER_LOGS_DIR = path.join(USER_DATA_DIR, 'logs');
export const USER_CONFIG_DIR = path.join(USER_DATA_DIR, 'config');
export const USER_SETTINGS_PATH = path.join(USER_DATA_DIR, 'settings.json');

/**
 * Get the path to the user settings file
 */
export function getSettingsPath(): string {
  return USER_SETTINGS_PATH;
}

// Cache subdirectories
export const CACHE_WEBSITE_SCANS_DIR = path.join(USER_CACHE_DIR, 'website-scans');
export const CACHE_COMPETITORS_DIR = path.join(USER_CACHE_DIR, 'competitors');
export const CACHE_AI_RESPONSES_DIR = path.join(USER_CACHE_DIR, 'ai-responses');

// Log subdirectories
export const LOGS_CLI_DIR = path.join(USER_LOGS_DIR, 'cli');
export const LOGS_SGEN_DIR = path.join(USER_LOGS_DIR, 'sgen');
// @deprecated - pgen service removed, use LOGS_CLI_DIR instead
export const LOGS_PGEN_DIR = path.join(USER_LOGS_DIR, 'pgen');

/**
 * Get project directory for a specific project
 */
export function getUserProjectDir(projectName: string): string {
  const projectPath = path.join(USER_PROJECTS_DIR, projectName);
  validatePathIsSafe(projectPath, `project directory for: ${projectName}`);
  return projectPath;
}

/**
 * Get project subdirectories
 */
export function getProjectPaths(projectName: string) {
  const projectDir = getUserProjectDir(projectName);

  return {
    root: projectDir,
    // Filesystem-as-Plan: article folders
    drafts: path.join(projectDir, 'drafts'),
    published: path.join(projectDir, 'published'),
    // @deprecated - use drafts instead
    content: path.join(projectDir, 'drafts'),
    projectYaml: path.join(projectDir, '_project.yaml'),
    blogpostgenDir: path.join(projectDir, '.blogpostgen'),
    // @deprecated - legacy paths for old draft system
    draftsProcessed: path.join(projectDir, 'drafts', '_processed'),
    articlePhase: (phase: string) => path.join(projectDir, 'articles', phase),
    // Assets
    assets: path.join(projectDir, 'assets'),
    assetsImages: path.join(projectDir, 'assets', 'images'),
    assetsDiagrams: path.join(projectDir, 'assets', 'images', 'diagrams'),
    // Other
    logs: path.join(projectDir, 'logs'),
    actionCache: path.join(projectDir, 'action-cache'),
    plans: path.join(projectDir, 'plans'),
    projectJson: path.join(projectDir, 'project.json')
  };
}

/**
 * Security: Validate path is safe and within user data directory
 * Prevents path traversal attacks and ensures paths stay within boundaries
 */
export function validatePathIsSafe(targetPath: string, context: string): void {
  // Resolve to absolute path
  const resolvedPath = path.resolve(targetPath);

  // Check if path is within USER_DATA_DIR boundary
  const relativePath = path.relative(USER_DATA_DIR, resolvedPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(
      `Security: Path traversal detected for ${context}. ` +
      `Path '${targetPath}' is outside user data directory.`
    );
  }

  // Check for symlinks (if path exists)
  if (existsSync(resolvedPath)) {
    const stats = lstatSync(resolvedPath);
    if (stats.isSymbolicLink()) {
      const realPath = realpathSync(resolvedPath);
      const relativeReal = path.relative(USER_DATA_DIR, realPath);

      if (relativeReal.startsWith('..') || path.isAbsolute(relativeReal)) {
        throw new Error(
          `Security: Symlink points outside user data directory for ${context}.`
        );
      }
    }
  }

  // Check for reserved names on Windows
  if (platform() === 'win32') {
    const basename = path.basename(resolvedPath).toUpperCase();
    const reserved = ['CON', 'PRN', 'AUX', 'NUL',
      'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
      'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];

    if (reserved.includes(basename) || reserved.includes(basename.split('.')[0])) {
      throw new Error(
        `Security: Reserved Windows filename '${basename}' for ${context}.`
      );
    }
  }
}

/**
 * Initialize all user data directories
 * Creates directory structure if it doesn't exist
 */
export async function initializeUserDirectories(): Promise<void> {
  const directories = [
    USER_DATA_DIR,
    USER_PROJECTS_DIR,
    USER_CACHE_DIR,
    CACHE_WEBSITE_SCANS_DIR,
    CACHE_COMPETITORS_DIR,
    CACHE_AI_RESPONSES_DIR,
    USER_LOGS_DIR,
    LOGS_CLI_DIR,
    LOGS_SGEN_DIR,
    LOGS_PGEN_DIR,  // Keep for backward compatibility
    USER_CONFIG_DIR,
  ];

  for (const dir of directories) {
    if (!existsSync(dir)) {
      validatePathIsSafe(dir, `creating directory: ${dir}`);
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Initialize project directory structure
 */
export async function initializeProjectDirectories(projectName: string): Promise<void> {
  const paths = getProjectPaths(projectName);

  const directories = [
    paths.root,
    // Filesystem-as-Plan folders
    paths.drafts,
    paths.published,
    // Assets
    paths.assets,
    paths.assetsImages,
    paths.assetsDiagrams,
    // Other
    paths.logs,
    paths.actionCache,
    paths.plans
  ];

  for (const dir of directories) {
    if (!existsSync(dir)) {
      validatePathIsSafe(dir, `creating project directory: ${dir}`);
      mkdirSync(dir, { recursive: true });
    }
  }
}
