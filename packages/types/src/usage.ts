/**
 * Usage and cost tracking types
 */

export interface IUsageStats {
  tokens_used: number;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  model_used: string;
  generation_time_ms: number;
}

// Debug information for development/troubleshooting
export interface IDebugInfo {
  prompt_text: string;
  model_used: string;
  generation_time_ms: number;
  raw_response: string;
}
