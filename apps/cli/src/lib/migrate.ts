/**
 * Migration utilities for cleaning up deprecated fields and migrating file formats
 *
 * Current migration: meta.json + content.md → index.json (unified format)
 */

import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { IArticle, META_FILE, LEGACY_META_FILE, PROJECT_CONFIG_FILE, LEGACY_PROJECT_CONFIG_FILE, INDEX_FILE, CONTENT_OVERRIDE_FILE } from '@blogpostgen/types';
import { getProjectPaths } from '../config/user-paths';
import { UnifiedSerializer, migrateArticleFolder, migrateProjectFolder, isOldArticleFormat, isOldProjectFormat, isUnifiedFormat } from './unified-serializer';
import { scanContentFolder } from './folder-manager';

/** JSON indentation constant */
const JSON_INDENT_META = 2;

/**
 * Read metadata from JSON file (helper for old migrations)
 * @deprecated Use readArticleMeta from folder-manager.ts instead
 */
async function readMeta<T>(metaPath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(metaPath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Write article metadata to JSON file (helper for old migrations)
 * @deprecated Use updateArticleMeta from folder-manager.ts instead
 */
async function writeArticleMeta(metaPath: string, meta: IArticle): Promise<void> {
  // Remove deprecated fields
  const cleanMeta = { ...meta };
  delete (cleanMeta as any).status;
  delete (cleanMeta as any).last_action;

  await fs.writeFile(metaPath, JSON.stringify(cleanMeta, null, JSON_INDENT_META) + '\n', 'utf-8');
}

/** Old YAML format file (before frontmatter migration) */
const OLD_META_YML = '_meta.yml';

/** Regex to parse Markdown frontmatter (---\n...\n---) */
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

/** JSON indentation for pretty printing */
const JSON_INDENT = 2;

/**
 * Migrate project to remove deprecated status field from all articles
 * and add next actions comments
 *
 * @param projectName - Project name to migrate
 * @returns Migration result with counts
 */
export async function migrateRemoveStatusField(projectName: string): Promise<{
  total: number;
  migrated: number;
  errors: Array<{ path: string; error: string }>;
}> {
  const paths = getProjectPaths(projectName);
  const articles = await scanContentFolder(paths.content);

  let migrated = 0;
  const errors: Array<{ path: string; error: string }> = [];

  for (const article of articles) {
    try {
      const metaPath = path.join(article.absolutePath, META_FILE);
      const meta = await readMeta<IArticle>(metaPath);

      if (!meta) {
        errors.push({ path: article.path, error: 'Could not read metadata' });
        continue;
      }

      // Check if migration is needed (has status field)
      const hasStatusField = 'status' in meta;

      // Always rewrite to get the next actions comment and remove status
      await writeArticleMeta(metaPath, meta);
      migrated++;

      if (hasStatusField) {
        console.log(`Migrated (removed status): ${article.path}`);
      } else {
        console.log(`Updated (added comment): ${article.path}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push({ path: article.path, error: errMsg });
      console.error(`Error migrating ${article.path}: ${errMsg}`);
    }
  }

  return {
    total: articles.length,
    migrated,
    errors,
  };
}

/**
 * Run migration on all projects in the data directory
 * This is a convenience function for bulk migration
 *
 * @param projectNames - List of project names to migrate
 */
export async function migrateAllProjects(projectNames: string[]): Promise<{
  projects: Record<string, { total: number; migrated: number; errors: number }>;
  summary: { totalProjects: number; totalArticles: number; totalMigrated: number };
}> {
  const projects: Record<string, { total: number; migrated: number; errors: number }> = {};
  let totalArticles = 0;
  let totalMigrated = 0;

  for (const projectName of projectNames) {
    console.log(`\nMigrating project: ${projectName}`);
    console.log('='.repeat(50));

    try {
      const result = await migrateRemoveStatusField(projectName);
      projects[projectName] = {
        total: result.total,
        migrated: result.migrated,
        errors: result.errors.length,
      };
      totalArticles += result.total;
      totalMigrated += result.migrated;

      console.log(`Project ${projectName}: ${result.migrated}/${result.total} articles migrated`);
      if (result.errors.length > 0) {
        console.log(`  Errors: ${result.errors.length}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to migrate project ${projectName}: ${errMsg}`);
      projects[projectName] = { total: 0, migrated: 0, errors: 1 };
    }
  }

  return {
    projects,
    summary: {
      totalProjects: projectNames.length,
      totalArticles,
      totalMigrated,
    },
  };
}

/**
 * Migrate _meta.yml files to meta.md (frontmatter format)
 *
 * Recursively finds all _meta.yml files in the project content folder
 * and converts them to meta.md with frontmatter format.
 *
 * @param projectName - Project name to migrate
 * @returns Migration result with counts
 */
export async function migrateMetaYmlToMd(projectName: string): Promise<{
  total: number;
  renamed: number;
  errors: Array<{ path: string; error: string }>;
}> {
  const paths = getProjectPaths(projectName);
  const errors: Array<{ path: string; error: string }> = [];
  let total = 0;
  let renamed = 0;

  async function scanDir(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '_history') {
        await scanDir(fullPath);
      } else if (entry.isFile() && entry.name === OLD_META_YML) {
        total++;
        const newPath = path.join(dir, LEGACY_META_FILE);
        try {
          // Read old YAML content and write as frontmatter
          const content = await fs.readFile(fullPath, 'utf-8');
          const frontmatterContent = `---\n${content}---\n`;
          await fs.writeFile(newPath, frontmatterContent, 'utf-8');
          await fs.unlink(fullPath);
          renamed++;
          console.log(`Migrated: ${fullPath} → ${LEGACY_META_FILE}`);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push({ path: fullPath, error: errMsg });
          console.error(`Error renaming ${fullPath}: ${errMsg}`);
        }
      }
    }
  }

  // Scan both drafts and ready folders
  await scanDir(paths.content);
  const readyDir = path.join(paths.root, 'ready');
  await scanDir(readyDir);

  return { total, renamed, errors };
}

/**
 * Migrate article metadata from YAML (meta.md) to JSON (meta.json)
 *
 * Recursively finds all meta.md files and converts them to meta.json.
 * The original meta.md files are deleted after successful conversion.
 *
 * @param projectName - Project name to migrate
 * @returns Migration result with counts
 */
export async function migrateMetaMdToJson(projectName: string): Promise<{
  total: number;
  migrated: number;
  errors: Array<{ path: string; error: string }>;
}> {
  const paths = getProjectPaths(projectName);
  let total = 0;
  let migrated = 0;
  const errors: Array<{ path: string; error: string }> = [];

  async function scanDir(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '_history') {
        await scanDir(fullPath);
      } else if (entry.isFile() && entry.name === LEGACY_META_FILE) {
        total++;
        try {
          // Read YAML frontmatter
          const content = await fs.readFile(fullPath, 'utf-8');
          const match = content.match(FRONTMATTER_REGEX);
          if (!match) {
            throw new Error('Invalid frontmatter format');
          }

          const data = yaml.load(match[1]) as IArticle;

          // Remove deprecated fields
          delete (data as any).status;
          delete (data as any).last_action;

          // Write JSON
          const jsonPath = fullPath.replace(/\.md$/, '.json');
          await fs.writeFile(jsonPath, JSON.stringify(data, null, JSON_INDENT) + '\n', 'utf-8');

          // Delete old file
          await fs.unlink(fullPath);
          migrated++;
          console.log(`Migrated: ${fullPath} → meta.json`);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push({ path: fullPath, error: errMsg });
          console.error(`Error migrating ${fullPath}: ${errMsg}`);
        }
      }
    }
  }

  // Scan drafts folder
  await scanDir(paths.content);

  return { total, migrated, errors };
}

/**
 * Migrate project config from YAML (_project.yaml) to JSON (_project.json)
 *
 * @param projectName - Project name to migrate
 * @returns Migration result
 */
export async function migrateProjectYamlToJson(projectName: string): Promise<{
  migrated: boolean;
  error?: string;
}> {
  const paths = getProjectPaths(projectName);
  const legacyPath = path.join(paths.root, LEGACY_PROJECT_CONFIG_FILE);
  const jsonPath = path.join(paths.root, PROJECT_CONFIG_FILE);

  try {
    // Check if legacy YAML exists
    try {
      await fs.access(legacyPath);
    } catch {
      // No legacy file, nothing to migrate
      return { migrated: false };
    }

    // Check if JSON already exists
    try {
      await fs.access(jsonPath);
      // JSON exists, skip migration to avoid overwriting
      console.log(`Skipping ${projectName}: ${PROJECT_CONFIG_FILE} already exists`);
      return { migrated: false };
    } catch {
      // Good, JSON doesn't exist
    }

    // Read YAML and write JSON
    const content = await fs.readFile(legacyPath, 'utf-8');
    const data = yaml.load(content);

    await fs.writeFile(jsonPath, JSON.stringify(data, null, JSON_INDENT) + '\n', 'utf-8');
    await fs.unlink(legacyPath);

    console.log(`Migrated: ${legacyPath} → ${PROJECT_CONFIG_FILE}`);
    return { migrated: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`Error migrating ${projectName} project config: ${errMsg}`);
    return { migrated: false, error: errMsg };
  }
}

/**
 * Migrate all files in a project from YAML to JSON format
 *
 * This includes:
 * - meta.md → meta.json (article metadata)
 * - _project.yaml → _project.json (project config)
 *
 * @param projectName - Project name to migrate
 */
export async function migrateProjectToJson(projectName: string): Promise<{
  metaFiles: { total: number; migrated: number; errors: number };
  projectConfig: { migrated: boolean; error?: string };
}> {
  console.log(`\nMigrating project to JSON: ${projectName}`);
  console.log('='.repeat(50));

  // Migrate article metadata
  const metaResult = await migrateMetaMdToJson(projectName);
  console.log(`Meta files: ${metaResult.migrated}/${metaResult.total} migrated`);

  // Migrate project config
  const configResult = await migrateProjectYamlToJson(projectName);

  return {
    metaFiles: {
      total: metaResult.total,
      migrated: metaResult.migrated,
      errors: metaResult.errors.length,
    },
    projectConfig: configResult,
  };
}

// ============================================================================
// Unified Format Migration (meta.json → index.json)
// ============================================================================

/**
 * Migration result for unified format
 */
export interface UnifiedMigrationResult {
  articles: {
    total: number;
    migrated: number;
    skipped: number;
    errors: Array<{ path: string; error: string }>;
  };
  project: {
    migrated: boolean;
    error?: string;
  };
}

/**
 * Migrate a project to the unified format (index.json)
 *
 * This migrates:
 * - Article folders: meta.json + content.md → index.json (with content.md as override)
 * - Project config: _project.json → index.json
 *
 * @param projectName - Project name to migrate
 * @returns Migration result with counts
 */
export async function migrateToUnifiedFormat(projectName: string): Promise<UnifiedMigrationResult> {
  const paths = getProjectPaths(projectName);

  console.log(`\nMigrating project to unified format: ${projectName}`);
  console.log('='.repeat(50));

  const result: UnifiedMigrationResult = {
    articles: {
      total: 0,
      migrated: 0,
      skipped: 0,
      errors: [],
    },
    project: {
      migrated: false,
    },
  };

  // Migrate project config (_project.json → index.json)
  console.log('\nMigrating project config...');
  try {
    const projectMigrated = await migrateProjectFolder(paths.root);
    result.project.migrated = projectMigrated;
    if (projectMigrated) {
      console.log(`  Migrated: _project.json → index.json`);
    } else {
      console.log(`  Skipped: Already migrated or not found`);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    result.project.error = errMsg;
    console.error(`  Error: ${errMsg}`);
  }

  // Scan for article folders with old format
  console.log('\nMigrating article folders...');

  async function scanAndMigrate(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }

    // Check if this directory is an article folder
    if (await isOldArticleFormat(dir)) {
      result.articles.total++;
      try {
        const migrated = await migrateArticleFolder(dir);
        if (migrated) {
          result.articles.migrated++;
          const relativePath = path.relative(paths.root, dir);
          console.log(`  Migrated: ${relativePath}`);
        } else {
          result.articles.skipped++;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const relativePath = path.relative(paths.root, dir);
        result.articles.errors.push({ path: relativePath, error: errMsg });
        console.error(`  Error (${relativePath}): ${errMsg}`);
      }
      return; // Don't recurse into article folders
    }

    // Check if already in unified format
    if (await isUnifiedFormat(dir)) {
      // This is already a unified format folder, don't recurse
      return;
    }

    // Recurse into subdirectories
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '_history') {
        await scanAndMigrate(path.join(dir, entry.name));
      }
    }
  }

  // Scan drafts
  await scanAndMigrate(paths.content);

  console.log(`\nArticles: ${result.articles.migrated} migrated, ${result.articles.skipped} skipped`);
  if (result.articles.errors.length > 0) {
    console.log(`Errors: ${result.articles.errors.length}`);
  }

  return result;
}

/**
 * Check if a project needs migration to unified format
 *
 * @param projectName - Project name to check
 * @returns Object indicating what needs migration
 */
export async function checkMigrationNeeded(projectName: string): Promise<{
  projectConfig: boolean;
  articleCount: number;
}> {
  const paths = getProjectPaths(projectName);

  let projectConfig = false;
  let articleCount = 0;

  // Check project config
  if (await isOldProjectFormat(paths.root)) {
    projectConfig = true;
  }

  // Count articles in old format
  async function scanForOldFormat(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    if (await isOldArticleFormat(dir)) {
      articleCount++;
      return;
    }

    if (await isUnifiedFormat(dir)) {
      return; // Skip unified format folders
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '_history') {
        await scanForOldFormat(path.join(dir, entry.name));
      }
    }
  }

  await scanForOldFormat(paths.content);

  return { projectConfig, articleCount };
}

// ============================================================================
// FAQ and JSON-LD Extraction Migration
// ============================================================================

/**
 * Result of FAQ/JSON-LD extraction for a single article
 */
export interface ContentExtractionResult {
  faqExtracted: boolean;
  jsonldExtracted: boolean;
  error?: string;
}

/**
 * Result of content extraction migration for a project
 */
export interface ContentExtractionMigrationResult {
  total: number;
  faqMigrated: number;
  jsonldMigrated: number;
  skipped: number;
  errors: Array<{ path: string; error: string }>;
}

/**
 * Extract FAQ section from content
 *
 * FAQ section is identified by:
 * - Starts with <h2>Frequently Asked Questions</h2>
 * - Contains <details> blocks
 * - Ends before the first <script type="application/ld+json"> or end of content
 *
 * @param content - Article content string
 * @returns Object with faq HTML and remaining content, or null if no FAQ found
 */
function extractFaqFromContent(content: string): { faq: string; remainingContent: string } | null {
  const faqStart = content.indexOf('<h2>Frequently Asked Questions</h2>');
  if (faqStart === -1) {
    return null;
  }

  const afterFaq = content.substring(faqStart);

  // Find where FAQ ends: before first <script type="application/ld+json"> or end of content
  const scriptMatch = afterFaq.match(/<script[^>]*type="application\/ld\+json"[^>]*>/i);
  const faqEndOffset = scriptMatch ? afterFaq.indexOf(scriptMatch[0]) : afterFaq.length;

  const faqHtml = afterFaq.substring(0, faqEndOffset).trim();

  // Remove FAQ from content
  const remainingContent = content.substring(0, faqStart).trimEnd() +
    afterFaq.substring(faqEndOffset);

  return { faq: faqHtml, remainingContent: remainingContent.trim() };
}

/**
 * Extract all JSON-LD script blocks from content
 *
 * @param content - Article content string
 * @returns Object with jsonld scripts and remaining content, or null if no JSON-LD found
 */
function extractJsonldFromContent(content: string): { jsonld: string; remainingContent: string } | null {
  const jsonldRegex = /<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi;
  const matches = content.match(jsonldRegex);

  if (!matches || matches.length === 0) {
    return null;
  }

  const jsonldContent = matches.join('\n');

  // Remove JSON-LD from content
  const remainingContent = content.replace(jsonldRegex, '').trim();

  return { jsonld: jsonldContent, remainingContent };
}

/**
 * Migrate FAQ from content.md for a single article folder
 *
 * @param folderPath - Absolute path to article folder
 * @returns true if FAQ was extracted and migrated
 */
export async function migrateFaqFromContentFolder(folderPath: string): Promise<boolean> {
  const contentPath = path.join(folderPath, 'content.md');
  const indexPath = path.join(folderPath, 'index.json');
  const faqPath = path.join(folderPath, 'faq.md');

  // Check if index.json exists
  try {
    await fs.access(indexPath);
  } catch {
    return false; // Not a unified format folder
  }

  // Read content
  let content: string;
  try {
    content = await fs.readFile(contentPath, 'utf-8');
  } catch {
    return false; // No content file
  }

  // Extract FAQ
  const extraction = extractFaqFromContent(content);
  if (!extraction) {
    return false; // No FAQ found
  }

  // Read index.json
  const indexData = JSON.parse(await fs.readFile(indexPath, 'utf-8'));

  // Write faq.md
  await fs.writeFile(faqPath, extraction.faq, 'utf-8');

  // Update index.json with faq field
  indexData.faq = extraction.faq;
  indexData.content = extraction.remainingContent;
  await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2) + '\n', 'utf-8');

  // Update content.md
  await fs.writeFile(contentPath, extraction.remainingContent, 'utf-8');

  return true;
}

/**
 * Migrate JSON-LD from content.md for a single article folder
 *
 * @param folderPath - Absolute path to article folder
 * @returns true if JSON-LD was extracted and migrated
 */
export async function migrateJsonldFromContentFolder(folderPath: string): Promise<boolean> {
  const contentPath = path.join(folderPath, 'content.md');
  const indexPath = path.join(folderPath, 'index.json');
  const jsonldPath = path.join(folderPath, 'jsonld.md');

  // Check if index.json exists
  try {
    await fs.access(indexPath);
  } catch {
    return false; // Not a unified format folder
  }

  // Read content
  let content: string;
  try {
    content = await fs.readFile(contentPath, 'utf-8');
  } catch {
    return false; // No content file
  }

  // Extract JSON-LD
  const extraction = extractJsonldFromContent(content);
  if (!extraction) {
    return false; // No JSON-LD found
  }

  // Read index.json
  const indexData = JSON.parse(await fs.readFile(indexPath, 'utf-8'));

  // Write jsonld.md
  await fs.writeFile(jsonldPath, extraction.jsonld, 'utf-8');

  // Update index.json with jsonld field
  indexData.jsonld = extraction.jsonld;
  indexData.content = extraction.remainingContent;
  await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2) + '\n', 'utf-8');

  // Update content.md
  await fs.writeFile(contentPath, extraction.remainingContent, 'utf-8');

  return true;
}

/**
 * Migrate both FAQ and JSON-LD from content.md for a single article folder
 *
 * @param folderPath - Absolute path to article folder
 * @returns Extraction result
 */
export async function migrateContentExtractAll(folderPath: string): Promise<ContentExtractionResult> {
  const contentPath = path.join(folderPath, 'content.md');
  const indexPath = path.join(folderPath, 'index.json');
  const faqPath = path.join(folderPath, 'faq.md');
  const jsonldPath = path.join(folderPath, 'jsonld.md');

  // Check if index.json exists
  try {
    await fs.access(indexPath);
  } catch {
    return { faqExtracted: false, jsonldExtracted: false, error: 'Not a unified format folder' };
  }

  // Read content
  let content: string;
  try {
    content = await fs.readFile(contentPath, 'utf-8');
  } catch {
    return { faqExtracted: false, jsonldExtracted: false, error: 'No content file' };
  }

  // Read index.json
  const indexData = JSON.parse(await fs.readFile(indexPath, 'utf-8'));

  let faqExtracted = false;
  let jsonldExtracted = false;

  // Extract FAQ first (it comes before JSON-LD in content)
  const faqExtraction = extractFaqFromContent(content);
  if (faqExtraction) {
    await fs.writeFile(faqPath, faqExtraction.faq, 'utf-8');
    indexData.faq = faqExtraction.faq;
    content = faqExtraction.remainingContent;
    faqExtracted = true;
  }

  // Extract JSON-LD from remaining content
  const jsonldExtraction = extractJsonldFromContent(content);
  if (jsonldExtraction) {
    await fs.writeFile(jsonldPath, jsonldExtraction.jsonld, 'utf-8');
    indexData.jsonld = jsonldExtraction.jsonld;
    content = jsonldExtraction.remainingContent;
    jsonldExtracted = true;
  }

  // Update files only if something was extracted
  if (faqExtracted || jsonldExtracted) {
    indexData.content = content;
    await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2) + '\n', 'utf-8');
    await fs.writeFile(contentPath, content, 'utf-8');
  }

  return { faqExtracted, jsonldExtracted };
}

/**
 * Migrate FAQ from content for all articles in a project
 *
 * @param projectName - Project name to migrate
 * @returns Migration result
 */
export async function migrateFaqFromContentProject(projectName: string): Promise<ContentExtractionMigrationResult> {
  const paths = getProjectPaths(projectName);

  console.log(`\nMigrating FAQ from content: ${projectName}`);
  console.log('='.repeat(50));

  const result: ContentExtractionMigrationResult = {
    total: 0,
    faqMigrated: 0,
    jsonldMigrated: 0,
    skipped: 0,
    errors: [],
  };

  async function scanAndMigrate(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // Check if this is an article folder (has index.json)
    if (await isUnifiedFormat(dir)) {
      result.total++;
      try {
        const migrated = await migrateFaqFromContentFolder(dir);
        if (migrated) {
          result.faqMigrated++;
          const relativePath = path.relative(paths.root, dir);
          console.log(`  Migrated FAQ: ${relativePath}`);
        } else {
          result.skipped++;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const relativePath = path.relative(paths.root, dir);
        result.errors.push({ path: relativePath, error: errMsg });
        console.error(`  Error (${relativePath}): ${errMsg}`);
      }
      return;
    }

    // Recurse into subdirectories
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '_history') {
        await scanAndMigrate(path.join(dir, entry.name));
      }
    }
  }

  await scanAndMigrate(paths.content);

  console.log(`\nFAQ: ${result.faqMigrated} migrated, ${result.skipped} skipped`);
  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors.length}`);
  }

  return result;
}

/**
 * Migrate JSON-LD from content for all articles in a project
 *
 * @param projectName - Project name to migrate
 * @returns Migration result
 */
export async function migrateJsonldFromContentProject(projectName: string): Promise<ContentExtractionMigrationResult> {
  const paths = getProjectPaths(projectName);

  console.log(`\nMigrating JSON-LD from content: ${projectName}`);
  console.log('='.repeat(50));

  const result: ContentExtractionMigrationResult = {
    total: 0,
    faqMigrated: 0,
    jsonldMigrated: 0,
    skipped: 0,
    errors: [],
  };

  async function scanAndMigrate(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // Check if this is an article folder (has index.json)
    if (await isUnifiedFormat(dir)) {
      result.total++;
      try {
        const migrated = await migrateJsonldFromContentFolder(dir);
        if (migrated) {
          result.jsonldMigrated++;
          const relativePath = path.relative(paths.root, dir);
          console.log(`  Migrated JSON-LD: ${relativePath}`);
        } else {
          result.skipped++;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const relativePath = path.relative(paths.root, dir);
        result.errors.push({ path: relativePath, error: errMsg });
        console.error(`  Error (${relativePath}): ${errMsg}`);
      }
      return;
    }

    // Recurse into subdirectories
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '_history') {
        await scanAndMigrate(path.join(dir, entry.name));
      }
    }
  }

  await scanAndMigrate(paths.content);

  console.log(`\nJSON-LD: ${result.jsonldMigrated} migrated, ${result.skipped} skipped`);
  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors.length}`);
  }

  return result;
}

/**
 * Migrate both FAQ and JSON-LD from content for all articles in a project
 *
 * @param projectName - Project name to migrate
 * @returns Migration result
 */
export async function migrateContentExtractAllProject(projectName: string): Promise<ContentExtractionMigrationResult> {
  const paths = getProjectPaths(projectName);

  console.log(`\nMigrating FAQ and JSON-LD from content: ${projectName}`);
  console.log('='.repeat(50));

  const result: ContentExtractionMigrationResult = {
    total: 0,
    faqMigrated: 0,
    jsonldMigrated: 0,
    skipped: 0,
    errors: [],
  };

  async function scanAndMigrate(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // Check if this is an article folder (has index.json)
    if (await isUnifiedFormat(dir)) {
      result.total++;
      try {
        const extraction = await migrateContentExtractAll(dir);
        if (extraction.faqExtracted) {
          result.faqMigrated++;
        }
        if (extraction.jsonldExtracted) {
          result.jsonldMigrated++;
        }
        if (!extraction.faqExtracted && !extraction.jsonldExtracted) {
          result.skipped++;
        } else {
          const relativePath = path.relative(paths.root, dir);
          const parts = [];
          if (extraction.faqExtracted) parts.push('FAQ');
          if (extraction.jsonldExtracted) parts.push('JSON-LD');
          console.log(`  Migrated ${parts.join(' + ')}: ${relativePath}`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const relativePath = path.relative(paths.root, dir);
        result.errors.push({ path: relativePath, error: errMsg });
        console.error(`  Error (${relativePath}): ${errMsg}`);
      }
      return;
    }

    // Recurse into subdirectories
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '_history') {
        await scanAndMigrate(path.join(dir, entry.name));
      }
    }
  }

  await scanAndMigrate(paths.content);

  console.log(`\nTotal: ${result.total} articles`);
  console.log(`FAQ migrated: ${result.faqMigrated}`);
  console.log(`JSON-LD migrated: ${result.jsonldMigrated}`);
  console.log(`Skipped (no FAQ/JSON-LD): ${result.skipped}`);
  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors.length}`);
  }

  return result;
}

