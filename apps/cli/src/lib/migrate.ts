/**
 * Migration utilities for cleaning up deprecated fields and migrating file formats
 *
 * Current migration: meta.json + content.md → index.json (unified format)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { IArticle, META_FILE, PROJECT_CONFIG_FILE, INDEX_FILE, CONTENT_OVERRIDE_FILE } from '@blogpostgen/types';
import { getProjectPaths } from '../config/user-paths';
import { UnifiedSerializer, migrateArticleFolder, migrateProjectFolder, isOldArticleFormat, isOldProjectFormat, isUnifiedFormat } from './unified-serializer';
import { scanContentFolder } from './folder-manager';

/** JSON indentation constant */
const JSON_INDENT_META = 2;

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
