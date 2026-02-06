/**
 * YAML parsing utilities for folder-based plan architecture
 *
 * Uses js-yaml for parsing and stringifying YAML files.
 * Meta files use Markdown frontmatter format (---\n...\n---).
 */

import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { IArticle } from '@blogpostgen/types';
import { getNextPipelines } from './workflow';

/** Regex to parse Markdown frontmatter (---\n...\n---) */
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Read and parse a YAML file with frontmatter format
 * @param filePath - Absolute path to the .md file with YAML frontmatter
 * @returns Parsed object or null if file doesn't exist
 */
export async function readYaml<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Parse frontmatter format
    const match = content.match(FRONTMATTER_REGEX);
    if (match) {
      return yaml.load(match[1]) as T;
    }

    // Frontmatter format required
    throw new Error(`Invalid format in ${filePath}: frontmatter (---) delimiters required`);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write an object to a YAML file with frontmatter format
 * @param filePath - Absolute path to the .md file
 * @param data - Object to serialize
 * @param options - YAML dump options
 */
export async function writeYaml<T>(
  filePath: string,
  data: T,
  options?: yaml.DumpOptions
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const yamlContent = yaml.dump(data, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
    ...options,
  });

  // Wrap in frontmatter format (ensure newline before closing ---)
  const content = `---\n${yamlContent.trimEnd()}\n---\n`;

  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Check if a YAML file exists
 * @param filePath - Absolute path to the YAML file
 */
export async function yamlExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse YAML content string (not from file)
 * @param content - YAML string content
 */
export function parseYaml<T>(content: string): T {
  return yaml.load(content) as T;
}

/**
 * Stringify object to YAML (not to file)
 * @param data - Object to serialize
 * @param options - YAML dump options
 */
export function stringifyYaml<T>(data: T, options?: yaml.DumpOptions): string {
  return yaml.dump(data, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
    ...options,
  });
}

/**
 * Update specific fields in a YAML file (merge)
 * @param filePath - Absolute path to the YAML file
 * @param updates - Partial object with fields to update
 */
export async function updateYaml<T extends object>(
  filePath: string,
  updates: Partial<T>
): Promise<T> {
  const existing = await readYaml<T>(filePath);
  const merged = { ...existing, ...updates } as T;
  await writeYaml(filePath, merged);
  return merged;
}

/**
 * Write article metadata to Markdown file with frontmatter and helpful comments
 *
 * Adds comments for:
 * - next pipelines above last_pipeline field
 *
 * Example output:
 *   ---
 *   # valid next pipelines: enhance, finalize
 *   last_pipeline: generate
 *   ---
 *
 * @param filePath - Absolute path to the meta.md file
 * @param data - Article metadata to write
 */
export async function writeArticleMetaYaml(
  filePath: string,
  data: IArticle
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Remove deprecated fields if present
  const cleanData = { ...data };
  delete (cleanData as any).status;
  delete (cleanData as any).last_action;

  let yamlContent = yaml.dump(cleanData, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });

  // Inject next pipelines comment before last_pipeline line
  const nextPipelines = getNextPipelines(data.last_pipeline ?? null);
  if (nextPipelines.length > 0) {
    const comment = `# valid next pipelines: ${nextPipelines.join(', ')}`;
    yamlContent = yamlContent.replace(
      /^(last_pipeline:)/m,
      `${comment}\n$1`
    );
  } else if (data.last_pipeline === 'finalize') {
    // For finalize, show that article is complete
    yamlContent = yamlContent.replace(
      /^(last_pipeline:)/m,
      `# article is finalized - no further pipelines\n$1`
    );
  }

  // Wrap in frontmatter format (ensure newline before closing ---)
  const content = `---\n${yamlContent.trimEnd()}\n---\n`;

  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Update article metadata in Markdown file (merge) with next actions comment
 *
 * @param filePath - Absolute path to the meta.md file
 * @param updates - Partial metadata to update
 */
export async function updateArticleMetaYaml(
  filePath: string,
  updates: Partial<IArticle>
): Promise<IArticle> {
  const existing = await readYaml<IArticle>(filePath);
  const merged = { ...existing, ...updates } as IArticle;
  await writeArticleMetaYaml(filePath, merged);
  return merged;
}
