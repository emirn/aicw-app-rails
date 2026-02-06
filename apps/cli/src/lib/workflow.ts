/**
 * Workflow utilities for article state machine
 *
 * Defines valid transitions between last_pipeline states.
 * Pipeline flow: (seed) -> generate -> enhance(-*) -> publish
 *
 * Publishable = last_pipeline matches configurable regex pattern (default: ^enhance)
 */

// Configurable publishable pattern - set via setPublishablePattern()
let publishablePattern: RegExp = /^enhance/;

/**
 * Map of last_pipeline -> valid next pipelines
 *
 * Workflow:
 *   null (seed) -> generate
 *   generate -> enhance
 *   enhance -> enhance-interlink-articles (optional, terminal for publishing)
 *   enhance-interlink-articles -> (terminal, publishable)
 *
 * Articles are publishable when last_pipeline starts with 'enhance'
 */
export const NEXT_PIPELINES_MAP: Record<string, string[]> = {
  'null': ['generate'],  // seed articles
  'generate': ['enhance'],
  'enhance': ['enhance-interlink-articles'],  // optional enhancement
  'enhance-interlink-articles': [],           // terminal (publishable)
};

/**
 * Get valid next pipelines for a given last_pipeline
 */
export function getNextPipelines(lastPipeline: string | null): string[] {
  const key = lastPipeline ?? 'null';
  return NEXT_PIPELINES_MAP[key] || [];
}

/**
 * Check if a transition from one pipeline to another is valid
 */
export function isValidPipelineTransition(from: string | null, to: string): boolean {
  const key = from ?? 'null';
  const validNext = NEXT_PIPELINES_MAP[key] || [];
  return validNext.includes(to);
}

/**
 * Set the publishable pattern from config
 * Called at startup when fetching pipelines config from API
 *
 * @param pattern - Regex pattern string (e.g., "^enhance.*")
 */
export function setPublishablePattern(pattern: string): void {
  publishablePattern = new RegExp(pattern);
}

/**
 * Get the current publishable pattern as a string
 */
export function getPublishablePattern(): string {
  return publishablePattern.source;
}

/**
 * Check if an article is publishable based on its last_pipeline
 * Uses configurable regex pattern (default: ^enhance)
 */
export function isPublishable(pipeline: string | null | undefined): boolean {
  if (!pipeline) return false;
  return publishablePattern.test(pipeline);
}

/**
 * @deprecated Use getNextPipelines instead
 */
export function getNextActions(lastAction: string | undefined | null): string[] {
  // Map old last_action values to new last_pipeline equivalents
  const pipelineMap: Record<string, string> = {
    'plan-import': 'null',
    'plan-add': 'null',
    'generate': 'generate',
    'enhance': 'enhance',
    'finalize': 'enhance',  // legacy mapping - finalized articles are publishable
  };

  const pipeline = lastAction ? (pipelineMap[lastAction] || lastAction) : 'null';
  return getNextPipelines(pipeline === 'null' ? null : pipeline);
}

/**
 * @deprecated Use isValidPipelineTransition instead
 */
export function isValidTransition(from: string | undefined | null, to: string): boolean {
  const pipelineMap: Record<string, string> = {
    'plan-import': 'null',
    'plan-add': 'null',
    'generate': 'generate',
    'enhance': 'enhance',
    'finalize': 'enhance',  // legacy mapping
  };

  const pipeline = from ? (pipelineMap[from] || from) : null;
  return isValidPipelineTransition(pipeline === 'null' ? null : pipeline, to);
}
