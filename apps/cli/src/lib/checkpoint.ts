/**
 * Checkpoint/Resume functionality
 * Saves progress after each step for recovery
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Article } from '../types';

export interface ActionResult {
  mode: string;
  tokens_used: number;
  cost_usd?: number;
  completed_at: string;
  duration_ms: number;
}

export interface Checkpoint {
  article_index: number;
  plan_item_id: string;
  plan_item_title: string;
  current_step: number;
  total_actions: number;
  article_state: Article;
  actions_completed: ActionResult[];
  started_at: string;
  last_updated: string;
  pipeline_name: string;
}

export interface GenerationProgress {
  completed_articles: string[];  // Plan item IDs that are done
  current_checkpoint?: Checkpoint;
  total_tokens: number;
  total_cost: number;
  started_at: string;
  last_updated: string;
}

/**
 * Load checkpoint for an article
 */
export async function loadCheckpoint(
  projectRoot: string,
  articleIndex: number
): Promise<Checkpoint | null> {
  const checkpointPath = path.join(projectRoot, `a${articleIndex}-checkpoint.json`);

  try {
    const content = await fs.readFile(checkpointPath, 'utf-8');
    return JSON.parse(content) as Checkpoint;
  } catch {
    return null;
  }
}

/**
 * Save checkpoint after a step
 */
export async function saveCheckpoint(
  projectRoot: string,
  checkpoint: Checkpoint
): Promise<void> {
  const checkpointPath = path.join(projectRoot, `a${checkpoint.article_index}-checkpoint.json`);
  checkpoint.last_updated = new Date().toISOString();
  await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

/**
 * Delete checkpoint (on successful completion)
 */
export async function deleteCheckpoint(
  projectRoot: string,
  articleIndex: number
): Promise<void> {
  const checkpointPath = path.join(projectRoot, `a${articleIndex}-checkpoint.json`);
  try {
    await fs.unlink(checkpointPath);
  } catch {
    // Ignore if doesn't exist
  }
}

/**
 * Load generation progress for resume
 */
export async function loadProgress(projectRoot: string): Promise<GenerationProgress | null> {
  const progressPath = path.join(projectRoot, 'generation-progress.json');

  try {
    const content = await fs.readFile(progressPath, 'utf-8');
    return JSON.parse(content) as GenerationProgress;
  } catch {
    return null;
  }
}

/**
 * Save generation progress
 */
export async function saveProgress(
  projectRoot: string,
  progress: GenerationProgress
): Promise<void> {
  const progressPath = path.join(projectRoot, 'generation-progress.json');
  progress.last_updated = new Date().toISOString();
  await fs.writeFile(progressPath, JSON.stringify(progress, null, 2));
}

/**
 * Create initial checkpoint for an article
 */
export function createCheckpoint(
  articleIndex: number,
  planItemId: string,
  planItemTitle: string,
  totalActions: number,
  pipelineName: string
): Checkpoint {
  return {
    article_index: articleIndex,
    plan_item_id: planItemId,
    plan_item_title: planItemTitle,
    current_step: 0,
    total_actions: totalActions,
    article_state: {
      id: '',
      path: '',
      title: '',
      description: '',
      keywords: '',
      content: '',
    },
    actions_completed: [],
    started_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    pipeline_name: pipelineName,
  };
}

/**
 * Update checkpoint after step completion
 */
export function updateCheckpoint(
  checkpoint: Checkpoint,
  stepResult: ActionResult,
  newArticleState: Article
): Checkpoint {
  return {
    ...checkpoint,
    current_step: checkpoint.current_step + 1,
    article_state: newArticleState,
    actions_completed: [...checkpoint.actions_completed, stepResult],
    last_updated: new Date().toISOString(),
  };
}

/**
 * Create initial generation progress
 */
export function createProgress(): GenerationProgress {
  return {
    completed_articles: [],
    total_tokens: 0,
    total_cost: 0,
    started_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
  };
}

/**
 * Check if article is already completed
 */
export function isArticleCompleted(
  progress: GenerationProgress | null,
  planItemId: string
): boolean {
  return progress?.completed_articles.includes(planItemId) ?? false;
}

/**
 * Mark article as completed in progress
 */
export function markArticleCompleted(
  progress: GenerationProgress,
  planItemId: string,
  tokens: number,
  cost: number
): GenerationProgress {
  return {
    ...progress,
    completed_articles: [...progress.completed_articles, planItemId],
    total_tokens: progress.total_tokens + tokens,
    total_cost: progress.total_cost + cost,
    current_checkpoint: undefined,
    last_updated: new Date().toISOString(),
  };
}
