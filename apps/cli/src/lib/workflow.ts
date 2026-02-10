/**
 * Workflow utilities for article state machine
 *
 * Defines valid transitions between last_pipeline states.
 * Pipeline flow: (seed) -> generate -> enhance(-*) -> publish
 *
 * Publishable = last_pipeline matches configurable regex pattern (default: ^enhance)
 *
 * The transitions map is built dynamically from pipeline data fetched at startup
 * via setPipelinesMap(). It inverts articleFilter.last_pipeline relationships:
 * if pipeline X requires last_pipeline Y, then Y -> X is a valid transition.
 */

// Configurable publishable pattern - set via setPublishablePattern()
let publishablePattern: RegExp = /^enhance/;

// Dynamic transitions map — built at startup from pipeline config
let nextPipelinesMap: Record<string, string[]> = {};

/**
 * Build transitions map from pipeline data.
 * Inverts articleFilter.last_pipeline: if pipeline X requires last_pipeline Y,
 * then Y -> X is a valid transition.
 */
export function setPipelinesMap(pipelines: Array<{ name: string; articleFilter?: { last_pipeline: string | null } | null }>): void {
  const map: Record<string, string[]> = {};
  for (const p of pipelines) {
    const prereq = p.articleFilter?.last_pipeline;
    const key = prereq === null || prereq === undefined ? 'null' : prereq;
    if (!map[key]) map[key] = [];
    map[key].push(p.name);
  }
  // Ensure every pipeline name has an entry (terminal pipelines get [])
  for (const p of pipelines) {
    if (!map[p.name]) map[p.name] = [];
  }
  nextPipelinesMap = map;
}

/**
 * Get valid next pipelines for a given last_pipeline
 */
export function getNextPipelines(lastPipeline: string | null): string[] {
  const key = lastPipeline ?? 'null';
  return nextPipelinesMap[key] || [];
}

/**
 * Check if a transition from one pipeline to another is valid
 */
export function isValidPipelineTransition(from: string | null, to: string): boolean {
  const key = from ?? 'null';
  const validNext = nextPipelinesMap[key] || [];
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
