import fetch from 'node-fetch';
import { config } from '../config/server-config';
import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { withRetry } from '../utils/retry';

// Load pricing configuration with file-stat based cache invalidation
interface ModelPricing {
  input_per_million: number;
  output_per_million: number;
  description?: string;
}

interface PricingConfig {
  models: Record<string, ModelPricing>;
  default_input_output_ratio: number;
  updated_at: string;
}

interface CachedConfig<T> {
  data: T;
  mtime: number;  // File modification time in ms
}

let pricingCache: CachedConfig<PricingConfig> | null = null;
const PRICING_CONFIG_PATH = join(__dirname, '..', '..', 'config', 'pricing.json');

function loadPricingConfig(): PricingConfig {
  try {
    const stat = statSync(PRICING_CONFIG_PATH);
    const currentMtime = stat.mtimeMs;

    // Return cached config if file hasn't changed
    if (pricingCache && pricingCache.mtime === currentMtime) {
      return pricingCache.data;
    }

    // Reload config
    const content = readFileSync(PRICING_CONFIG_PATH, 'utf-8');
    const data = JSON.parse(content) as PricingConfig;
    pricingCache = { data, mtime: currentMtime };
    return data;
  } catch (error) {
    // Fallback pricing if config file not found
    console.warn('Failed to load pricing.json, using defaults');
    return {
      models: {
        'default': { input_per_million: 0.15, output_per_million: 0.60 }
      },
      default_input_output_ratio: 0.7,
      updated_at: 'fallback'
    };
  }
}

/**
 * Calculate cost in USD for a given model and token usage.
 * Handles both OpenRouter format (openai/gpt-4o) and native format (gpt-4o).
 */
export function calculateCost(
  modelId: string,
  totalTokens: number,
  inputTokens?: number,
  outputTokens?: number
): number {
  const pricing = loadPricingConfig();
  // Try exact match, then prefixed version (for native OpenAI IDs), then default
  const modelPricing = pricing.models[modelId]
    || pricing.models[`openai/${modelId}`]
    || pricing.models['default'];

  // If we have exact input/output breakdown, use it
  if (inputTokens !== undefined && outputTokens !== undefined) {
    const inputCost = (inputTokens * modelPricing.input_per_million) / 1_000_000;
    const outputCost = (outputTokens * modelPricing.output_per_million) / 1_000_000;
    return inputCost + outputCost;
  }

  // Otherwise estimate using the default ratio
  const ratio = pricing.default_input_output_ratio;
  const estimatedInput = Math.floor(totalTokens * ratio);
  const estimatedOutput = totalTokens - estimatedInput;
  const inputCost = (estimatedInput * modelPricing.input_per_million) / 1_000_000;
  const outputCost = (estimatedOutput * modelPricing.output_per_million) / 1_000_000;
  return inputCost + outputCost;
}

export interface IUsageStats {
  tokens_used: number;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  model_used: string;
  generation_time_ms: number;
}

// Attempt to extract and parse a JSON object from possibly messy LLM output
const extractJsonObject = (text: string): any | null => {
  if (!text) return null;

  // 1) Trim and strip code fences if present
  let t = text.trim();
  const fenceRegex = /```\s*json\s*([\s\S]*?)```/i;
  const fenceMatch = t.match(fenceRegex);
  if (fenceMatch && fenceMatch[1]) {
    t = fenceMatch[1].trim();
  } else if (t.startsWith('```') && t.endsWith('```')) {
    t = t.slice(3, -3).trim();
  }

  // 2) Quick direct parse attempt
  try {
    return JSON.parse(t);
  } catch {}

  // 3) Remove obvious prefixes like "JSON:" or similar
  t = t.replace(/^json\s*[:\-]?\s*/i, '').trim();
  try {
    return JSON.parse(t);
  } catch {}

  // 4) Scan for the first balanced JSON object and parse it
  const tryExtractBalanced = (s: string): any | null => {
    let inStr = false;
    let escape = false;
    let depth = 0;
    let start = -1;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (escape) {
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === '"') {
          inStr = false;
        }
        continue;
      }
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          const candidate = s.slice(start, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            // keep scanning; there might be another object later
          }
        }
      }
    }
    return null;
  };

  const extracted = tryExtractBalanced(t);
  if (extracted) return extracted;

  return null;
};