// ============================================================================
// Backfill published_at from updated_at
// ============================================================================

/**
 * Backfill missing published_at from updated_at for all articles in a project
 *
 * @param projectName - Project name to migrate
 * @returns Migration result with counts
 */
export async function migrateBackfillPublishedAt(projectName: string): Promise<{
  total: number;
  migrated: number;
  skipped: number;
  errors: Array<{ path: string; error: string }>;
}> {
  const paths = getProjectPaths(projectName);
  const articles = await scanContentFolder(paths.content);

  let migrated = 0;
  let skipped = 0;
  const errors: Array<{ path: string; error: string }> = [];

  for (const article of articles) {
    try {
      if (article.meta.published_at?.trim()) {
        skipped++;
        continue;
      }

      const backfillValue = article.meta.updated_at;
      if (!backfillValue) {
        errors.push({ path: article.path, error: 'No updated_at value to backfill from' });
        continue;
      }

      const serializer = new UnifiedSerializer<IArticle>(article.absolutePath);
      await serializer.update({ published_at: backfillValue } as Partial<IArticle>);
      migrated++;
      console.log(`Backfilled published_at: ${article.path}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push({ path: article.path, error: errMsg });
      console.error(`Error backfilling ${article.path}: ${errMsg}`);
    }
  }

  return {
    total: articles.length,
    migrated,
    skipped,
    errors,
  };
}
