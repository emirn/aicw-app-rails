/**
 * Pipeline Verify - Verify pipeline state & applied actions
 *
 * Scans articles and compares applied_actions vs expected actions
 * for their last_pipeline. Reports mismatches and optionally fixes
 * by reverting last_pipeline to predecessor.
 */

import path from 'path';
import { readFileSync, existsSync } from 'fs';
import { scanContentFolder, updateArticleMeta } from './folder-manager';
import { getProjectPaths } from '../config/user-paths';
import { IArticleFolder } from '@blogpostgen/types';

/** Pipeline config as read from pipelines.json */
interface PipelineAction {
  action: string;
}

interface PipelineEntry {
  description: string;
  needsProject: boolean;
  needsFileInput: boolean;
  articleFilter: {
    last_pipeline: string | null;
  };
  actions: PipelineAction[];
}

interface PipelinesConfig {
  publishableFilter: string;
  pipelines: Record<string, PipelineEntry>;
}

/** Result for a single article verification */
export interface ArticleVerifyResult {
  articlePath: string;
  absolutePath: string;
  lastPipeline: string;
  expectedActions: string[];
  appliedActions: string[];
  missingActions: string[];
}

/** Summary of verification for a project */
export interface VerifyProjectResult {
  totalArticles: number;
  validArticles: number;
  invalidArticles: number;
  results: ArticleVerifyResult[];
}

/**
 * Load pipelines.json from sgen config directory
 */
export function loadPipelinesConfig(): PipelinesConfig {
  const configPath = path.resolve(__dirname, '..', '..', '..', 'sgen', 'config', 'pipelines.json');

  if (!existsSync(configPath)) {
    throw new Error(
      `pipelines.json not found at: ${configPath}\n` +
      `Expected location: apps/sgen/config/pipelines.json`
    );
  }

  const raw = readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as PipelinesConfig;
}

/**
 * Build map of pipeline name -> list of action names
 */
export function buildPipelineActionsMap(config: PipelinesConfig): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const [name, pipeline] of Object.entries(config.pipelines)) {
    map.set(name, pipeline.actions.map(a => a.action));
  }

  return map;
}

/**
 * Build reverse map: pipeline name -> its predecessor (what articleFilter.last_pipeline expects)
 *
 * e.g. enhance requires last_pipeline="generate", so reverse["enhance"] = "generate"
 *      generate requires last_pipeline=null, so reverse["generate"] = null
 */
export function buildReverseMap(config: PipelinesConfig): Map<string, string | null> {
  const map = new Map<string, string | null>();

  for (const [name, pipeline] of Object.entries(config.pipelines)) {
    map.set(name, pipeline.articleFilter.last_pipeline);
  }

  return map;
}

/**
 * Verify all articles in a project against their pipeline's expected actions
 */
export async function verifyProject(projectName: string): Promise<VerifyProjectResult> {
  const config = loadPipelinesConfig();
  const actionsMap = buildPipelineActionsMap(config);
  const projectPaths = getProjectPaths(projectName);

  const articles = await scanContentFolder(projectPaths.drafts);

  const results: ArticleVerifyResult[] = [];
  let validCount = 0;

  for (const article of articles) {
    const lastPipeline = article.meta.last_pipeline ?? null;

    // Skip seed articles (no pipeline assigned)
    if (lastPipeline === null) {
      validCount++;
      continue;
    }

    const expectedActions = actionsMap.get(lastPipeline);

    if (!expectedActions) {
      // Unknown pipeline - log warning but skip
      console.warn(`Warning: Unknown pipeline "${lastPipeline}" for article: ${article.path}`);
      continue;
    }

    const appliedActions = (article.meta as any).applied_actions || [];
    const missingActions = expectedActions.filter(a => !appliedActions.includes(a));

    if (missingActions.length > 0) {
      results.push({
        articlePath: article.path,
        absolutePath: article.absolutePath,
        lastPipeline,
        expectedActions,
        appliedActions,
        missingActions,
      });
    } else {
      validCount++;
    }
  }

  return {
    totalArticles: articles.length,
    validArticles: validCount,
    invalidArticles: results.length,
    results,
  };
}

/**
 * Fix articles by reverting last_pipeline to its predecessor.
 * Does NOT touch applied_actions - the pipeline's skip mechanism handles already-done actions.
 */
export async function fixArticles(
  results: ArticleVerifyResult[],
  projectName: string
): Promise<number> {
  const config = loadPipelinesConfig();
  const reverseMap = buildReverseMap(config);

  let fixedCount = 0;

  for (const result of results) {
    const predecessor = reverseMap.get(result.lastPipeline);

    if (predecessor === undefined) {
      console.warn(`Warning: No predecessor found for pipeline "${result.lastPipeline}", skipping: ${result.articlePath}`);
      continue;
    }

    await updateArticleMeta(result.absolutePath, {
      last_pipeline: predecessor,
    } as any);

    fixedCount++;
  }

  return fixedCount;
}
