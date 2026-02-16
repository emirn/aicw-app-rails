/**
 * Prompt Loader - Loads and validates project-specific prompt requirements
 *
 * For the write_draft action, loads custom.md from:
 * <project>/config/actions/write_draft/custom.md
 */

import { promises as fs } from 'fs';
import path from 'path';

/** Prompt parts for article generation */
export interface PromptParts {
  project_requirements: string;
}

/** Folder name for write_draft prompts (new consolidated path) */
export const WRITE_DRAFT_PROMPTS_DIR = 'config/actions/write_draft/';

/** Prompt file name - user-customizable portion (custom.md) */
const PROMPT_FILE = 'custom.md';

/** Marker indicating a file is an uncustomized default template */
const UNCUSTOMIZED_TEMPLATE_MARKER = 'CUSTOMIZE_THIS_TEMPLATE_AND_REMOVE_THIS_TAG';

/**
 * Error thrown when prompt validation fails
 */
export class PromptValidationError extends Error {
  public readonly filePath: string;

  constructor(filePath: string, message: string) {
    super(`${message}\n\nPlease edit: ${filePath}`);
    this.name = 'PromptValidationError';
    this.filePath = filePath;
  }
}

/**
 * Error thrown when multiple prompt files need attention
 * @deprecated Kept for backward compatibility - now using single file
 */
export class MultiplePromptsError extends Error {
  public readonly filePaths: string[];

