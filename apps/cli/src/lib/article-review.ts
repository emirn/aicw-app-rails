/**
 * Article Review Module
 *
 * Human review workflow: open articles in $EDITOR, mark as reviewed.
 * Supports multiple reviewers with persistent IDs stored in project config.
 */

import { spawnSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import * as path from 'path';
import { IReviewer, IReviewEntry, IArticleFolder } from '@blogpostgen/types';
import { USER_TMP_DIR } from '../config/user-paths';
import { loadProjectConfig, updateProjectConfig } from './project-config';
import { getArticles } from './path-resolver';
import { readArticle, readArticleMeta, saveArticleWithPipeline, updateArticleMeta, addAppliedAction, addCostEntry } from './folder-manager';
import { promptInput } from './interactive-prompts';
import type { ResolvedPath } from './path-resolver';

/**
 * Slugify a name for use as reviewer ID
 * e.g. "John Doe" → "john-doe"
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Select or create a reviewer from the project config.
 *
 * @param projectDir - Absolute path to project root
 * @returns Selected reviewer, or null if cancelled
 */
export async function selectReviewer(projectDir: string): Promise<IReviewer | null> {
  const config = await loadProjectConfig(projectDir);
  const reviewers = config?.reviewers || [];

  console.error('\n=== Select Reviewer ===\n');
  console.error('  0. [Add new reviewer]');
  for (let i = 0; i < reviewers.length; i++) {
    console.error(`  ${i + 1}. ${reviewers[i].name} (${reviewers[i].url})`);
  }
  console.error('');

  const answer = await promptInput("Enter number or 'q' to quit");
  if (!answer || answer.trim().toLowerCase() === 'q') {
    return null;
  }

  const num = parseInt(answer.trim(), 10);

  if (num === 0) {
    // Add new reviewer
    const name = await promptInput('Reviewer name');
    if (!name) return null;

    const url = await promptInput('Reviewer URL (e.g. https://example.com)');
    if (!url) return null;

    const id = slugify(name);
    const newReviewer: IReviewer = { id, name, url };

    const updatedReviewers = [...reviewers, newReviewer];
    await updateProjectConfig(projectDir, { reviewers: updatedReviewers });

    console.error(`  Added reviewer: ${name} (${id})\n`);
    return newReviewer;
  }

  if (num >= 1 && num <= reviewers.length) {
    return reviewers[num - 1];
  }

  console.error('  Invalid selection.\n');
  return null;
}

/**
 * Get articles eligible for review.
 * Eligible = last_pipeline starts with 'enhance' AND review_by_user not yet applied.
 *
 * @param resolved - Resolved project path
 * @returns Filtered and sorted articles
 */
export async function getReviewableArticles(resolved: ResolvedPath): Promise<IArticleFolder[]> {
  const allArticles = await getArticles(resolved);

  return allArticles
    .filter(a => {
      const pipeline = a.meta.last_pipeline;
      if (!pipeline || !pipeline.startsWith('enhance')) return false;
      if (a.meta.applied_actions?.includes('review_by_user')) return false;
      return true;
    })
    .sort((a, b) => new Date(a.meta.created_at).getTime() - new Date(b.meta.created_at).getTime());
}

/**
 * Open content in $EDITOR and return the result.
 * Synchronous — blocks until editor closes.
 *
 * @param content - Article markdown content
 * @param articleSlug - Used for temp filename
 * @returns Whether content changed and the new content
 */
export function openInEditor(content: string, articleSlug: string): { changed: boolean; newContent: string } {
  const safeSlug = articleSlug.replace(/[^a-z0-9_-]/gi, '_');
  const tmpFile = path.join(USER_TMP_DIR, `review-${safeSlug}.md`);

  writeFileSync(tmpFile, content, 'utf-8');

  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
  const result = spawnSync(editor, [tmpFile], { stdio: 'inherit', shell: true });

  if (result.status !== 0) {
    try { unlinkSync(tmpFile); } catch {}
    return { changed: false, newContent: content };
  }

  const newContent = readFileSync(tmpFile, 'utf-8');
  try { unlinkSync(tmpFile); } catch {}

  return {
    changed: newContent !== content,
    newContent,
  };
}

/**
 * Review a single article: open in editor, save changes, update metadata.
 *
 * @param folderPath - Absolute path to article folder
 * @param reviewer - The reviewer performing the review
 * @returns Whether the content was changed
 */
export async function reviewArticle(
  folderPath: string,
  reviewer: IReviewer
): Promise<{ changed: boolean }> {
  const content = await readArticle(folderPath);
  if (!content) {
    console.error(`  Warning: No content found in ${folderPath}, skipping.`);
    return { changed: false };
  }

  const slug = path.basename(folderPath);
  const { changed, newContent } = openInEditor(content, slug);

  const meta = await readArticleMeta(folderPath);
  if (!meta) {
    console.error(`  Warning: No metadata found in ${folderPath}, skipping.`);
    return { changed: false };
  }

  const newEntry: IReviewEntry = {
    reviewer_id: reviewer.id,
    reviewer_name: reviewer.name,
    reviewer_url: reviewer.url,
    reviewed_at: new Date().toISOString(),
  };

  const updatedReviewedBy = [newEntry, ...(meta.reviewed_by || [])];

  if (changed) {
    await saveArticleWithPipeline(folderPath, newContent, null, 'review', { reviewed_by: updatedReviewedBy });
  } else {
    await updateArticleMeta(folderPath, { reviewed_by: updatedReviewedBy });
  }

  await addAppliedAction(folderPath, 'review_by_user');
  await addCostEntry(folderPath, 'review_by_user', 0);

  return { changed };
}
