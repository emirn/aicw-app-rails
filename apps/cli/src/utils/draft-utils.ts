import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { getProjectPaths } from '../config/user-paths';
import { ContentPlanItem } from '../types';

/**
 * Draft file metadata (stored in YAML frontmatter)
 */
export interface DraftMetadata {
  id: string;
  path: string;
  title: string;
  description: string;
  keywords: string;
  target_words: number;
  priority: number;
  search_intent: string;
  funnel_stage: string;
  status: 'pending' | 'processing' | 'completed';
  created_at: string;
}

/**
 * Parsed draft file
 */
export interface Draft {
  filepath: string;
  filename: string;
  metadata: DraftMetadata;
  seedContent: string;
}

/**
 * Parse a draft markdown file with YAML frontmatter
 */
export async function parseDraftFile(filepath: string): Promise<Draft> {
  const content = await fs.readFile(filepath, 'utf-8');
  const { data, content: seedContent } = matter(content);

  return {
    filepath,
    filename: path.basename(filepath),
    metadata: data as DraftMetadata,
    seedContent: seedContent.trim()
  };
}

/**
 * Save a draft file with YAML frontmatter
 */
export async function saveDraftFile(
  filepath: string,
  metadata: DraftMetadata,
  seedContent: string = ''
): Promise<void> {
  const content = matter.stringify(seedContent, metadata);
  await fs.writeFile(filepath, content, 'utf-8');
}

/**
 * Create draft metadata from a content plan item
 */
export function planItemToDraftMetadata(item: ContentPlanItem, index: number): DraftMetadata {
  return {
    id: item.id || `draft-${index + 1}`,
    path: item.path,
    title: item.title,
    description: item.description || '',
    keywords: Array.isArray(item.target_keywords)
      ? item.target_keywords.join(', ')
      : (item.target_keywords || ''),
    target_words: item.target_words || 2000,
    priority: item.priority || 2,
    search_intent: item.search_intent || 'informational',
    funnel_stage: item.funnel_stage || 'top',
    status: 'pending',
    created_at: new Date().toISOString()
  };
}

/**
 * List all pending drafts in a project
 */
export async function listDrafts(projectName: string): Promise<Draft[]> {
  const paths = getProjectPaths(projectName);
  const draftsDir = paths.drafts;

  if (!existsSync(draftsDir)) {
    return [];
  }

  const entries = await fs.readdir(draftsDir, { withFileTypes: true });
  const drafts: Draft[] = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      try {
        const draft = await parseDraftFile(path.join(draftsDir, entry.name));
        if (draft.metadata.status !== 'completed') {
          drafts.push(draft);
        }
      } catch (error) {
        // Skip invalid draft files
        console.error(`Warning: Could not parse draft ${entry.name}:`, error);
      }
    }
  }

  // Sort by filename (which has numeric prefix for ordering)
  return drafts.sort((a, b) => a.filename.localeCompare(b.filename));
}

/**
 * List all drafts including completed ones
 */
export async function listAllDrafts(projectName: string): Promise<Draft[]> {
  const paths = getProjectPaths(projectName);
  const draftsDir = paths.drafts;

  if (!existsSync(draftsDir)) {
    return [];
  }

  const entries = await fs.readdir(draftsDir, { withFileTypes: true });
  const drafts: Draft[] = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      try {
        const draft = await parseDraftFile(path.join(draftsDir, entry.name));
        drafts.push(draft);
      } catch (error) {
        console.error(`Warning: Could not parse draft ${entry.name}:`, error);
      }
    }
  }

  return drafts.sort((a, b) => a.filename.localeCompare(b.filename));
}

/**
 * Move a draft to the _processed folder
 */
export async function moveDraftToProcessed(projectName: string, draftFilename: string): Promise<void> {
  const paths = getProjectPaths(projectName);
  const sourcePath = path.join(paths.drafts, draftFilename);
  const destPath = path.join(paths.draftsProcessed, draftFilename);

  if (existsSync(sourcePath)) {
    // Update status in the file before moving
    const draft = await parseDraftFile(sourcePath);
    draft.metadata.status = 'completed';
    await saveDraftFile(sourcePath, draft.metadata, draft.seedContent);

    // Move to processed folder
    await fs.rename(sourcePath, destPath);
  }
}

/**
 * Restore a draft from _processed back to drafts
 */
export async function restoreDraft(projectName: string, draftFilename: string): Promise<void> {
  const paths = getProjectPaths(projectName);
  const sourcePath = path.join(paths.draftsProcessed, draftFilename);
  const destPath = path.join(paths.drafts, draftFilename);

  if (existsSync(sourcePath)) {
    // Update status
    const draft = await parseDraftFile(sourcePath);
    draft.metadata.status = 'pending';
    await saveDraftFile(sourcePath, draft.metadata, draft.seedContent);

    // Move back to drafts
    await fs.rename(sourcePath, destPath);
  }
}

/**
 * Create a new draft file from a content plan item
 */
export async function createDraftFromPlanItem(
  projectName: string,
  item: ContentPlanItem,
  index: number
): Promise<string> {
  const paths = getProjectPaths(projectName);
  const metadata = planItemToDraftMetadata(item, index);
  const filename = `${String(index + 1).padStart(2, '0')}-${item.path}.md`;
  const filepath = path.join(paths.drafts, filename);

  await saveDraftFile(filepath, metadata, '');
  return filepath;
}

/**
 * Get the count of pending drafts
 */
export async function getPendingDraftCount(projectName: string): Promise<number> {
  const drafts = await listDrafts(projectName);
  return drafts.length;
}

/**
 * Check if a project has any drafts
 */
export async function hasDrafts(projectName: string): Promise<boolean> {
  const paths = getProjectPaths(projectName);
  if (!existsSync(paths.drafts)) {
    return false;
  }
  const entries = await fs.readdir(paths.drafts);
  return entries.some(e => e.endsWith('.md'));
}