// Build a mock article markdown for quick local testing
const buildMockArticleMd = (topic: string): string => {
  const tools = Array.from({ length: 25 }, (_, i) => i + 1).map(
    (n) => `### ${n}. Tool ${n}\n- What it does: Brief description.\n- Best for: Use case.\n- Pricing: Tiered.\n- Why it matters in 2025: Short rationale.\n`
  );
  return `# ${topic}\n\nA curated list of top AI tools shaping 2025.\n\n## How We Selected\n- Market adoption and momentum\n- Product maturity and roadmap\n- Clear ROI and time-to-value\n\n## The List\n${tools.join('\n')}\n\n## Key Takeaways\n- Consolidate your stack where possible.\n- Prioritize integrations and data governance.\n- Pilot quickly, measure, and iterate.\n\n## Conclusion\nChoosing the right tools in 2025 means balancing capability, adoption risk, and integration depth.`;
};

const makeSlug = (title: string) => title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');

const mockAIResponse = (prompt: string) => {
  const startTime = Date.now();

  // Decide response type by prompt content
  const wantsFull = /IArticle interface structure/i.test(prompt);
  const wantsContentOnly = /only the updated content/i.test(prompt) || /content\s*-only/i.test(prompt);
  const wantsMetaOnly = /metadata fields/i.test(prompt);
  const wantsPlan = /plan-only-requirement|IContentPlan|content plan/i.test(prompt);
  const wantsCompetitors = /competitor/i.test(prompt) && /json/i.test(prompt);

  const topicMatch = prompt.match(/Write a\s+(.+?)\./i) || prompt.match(/for\s+(.+?)\s*\n/i);
  const defaultTitle = 'Top 25 AI Tools for 2025';
  const title = defaultTitle;
  const slug = makeSlug(title);
  const content = buildMockArticleMd(title);

  // Build debug info for mock responses
  const debugInfo = process.env.DEBUG_MODE === 'true'
    ? { model_used: 'mock-ai', generation_time_ms: Date.now() - startTime }
    : undefined;

  if (wantsMetaOnly) {
    const meta = {
      slug,
      title,
      description: 'Explore 25 must‑know AI tools shaping 2025 innovation.',
      keywords: 'AI tools, 2025, automation, productivity, machine learning',
    };
    return { content: meta, tokens: 0, rawContent: JSON.stringify(meta), debugInfo };
  }

  if (wantsContentOnly) {
    const contentOnly = {
      content: content + '\n\n> Mock update applied.'
    };
    return { content: contentOnly, tokens: 0, rawContent: JSON.stringify(contentOnly), debugInfo };
  }

  if (wantsFull) {
    const article = {
      id: 'mock-article-001',
      slug,
      title,
      description: 'Explore 25 must‑know AI tools shaping 2025 innovation.',
      keywords: 'AI tools, 2025, automation, productivity, machine learning',
      content,
    };
    return { content: article, tokens: 0, rawContent: JSON.stringify(article), debugInfo };
  }

  if (wantsPlan) {
    const clusters = [
      { id: 'c1', name: 'Foundations', description: 'Core AI support concepts and primers', priority: 1 as 1 },
      { id: 'c2', name: 'Implementation', description: 'How-tos, rollouts, integrations', priority: 1 as 1 },
      { id: 'c3', name: 'Comparisons', description: 'Best-of lists and versus articles', priority: 2 as 2 },
    ];
    const plan = {
      website: {
        url: 'https://ayodesk.com',
        title: 'Ayodesk',
        focus_keywords: 'customer support, AI, automation',
        audience: 'B2B support leaders and founders',
        positioning: 'AI customer support automation platform',
      },
      total_articles: 12,
      items: Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        const t = `AI Support Tooling ${n}`;
        const s = makeSlug(`ai-support-tooling-${n}`);
        const cluster = n <= 4 ? clusters[0] : n <= 8 ? clusters[1] : clusters[2];
        const internal = ['/blog/ai-customer-support', '/blog/help-desk-automation'];
        const link_recommendations = [
          { slug: internal[0], anchor_text: 'AI in customer support' },
          { slug: internal[1], anchor_text: 'help desk automation' },
        ];
        return {
          id: `plan-${n}`,
          slug: `/blog/${s}`,
          title: `What Is ${t}? Benefits, Use Cases, and ROI`,
          description: `Explain ${t}, when to use it, pros/cons, and how Ayodesk fits. Include implementation tips.`,
          target_keywords: ['AI support', t, 'help desk automation', 'customer service AI'],
          target_words: 1600,
          search_intent: 'informational',
          funnel_stage: n <= 4 ? 'top' : n <= 8 ? 'middle' : 'bottom',
          priority: (n <= 4 ? 1 : n <= 8 ? 2 : 3) as 1 | 2 | 3,
          internal_links: internal,
          link_recommendations,
          notes: 'Add 1 comparison table and 2 diagrams.',
          cluster_id: cluster.id,
          cluster_name: cluster.name,
        };
      }),
      summary: 'A balanced plan spanning awareness to decision with product-led narratives and best-of content to capture high-intent queries.',
      clusters,
    };
    return { content: plan, tokens: 0, rawContent: JSON.stringify(plan), debugInfo };
  }

  if (wantsCompetitors) {
    const makeInfo = (url: string, title: string): any => ({
      url,
      title,
      description: `${title} platform overview and positioning`,
      focus_keywords: 'customer support, AI, automation',
      focus_instruction: 'Focus on practical automation for support teams',
      pages_published: [
        { id: 'p1', slug: '/blog/intro', title: 'Intro', description: 'Intro page', keywords: 'intro' }
      ],
      main_pages: [
        { id: 'm1', slug: '/', title: title, description: `${title} home`, keywords: 'home', content: '...' }
      ]
    });
    const arr = [
      makeInfo('https://example-competitor-a.com', 'Competitor A'),
      makeInfo('https://example-competitor-b.com', 'Competitor B'),
      makeInfo('https://example-competitor-c.com', 'Competitor C')
    ];
    return { content: arr, tokens: 0, rawContent: JSON.stringify(arr), debugInfo };
  }

  // Fallback
  const fallback = { content };
  return { content: fallback, tokens: 0, rawContent: JSON.stringify(fallback), debugInfo };
};

