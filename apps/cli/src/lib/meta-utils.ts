/**
 * Metadata utilities for folder-based plan architecture
 *
 * Uses JSON format for metadata files with YAML fallback for legacy migration.
 * Replaces yaml-utils.ts with format-agnostic function names.
 */

import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { IArticle } from '@blogpostgen/types';

/** Regex to parse Markdown frontmatter (---\n...\n---) - for legacy YAML reading */
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

/** JSON indentation for pretty printing */
const JSON_INDENT = 2;

/**
 * Read metadata from JSON file (with YAML fallback for legacy migration)
 *
 * Tries JSON first, then falls back to legacy YAML frontmatter format (.md).
 *
 * @param filePath - Absolute path to the .json file
 * @returns Parsed object or null if file doesn't exist
 */
export async function readMeta<T>(filePath: string): Promise<T | null> {
  // Try JSON first
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      // JSON parse error - try to provide better error message
      if (err instanceof SyntaxError) {
        throw new Error(`Invalid JSON in ${filePath}: ${err.message}`);
      }
      throw err;
    }
  }

  // Fallback to legacy YAML (.md extension with frontmatter)
  const legacyPath = filePath.replace(/\.json$/, '.md');
  try {
    const content = await fs.readFile(legacyPath, 'utf-8');
    const match = content.match(FRONTMATTER_REGEX);
    if (match) {
      return yaml.load(match[1]) as T;
    }
    // File exists but no frontmatter
    throw new Error(`Invalid format in ${legacyPath}: frontmatter (---) delimiters required`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }

  return null;
}

/**
 * Write metadata to JSON file with pretty printing
 *
 * @param filePath - Absolute path to the .json file
 * @param data - Object to serialize
 */
export async function writeMeta<T>(filePath: string, data: T): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, JSON_INDENT) + '\n', 'utf-8');
}

/**
 * Check if a metadata file exists (JSON or legacy YAML)
 *
 * @param filePath - Absolute path to the JSON file
 */
export async function metaExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    // Try legacy path
    const legacyPath = filePath.replace(/\.json$/, '.md');
    try {
      await fs.access(legacyPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Update metadata (read-modify-write)
 *
 * @param filePath - Absolute path to the JSON file
 * @param updates - Partial object with fields to update
 */
export async function updateMeta<T extends object>(
  filePath: string,
  updates: Partial<T>
): Promise<T> {
  const existing = await readMeta<T>(filePath) || {} as T;
  const merged = { ...existing, ...updates } as T;
  await writeMeta(filePath, merged);
  return merged;
}

/**
 * Write article metadata to JSON file, removing deprecated fields
 *
 * @param filePath - Absolute path to the meta.json file
 * @param data - Article metadata to write
 */
export async function writeArticleMeta(
  filePath: string,
  data: IArticle
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Remove deprecated fields if present
  const cleanData = { ...data };
  delete (cleanData as any).status;
  delete (cleanData as any).last_action;

  await fs.writeFile(filePath, JSON.stringify(cleanData, null, JSON_INDENT) + '\n', 'utf-8');
}

/**
 * Update article metadata in JSON file (merge)
 *
 * @param filePath - Absolute path to the meta.json file
 * @param updates - Partial metadata to update
 */
export async function updateArticleMeta(
  filePath: string,
  updates: Partial<IArticle>
): Promise<IArticle> {
  const existing = await readMeta<IArticle>(filePath) || {} as IArticle;
  const merged = { ...existing, ...updates } as IArticle;
  await writeArticleMeta(filePath, merged);
  return merged;
}

// ============================================================================
// Legacy YAML functions (kept for backwards compatibility during transition)
// ============================================================================

/**
 * @deprecated Use readMeta instead - kept for compatibility during migration
 */
export async function readYaml<T>(filePath: string): Promise<T | null> {
  return readMeta<T>(filePath);
}

/**
 * @deprecated Use writeMeta instead - kept for compatibility during migration
 */
export async function writeYaml<T>(filePath: string, data: T): Promise<void> {
  return writeMeta(filePath, data);
}

/**
 * @deprecated Use metaExists instead - kept for compatibility during migration
 */
export async function yamlExists(filePath: string): Promise<boolean> {
  return metaExists(filePath);
}

/**
 * @deprecated Use updateMeta instead - kept for compatibility during migration
 */
export async function updateYaml<T extends object>(
  filePath: string,
  updates: Partial<T>
): Promise<T> {
  return updateMeta(filePath, updates);
}

/**
 * @deprecated Use writeArticleMeta instead - kept for compatibility during migration
 */
export async function writeArticleMetaYaml(
  filePath: string,
  data: IArticle
): Promise<void> {
  return writeArticleMeta(filePath, data);
}

/**
 * @deprecated Use updateArticleMeta instead - kept for compatibility during migration
 */
export async function updateArticleMetaYaml(
  filePath: string,
  updates: Partial<IArticle>
): Promise<IArticle> {
  return updateArticleMeta(filePath, updates);
}