  constructor(filePaths: string[], message: string) {
    const pathList = filePaths.map((p) => `  - ${p}`).join('\n');
    super(`${message}\n\nPlease edit the following files:\n${pathList}`);
    this.name = 'MultiplePromptsError';
    this.filePaths = filePaths;
  }
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
 * Load prompt parts from a project directory
 *
 * Validates that config/actions/write_draft/custom.md exists and is properly customized.
 *
 * @param projectDir - Absolute path to the project directory
 * @returns Validated prompt parts
 * @throws PromptValidationError if the file is empty or uncustomized
 */
export async function loadPromptParts(projectDir: string): Promise<PromptParts> {
  const promptsDir = path.join(projectDir, WRITE_DRAFT_PROMPTS_DIR);
  const filePath = path.join(promptsDir, PROMPT_FILE);

  // Ensure prompts directory exists
  await fs.mkdir(promptsDir, { recursive: true });

  // Check if file exists
  if (!(await fileExists(filePath))) {
    throw new PromptValidationError(
      filePath,
      'Prompt file does not exist. Please create and customize it.'
    );
  }

  // Read and validate content
  const content = (await fs.readFile(filePath, 'utf-8')).trim();

  // Check if file still contains the default template marker (uncustomized)
  if (content.includes(UNCUSTOMIZED_TEMPLATE_MARKER)) {
    throw new PromptValidationError(
      filePath,
      'This prompt file has not been customized for your project.\n' +
      'Please remove the DEFAULT_TEMPLATE marker and add your project-specific content.'
    );
  }

  // Check if file is empty or only contains HTML comments
  const contentWithoutComments = content.replace(/<!--[\s\S]*?-->/g, '').trim();

  if (!contentWithoutComments) {
    throw new PromptValidationError(filePath, 'Prompt file is empty. Please add content.');
  }

  return {
    project_requirements: content,
  };
}

/**
 * Check if prompt parts folder exists for a project
 */
export async function promptPartsExist(projectDir: string): Promise<boolean> {
  const promptsDir = path.join(projectDir, WRITE_DRAFT_PROMPTS_DIR);
  const filePath = path.join(promptsDir, PROMPT_FILE);
  return fileExists(filePath);
}

/**
 * Get the path to the prompts directory for a project
 */
export function getPromptsDir(projectDir: string): string {
  return path.join(projectDir, WRITE_DRAFT_PROMPTS_DIR);
}

/**
 * Get the path to the prompt file for a project
 */
export function getRequirementsFile(projectDir: string): string {
  return path.join(projectDir, WRITE_DRAFT_PROMPTS_DIR, PROMPT_FILE);
}

/**
 * Initialize prompts directory with default template from local bundled file
 *
 * Copies default config/actions/write_draft/custom.md from CLI's bundled templates.
 *
 * @param projectDir - Absolute path to the project directory
 */
export async function initializePromptTemplates(
  projectDir: string
): Promise<void> {
  const promptsDir = path.join(projectDir, WRITE_DRAFT_PROMPTS_DIR);
  const targetPath = path.join(promptsDir, PROMPT_FILE);

  // Ensure target directory exists
  await fs.mkdir(promptsDir, { recursive: true });

  // Only write if target doesn't exist
  if (await fileExists(targetPath)) {
    return;
  }

  // Read from local bundled template
  const templatePath = path.join(__dirname, '..', 'config', 'actions', 'write_draft', 'custom.md');
  const template = await fs.readFile(templatePath, 'utf-8');

  await fs.writeFile(targetPath, template);

  // Write README.md for write_draft config if it doesn't exist
  const writeDraftReadmePath = path.join(promptsDir, 'README.md');
  if (!(await fileExists(writeDraftReadmePath))) {
    const readmeSrc = path.join(__dirname, '..', 'config', 'actions', 'write_draft', 'README.md');
    try {
      const readme = await fs.readFile(readmeSrc, 'utf-8');
      await fs.writeFile(writeDraftReadmePath, readme);
    } catch { /* bundled README not found — skip */ }
  }

  // Write README.md for pipelines config if it doesn't exist
  const pipelinesDir = path.join(projectDir, 'config', 'pipelines');
  await fs.mkdir(pipelinesDir, { recursive: true });
  const pipelinesReadmePath = path.join(pipelinesDir, 'README.md');
  if (!(await fileExists(pipelinesReadmePath))) {
    const readmeSrc = path.join(__dirname, '..', 'config', 'pipelines', 'README.md');
    try {
      const readme = await fs.readFile(readmeSrc, 'utf-8');
      await fs.writeFile(pipelinesReadmePath, readme);
    } catch { /* bundled README not found — skip */ }
  }
}

/**
 * Load section-specific custom.md if it exists, otherwise return null.
 * Section = first path segment of articlePath (e.g., "checklist" from "checklist/resume-review")
 */
export async function loadSectionCustomContent(
  projectDir: string,
  actionName: string,
  articlePath: string
): Promise<string | null> {
  const section = articlePath.split('/')[0];
  if (!section) return null;
  const sectionPath = path.join(projectDir, 'config', 'actions', actionName, section, 'custom.md');
  try {
    const content = (await fs.readFile(sectionPath, 'utf-8')).trim();
    return content || null;
  } catch {
    return null;
  }
}

/**
 * Merge branding defaults from local bundled template into project config
 *
 * Reads the default project template (with branding defaults) and merges
 * the branding section into the existing project's index.json.
 *
 * @param projectDir - Absolute path to the project directory
 */
export async function mergeProjectTemplateDefaults(
  projectDir: string,
  options?: { illustrationStyle?: string; branding?: any }
): Promise<void> {
  const indexPath = path.join(projectDir, 'index.json');

  // Read existing project config
  let existingConfig: Record<string, unknown> = {};
  try {
    const content = await fs.readFile(indexPath, 'utf-8');
    existingConfig = JSON.parse(content);
  } catch {
    // File doesn't exist or invalid JSON - will be created
  }

  // Load local bundled project template
  const template = await import('../config/templates/project/config/index.json');

  // Deep-clone and substitute placeholders
  const projectName = (existingConfig.title as string) || '';
  const now = new Date().toISOString();
  const cloned = JSON.parse(
    JSON.stringify(template)
      .replace(/\{\{name\}\}/g, projectName)
      .replace(/\{\{date\}\}/g, now)
  );

  if (options?.branding) {
    // Use AI-generated branding directly
    existingConfig.branding = options.branding;
  } else if (cloned.branding && !existingConfig.branding) {
    // Fall back to template defaults (existing behavior)
    existingConfig.branding = cloned.branding;
    if (options?.illustrationStyle) {
      existingConfig.branding = { ...existingConfig.branding as object };
      (existingConfig.branding as any).illustration_style = options.illustrationStyle;
    }
  }

  // Write merged config back
  await fs.writeFile(indexPath, JSON.stringify(existingConfig, null, 2) + '\n');
}