export type AIProvider = 'openrouter' | 'openai';

export interface AICallResult {
  content: any;
  tokens: number;
  rawContent: string;
  debugInfo?: { model_used: string; generation_time_ms: number };
  usageStats: IUsageStats;
}

import type { AIRoute } from '@blogpostgen/types';

/**
 * Convert legacy provider/modelId/baseUrl options to an AIRoute array.
 */
function legacyToRoutes(opts?: {
  provider?: AIProvider;
  modelId?: string;
  baseUrl?: string;
}): AIRoute[] {
  const provider: AIProvider = opts?.provider || 'openrouter';
  const modelId = opts?.modelId || config.ai.defaultModel;

  // Normalize model ID for provider
  let normalizedModel = modelId;
  if (provider === 'openai' && modelId.startsWith('openai/')) {
    normalizedModel = modelId.substring(7);
  }

  const endpoint = opts?.baseUrl || (provider === 'openai'
    ? config.ai.openaiBaseUrl
    : config.ai.openrouterBaseUrl);

  return [{
    model: normalizedModel,
    endpoint,
    api_key_env: provider === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY',
  }];
}

/**
 * Make a single AI call to a specific route. Fully provider-agnostic.
 */
async function callAISingle(
  prompt: string,
  opts: {
    model: string;
    endpoint: string;
    apiKey: string;
    webSearch?: boolean;
  }
): Promise<{ response: any; data: any }> {
  const timeoutMs = config.ai.timeoutMs;
  const url = `${opts.endpoint}/chat/completions`;

  const response = await withRetry(
    async () => {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opts.apiKey}`,
          },
          body: JSON.stringify({
            model: opts.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: config.ai.maxTokens,
            ...(opts.webSearch && { web_search_options: {} }),
          }),
          // @ts-ignore
          signal: controller.signal,
        });

        // Throw on retryable errors so withRetry can handle them
        if (!res.ok && [408, 429, 500, 502, 503, 504].includes(res.status)) {
          const text = await res.text();
          const err = new Error(`HTTP ${res.status}: ${text}`);
          (err as any).status = res.status;
          throw err;
        }

        return res;
      } finally {
        clearTimeout(timeoutHandle);
      }
    },
    { maxAttempts: 5, baseDelayMs: 2000, maxDelayMs: 30000 }
  );

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(text);
    (err as any).status = response.status;
    throw err;
  }

  const data: any = await response.json();
  return { response, data };
}

export const callAI = async (
  prompt: string,
  opts?: {
    routes?: AIRoute[];
    webSearch?: boolean;
    // Legacy (backward compat):
    provider?: AIProvider;
    modelId?: string;
    baseUrl?: string;
  }
): Promise<AICallResult> => {
  const startTime = Date.now();

  // Mock mode for local/offline testing
  if (process.env.MOCK_AI === 'true') {
    const mockResult = mockAIResponse(prompt);
    const generationTime = Date.now() - startTime;
    return {
      ...mockResult,
      usageStats: {
        tokens_used: mockResult.tokens,
        tokens_input: 0,
        tokens_output: 0,
        cost_usd: 0,
        model_used: 'mock-ai',
        generation_time_ms: generationTime
      }
    };
  }

  // Build routes: explicit routes take priority over legacy options
  const routes = opts?.routes || legacyToRoutes(opts);

  // Try each route in order
  let lastError: Error | null = null;
  for (const route of routes) {
    const apiKey = process.env[route.api_key_env];
    if (!apiKey) {
      // Key not configured, skip to next route
      continue;
    }

    try {
      const { data } = await callAISingle(prompt, {
        model: route.model,
        endpoint: route.endpoint,
        apiKey,
        webSearch: opts?.webSearch,
      });

      const rawContent = data?.choices?.[0]?.message?.content || '';
      const tokens = data?.usage?.total_tokens || 0;
      const inputTokens = data?.usage?.prompt_tokens || 0;
      const outputTokens = data?.usage?.completion_tokens || 0;
      const generationTime = Date.now() - startTime;
      const costUsd = calculateCost(route.model, tokens, inputTokens, outputTokens);

      const debugInfo = process.env.DEBUG_MODE === 'true'
        ? { model_used: route.model, generation_time_ms: generationTime }
        : undefined;

      const usageStats: IUsageStats = {
        tokens_used: tokens,
        tokens_input: inputTokens,
        tokens_output: outputTokens,
        cost_usd: costUsd,
        model_used: route.model,
        generation_time_ms: generationTime
      };

      const parsed = extractJsonObject(rawContent);
      if (parsed !== null) return { content: parsed, tokens, rawContent, debugInfo, usageStats };
      console.warn('Failed to parse JSON response robustly, returning raw content');
      return { content: rawContent, tokens, rawContent, debugInfo, usageStats };
    } catch (err: any) {
      lastError = err;
      const status = err?.status;
      if (status === 401 || status === 402 || status === 403) {
        // Auth/payment error - try next route
        console.warn(`Route failed (${status}): ${route.endpoint} model=${route.model}, trying next...`);
        continue;
      }
      throw err; // Non-auth error - don't try other routes
    }
  }

  // All routes exhausted
  if (lastError) throw lastError;
  throw new Error('No AI routes configured or all API keys missing');
};
