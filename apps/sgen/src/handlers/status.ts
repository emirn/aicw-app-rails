/**
 * Status Handler
 *
 * Returns project or article status.
 * Read-only - returns data, no file operations.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { ActionContext, ActionExecuteResponse } from './types';

export async function handleStatus(
  context: ActionContext,
  flags: Record<string, any>,
  log: { info: Function; error: Function; warn: Function }
): Promise<ActionExecuteResponse> {
  // If no project specified, return list of projects
  if (!context.projectName) {
    return {
      success: true,
      message: 'Provide a project path to see status',
      operations: [],
      data: {
        type: 'help',
        usage: 'blogpostgen status <project-name>',
      },
    };
  }

  // If no project config found, project doesn't exist
  if (!context.projectConfig) {
    return {
      success: false,
      error: `Project not found: ${context.projectName}`,
      errorCode: 'PROJECT_NOT_FOUND',
      operations: [],
    };
  }

  // If article path specified, return article status
  if (context.articlePath && context.article) {
    log.info({ project: context.projectName, article: context.articlePath }, 'status:article');

    return {
      success: true,
      message: formatArticleStatus(context.articlePath, context.article),
      operations: [],
      data: {
        type: 'article',
        path: context.articlePath,
        article: context.article,
      },
    };
  }

  // Return project status with article summary
  const articles = context.articles || [];
  const summary = buildStatusSummary(articles);

  log.info({ project: context.projectName, total: articles.length }, 'status:project');

  return {
    success: true,
    message: formatProjectStatus(context.projectName, context.projectConfig, summary, articles),
    operations: [],
    data: {
      type: 'project',
      project: context.projectConfig,
      summary,
      articles: articles.map((a) => ({
        path: a.path,
        title: a.article.title,
        last_pipeline: a.article.last_pipeline || null,
      })),
    },
  };
}

interface StatusSummary {
  total: number;
  byPipeline: Record<string, number>;
  totalCost: number;
}

// Build next-actions map from cli-actions.json (invert validLastActions)
interface CliAction {
  name: string;
  validLastPipelines?: string[];
}

function buildNextActionsMap(): Record<string, string[]> {
  const configPath = join(__dirname, '..', '..', 'config', 'cli-actions.json');
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as { actions: CliAction[] };

    const nextMap: Record<string, string[]> = {};

    for (const action of config.actions) {
      if (!action.validLastPipelines) continue;

      for (const pipeline of action.validLastPipelines) {
        if (!nextMap[pipeline]) {
          nextMap[pipeline] = [];
        }
        nextMap[pipeline].push(action.name);
      }
    }

    return nextMap;
  } catch {
    // Return defaults if file not found
    return {
      'null': ['generate'],
      'generate': ['enhance'],
      'enhance': ['interlink-articles', 'finalize'],
    };
  }
}

// Build once at module load
const NEXT_ACTIONS = buildNextActionsMap();

function getNextActions(lastPipeline: string | null): string[] {
  const key = lastPipeline || 'null';
  return NEXT_ACTIONS[key] || [];
}

function buildStatusSummary(articles: Array<{ article: { last_pipeline?: string | null; costs?: Array<{ cost: number }> } }>): StatusSummary {
  const byPipeline: Record<string, number> = {
    '(seed)': 0,
    'generate': 0,
    'enhance': 0,
    'interlink-articles': 0,
    'finalize': 0,
  };

  let totalCost = 0;

  for (const item of articles) {
    const pipeline = item.article.last_pipeline || '(seed)';
    if (byPipeline[pipeline] !== undefined) {
      byPipeline[pipeline]++;
    } else {
      // Unknown pipeline, add it
      byPipeline[pipeline] = 1;
    }

    const costs = item.article.costs || [];
    totalCost += costs.reduce((sum, c) => sum + c.cost, 0);
  }

  return {
    total: articles.length,
    byPipeline,
    totalCost,
  };
}

function formatProjectStatus(
  projectName: string,
  config: { title: string; url?: string },
  summary: StatusSummary,
  articles: Array<{ path: string; article: { title: string; last_pipeline?: string | null } }>
): string {
  const lines: string[] = [
    `Project: ${config.title}`,
    ...(config.url ? [`URL: ${config.url}`] : []),
    '',
    `Total articles: ${summary.total}`,
    `Estimated total cost: $${summary.totalCost.toFixed(2)}`,
    '',
    'By pipeline:',
  ];

  // Show counts for each pipeline
  for (const [pipeline, count] of Object.entries(summary.byPipeline)) {
    if (count > 0) {
      lines.push(`  ${pipeline.padEnd(18)}: ${count}`);
    }
  }

  if (articles.length > 0) {
    lines.push('');
    lines.push('Articles:');
    for (const item of articles) {
      const pipeline = item.article.last_pipeline || '(seed)';
      const next = getNextActions(item.article.last_pipeline || null);
      const nextHint = next.length > 0 ? `Next: ${next.join(', ')}` : '(done)';
      lines.push(`  [${pipeline.padEnd(18)}] ${item.path}`);
      lines.push(`                             "${item.article.title}"`);
      lines.push(`                             ${nextHint}`);
    }
  }

  return lines.join('\n');
}

function formatArticleStatus(
  path: string,
  meta: {
    title: string;
    last_pipeline?: string | null;
    version?: number;
    keywords: string[];
    created_at: string;
    updated_at: string;
  }
): string {
  const pipeline = meta.last_pipeline || '(seed)';
  const next = getNextActions(meta.last_pipeline || null);
  const nextLine = next.length > 0
    ? `Next pipelines: ${next.join(', ')}`
    : 'Next pipelines: (done - article is finalized)';

  return [
    `Article: ${meta.title}`,
    `Path: ${path}`,
    `Last pipeline: ${pipeline}`,
    nextLine,
    `Version: ${meta.version || 0}`,
    `Keywords: ${meta.keywords.join(', ')}`,
    `Created: ${meta.created_at}`,
    `Updated: ${meta.updated_at}`,
  ].join('\n');
}
