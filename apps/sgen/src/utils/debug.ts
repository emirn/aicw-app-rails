import { IDebugInfo } from '../types';

/**
 * Build debug info for API responses when DEBUG_MODE=true
 * Following DRY principle - single helper used across all endpoints
 */
export function buildDebugInfo(
  promptText: string,
  modelUsed: string,
  generationTimeMs: number,
  rawResponse: string
): IDebugInfo | undefined {
  if (process.env.DEBUG_MODE !== 'true') {
    return undefined;
  }

  return {
    prompt_text: promptText,
    model_used: modelUsed,
    generation_time_ms: generationTimeMs,
    raw_response: rawResponse,
  };
}
