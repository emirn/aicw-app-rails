/**
 * Shared pipeline configuration loader
 *
 * Single source of truth for pipeline config (pipelines.json).
 * Used by both route handlers and action handlers.
 */

import { readFileSync, statSync } from 'fs';
import { join } from 'path';

export interface PipelineAction {
  action: string;
}

export interface ArticleFilter {
  last_pipeline: string | null;
}

export interface PipelineConfig {
  description: string;
  needsProject: boolean;
  needsFileInput: boolean;
  articleFilter: ArticleFilter | null;
  actions: PipelineAction[];
}

export interface PipelinesConfig {
  publishableFilter?: string;
  pipelines: Record<string, PipelineConfig>;
  updated_at: string;
}

// Cache with file modification time for auto-invalidation
interface CachedConfig {
  data: PipelinesConfig;
  mtime: number;
}

let pipelinesCache: CachedConfig | null = null;
const PIPELINES_CONFIG_PATH = join(__dirname, '..', '..', 'config', 'pipelines.json');

export function loadPipelinesConfig(): PipelinesConfig {
  try {
    const stat = statSync(PIPELINES_CONFIG_PATH);
    const currentMtime = stat.mtimeMs;

    // Return cached config if file hasn't changed
    if (pipelinesCache && pipelinesCache.mtime === currentMtime) {
      return pipelinesCache.data;
    }

    // Reload config
    const content = readFileSync(PIPELINES_CONFIG_PATH, 'utf-8');
    const data = JSON.parse(content) as PipelinesConfig;
    pipelinesCache = { data, mtime: currentMtime };
    return data;
  } catch (error) {
    // Return default config if file not found
    console.warn('Failed to load pipelines.json, using defaults');
    return {
      pipelines: {
        default: {
          description: 'Default pipeline',
          needsProject: true,
          needsFileInput: false,
          articleFilter: { last_pipeline: 'generate' },
          actions: [
            { action: 'humanize_text' },
            { action: 'improve_seo' },
            { action: 'create_meta' }
          ]
        }
      },
      updated_at: 'fallback'
    };
  }
}
