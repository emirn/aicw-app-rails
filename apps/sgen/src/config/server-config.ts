import dotenv from 'dotenv';

// Ensure env is loaded when config is imported (index.ts also calls dotenv.config())
dotenv.config();

const env = process.env;

/**
 * Validate required configuration at startup.
 * Throws if critical environment variables are missing.
 */
export function validateRequiredConfig(): void {
  const missing: string[] = [];

  // At least one AI provider key is required
  if (!env.OPENROUTER_API_KEY && !env.OPENAI_API_KEY) {
    missing.push('OPENROUTER_API_KEY or OPENAI_API_KEY');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export const config = {
  server: {
    port: Number(env.PORT) || 3001,
    host: env.HOST || '0.0.0.0',
  },
  log: {
    toFile: env.LOG_TO_FILE === 'true',
    file: env.LOG_FILE || 'server.log',
    level: env.LOG_LEVEL || 'info',
  },
  ai: {
    apiKey: env.OPENROUTER_API_KEY || '',
    defaultModel: env.DEFAULT_MODEL || 'openai/gpt-4o',
    maxTokens: Number(env.MAX_TOKENS) || 16000,
    timeoutMs: Number(env.AI_TIMEOUT_MS) || 60000,
    // OpenAI native support (optional)
    openaiApiKey: env.OPENAI_API_KEY || '',
    // Configurable base URLs for each provider
    openrouterBaseUrl: env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    openaiBaseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  },
  prompts: {
    maxChars: Number(env.PROMPT_MAX_CHARS) || 100000,
  },
  scan: {
    maxPages: Number(env.SCAN_MAX_PAGES) || 50,
    maxPagesMain: Number(env.SCAN_MAX_PAGES_MAIN) || 500,  // Main website deep scan
    maxPagesCompetitor: Number(env.SCAN_MAX_PAGES_COMPETITOR) || 20,  // Competitor light scan
    timeoutMs: Number(env.SCAN_TIMEOUT_MS) || 10000,
    pageDelayMs: Number(env.SCAN_PAGE_DELAY_MS) || 300,
    debug: env.SCAN_DEBUG === 'true',
  },
};
