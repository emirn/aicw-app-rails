/**
 * Assets Cleanup - Find and remove unreferenced article assets
 *
 * Scans article folders, finds asset files not referenced anywhere
 * in index.json, and supports interactive removal.
 * Also detects legacy "index" field in index.json files.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { scanContentFolder } from './folder-manager';
import { getProjectPaths } from '../config/user-paths';

export interface OrphanedAsset {
  articlePath: string;       // relative article path (e.g. "blog/ai-for-lawyers-guide")
  fileName: string;          // e.g. "aba-opinion-512-framework.webp"
  absolutePath: string;      // full filesystem path to the file
  assetsDir: string;         // absolute path to article's assets/ folder
  assetRelativePath: string; // e.g. "/assets/blog/ai-for-lawyers-guide/file.webp"
  size: number;              // bytes
}

export interface CleanupResult {
  totalArticles: number;
  articlesScanned: number;   // articles that have an assets/ subfolder
  articlesWithOrphans: number;
  orphanedAssets: OrphanedAsset[];
  totalOrphanedBytes: number;
}

export async function findOrphanedAssets(projectName: string): Promise<CleanupResult> {
  const projectPaths = getProjectPaths(projectName);
  const articles = await scanContentFolder(projectPaths.drafts);

  const orphaned: OrphanedAsset[] = [];
  let articlesScanned = 0;
  let articlesWithOrphans = 0;

  for (const article of articles) {
    const assetsDir = path.join(article.absolutePath, 'assets');

    // Skip articles with no assets/ subfolder
    if (!await dirExists(assetsDir)) continue;
    articlesScanned++;

    // 1. Collect all files in assets/ recursively
    const assetFiles = await listFilesRecursive(assetsDir);
    if (assetFiles.length === 0) continue;

    // 2. Read the raw index.json and stringify for substring matching
    //    This catches ALL references regardless of format (markdown, HTML, paths, etc.)
    const indexPath = path.join(article.absolutePath, 'index.json');
    const jsonString = await fs.readFile(indexPath, 'utf-8');

    // 3. Compare: any file whose name doesn't appear anywhere in the JSON is orphaned
    let hasOrphans = false;
    for (const file of assetFiles) {
      if (!jsonString.includes(file.name)) {
        const relativePath = path.relative(assetsDir, file.absolutePath);
        orphaned.push({
          articlePath: article.path,
          fileName: file.name,
          absolutePath: file.absolutePath,
          assetsDir,
          assetRelativePath: '/assets/' + relativePath,
          size: file.size,
        });
        hasOrphans = true;
      }
    }
    if (hasOrphans) articlesWithOrphans++;
  }

  return {
    totalArticles: articles.length,
    articlesScanned,
    articlesWithOrphans,
    orphanedAssets: orphaned,
    totalOrphanedBytes: orphaned.reduce((sum, a) => sum + a.size, 0),
  };
}

export async function removeAssets(assets: OrphanedAsset[]): Promise<number> {
  let removed = 0;
  for (const asset of assets) {
    await fs.unlink(asset.absolutePath);
    removed++;
  }
  return removed;
}

// --- Legacy "index" field cleanup ---

export interface LegacyFieldArticle {
  articlePath: string;
  absolutePath: string;
  action: 'remove_index' | 'rename_index_to_content';
}

export async function findLegacyIndexFields(projectName: string): Promise<LegacyFieldArticle[]> {
  const projectPaths = getProjectPaths(projectName);
  const articles = await scanContentFolder(projectPaths.drafts);
  const results: LegacyFieldArticle[] = [];

  for (const article of articles) {
    const indexPath = path.join(article.absolutePath, 'index.json');
    const raw = JSON.parse(await fs.readFile(indexPath, 'utf-8'));

    if ('index' in raw && 'content' in raw) {
      results.push({ articlePath: article.path, absolutePath: article.absolutePath, action: 'remove_index' });
    } else if ('index' in raw && !('content' in raw)) {
      results.push({ articlePath: article.path, absolutePath: article.absolutePath, action: 'rename_index_to_content' });
    }
  }
  return results;
}

export async function fixLegacyIndexFields(articles: LegacyFieldArticle[]): Promise<number> {
  let fixed = 0;
  for (const article of articles) {
    const indexPath = path.join(article.absolutePath, 'index.json');
    const raw = JSON.parse(await fs.readFile(indexPath, 'utf-8'));

    if (article.action === 'remove_index') {
      delete raw.index;
    } else {
      raw.content = raw.index;
      delete raw.index;
    }

    await fs.writeFile(indexPath, JSON.stringify(raw, null, 2) + '\n');
    fixed++;
  }
  return fixed;
}

// --- helpers ---

async function dirExists(p: string): Promise<boolean> {
  try { return (await fs.stat(p)).isDirectory(); }
  catch { return false; }
}

interface FileEntry { name: string; absolutePath: string; size: number; }

async function listFilesRecursive(dir: string): Promise<FileEntry[]> {
  const results: FileEntry[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listFilesRecursive(full));
    } else if (!entry.name.startsWith('.')) {
      const stat = await fs.stat(full);
      results.push({ name: entry.name, absolutePath: full, size: stat.size });
    }
  }
  return results;
}
