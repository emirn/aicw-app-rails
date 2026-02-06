# Sgen Service - Article Generation & Enhancement Microservice

## Project Overview

Sgen is a **stateless** Node.js/Fastify microservice focused purely on **article generation and enrichment**. It acts as a focused wrapper around OpenRouter API to generate and enhance SEO-optimized blog articles.

**Core Purpose**: Generate and enhance high-quality SEO articles at $0.08 cost with 97% margins

**Scope**: Article operations AND content planning - manual input based (no automatic website scraping)

**Critical Reality Check**: Current implementation is ~20% complete. Key gaps:
- ❌ No proper title/slug generation (just copies website title)
- ❌ No SEO metadata extraction
- ❌ Basic prompts (competitors use 10x more sophisticated prompts)
- ❌ No brand voice learning (example_article field unused)
- ❌ No cost calculation
- ❌ No response streaming
- ❌ Shallow website analysis

**What this service IS**:
- A stateless AI processor (no database)
- Content plan generation (manual input based)
- Article generation & enhancement (10 modes)
- A cost tracker showing real OpenAI fees
- A template-based prompt engine
- A brand voice learner using example articles

**What this service IS NOT**:
- An automatic website scraping service (requires manual input)
- A database or storage system
- A user management system
- A scheduling or workflow engine

## Architecture

```
[Rails App] --HTTP--> [Sgen Service] --API--> [OpenRouter] ---> [AI Models]
     |                      |                                      |
[PostgreSQL]        [Content Planning]                   [GPT-4o: $0.08/article]
[Workflow State]    [Article Generation]                 [GPT-4o-mini: $0.01/article]
[User Context]      [Article Enhancement]                [Claude-3.5: $0.12/article]
                    [Stateless Service]
```

**Service Responsibilities**:
- **Sgen**: Content plan generation (manual input) + article generation & enhancement (10 modes)
- **Rails**: State, orchestration, user management, billing, workflow

Sgen processes all AI operations (planning + articles) and returns structured results with cost data.

## File Structure

```
/apps/sgen/
├── src/
│   ├── index.ts              # Fastify server entry point
│   ├── routes/
│   │   ├── article.ts        # POST /article/generate, /article/update
│   │   └── actions.ts        # GET /actions/config
│   ├── services/
│   │   └── ai.service.ts     # OpenRouter API client
│   ├── utils/
│   │   ├── prompts.ts        # Article prompt templates
│   │   ├── articleUpdate.ts  # Article merging & patching
│   │   └── slug.ts           # Slug generation
│   ├── config/
│   │   ├── action-config.ts  # Action configuration loader
│   │   └── server-config.ts  # Server configuration
│   └── types.ts              # TypeScript interfaces
├── config/
│   └── actions/              # Action-specific configs & prompts
│       ├── write_draft/
│       ├── fact_check/
│       ├── humanize_text/
│       ├── add_diagrams/
│       ├── add_links/
│       ├── add_faq/
│       ├── improve_seo/
│       ├── create_meta/
│       ├── add_jsonld/
│       └── ... (10 total)
├── package.json
├── tsconfig.json
└── .env.example
```

## Key Interfaces (Current vs Needed)

```typescript
// CURRENT - Basic but incomplete
interface IArticle {
  id: string;        // ✅ Works
  slug: string;      // ❌ Not generated, empty
  title: string;     // ❌ Just copies website title
  description: string;
  keywords: string;  // ❌ Not optimized for SEO
  content: string;
  word_count?: number;      // ✅ Basic counting
  estimated_cost?: number;  // ❌ Not calculated
}

// NEEDED - Enhanced for MVP
interface IArticleGeneration {
  article: IArticle;
  seo_metadata: {
    meta_title: string;      // 60 chars, optimized
    meta_description: string; // 155 chars
    focus_keyword: string;
    lsi_keywords: string[];
    readability_score: number;
  };
  generation_stats: {
    total_tokens: number;
    cost_usd: number;       // Actual cost in USD
    generation_time_ms: number;
    model_used: string;
  };
  quality_checks: {
    has_citations: boolean;
    fact_check_score: number;
    brand_voice_match: number; // 0-100
  };
}

// Update modes - all article enhancement operations
type UpdateMode =
  | 'fact_check'
  | 'humanize_text'
  | 'add_diagrams'
  | 'add_links'
  | 'add_faq'
  | 'improve_seo'
  | 'create_meta'
  | 'add_jsonld'
  | 'add_images'
  | 'validate_format';
```

## API Endpoints

### 1. Generate Content Plan (NEW)
```typescript
POST /api/v1/plan/generate
Body: {
  website_info: {
    url: string;
    title: string;
    description: string;
    focus_keywords: string;
    focus_instruction?: string;
    brand_voice?: string;
  };
  target_articles: number;        // 10-50 articles in plan
  ideas?: string[];               // Optional article ideas
}

Response: {
  success: boolean;
  plan: {
    articles: Array<{
      title: string;
      description: string;
      keywords: string[];
      priority: number;
    }>;
  };
  error?: string;
}
```

### 2. Generate Article (Enhanced)
```typescript
POST /api/v1/article/generate
Body: {
  description: string;           // "How to optimize Node.js performance"
  website_info: IWebsiteInfo;
  target_words?: number;         // 2000 (default), max 4000
  ai_model?: 'fast' | 'quality'; // fast=gpt-4o-mini, quality=gpt-4o
  competitor_urls?: string[];    // Analyze competitors
  include_citations?: boolean;   // Add source links
  tone?: 'professional' | 'casual' | 'technical';
}

Response: IArticleGeneration & {
  success: boolean;
  error?: string;
  stream_url?: string;  // For real-time generation updates
}
```

### 3. Update Article
```typescript
POST /api/v1/article/update
Body: {
  article: IArticle;
  mode: UpdateMode;
  context?: {
    related_articles?: IPage[];     // for 'add_links'
    target_keywords?: string[];     // for 'improve_seo'
  };
}

Response: {
  article: IArticle;
  success: boolean;
  error?: string;
  changes_made?: string[];
}
```

### 4. Get Action Configuration
```typescript
GET /api/v1/actions/config

Response: {
  success: boolean;
  config: {
    [action_name: string]: {
      ai_provider: 'openrouter' | 'openai';
      ai_model_id: string;
      output_mode: 'text_replace_all' | 'insert_content' | 'text_replace' | ...;
      description: string;
      template: string;
    }
  }
}
```

## Implementation Patterns

### AI Service Pattern (Fixed Implementation)
```typescript
// services/ai.service.ts
class AIService {
  private client: OpenRouter;
  
  async generateContent(prompt: string, model: 'fast' | 'quality'): Promise<{
    content: string;
    tokens: number;
    cost_usd: number;        // CRITICAL: Calculate actual cost
    model_used: string;
    generation_time: number;
  }> {
    const startTime = Date.now();
    const modelId = this.getModelId(model);
    
    const response = await this.client.chat.completions.create({
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      stream: false,  // TODO: Implement streaming
      max_tokens: this.getMaxTokens(model),
      temperature: 0.7
    });
    
    const tokens = response.usage?.total_tokens || 0;
    const cost = this.calculateCost(modelId, tokens);
    
    return {
      content: response.choices[0].message.content,
      tokens,
      cost_usd: cost,
      model_used: modelId,
      generation_time: Date.now() - startTime
    };
  }
  
  private calculateCost(model: string, tokens: number): number {
    const prices = {
      'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },  // per 1M tokens
      'openai/gpt-4o': { input: 2.50, output: 10.00 }
    };
    // Approximate 70% input, 30% output split
    const inputTokens = Math.floor(tokens * 0.7);
    const outputTokens = tokens - inputTokens;
    const price = prices[model] || prices['openai/gpt-4o-mini'];
    return ((inputTokens * price.input) + (outputTokens * price.output)) / 1_000_000;
  }
}
```

### Prompt Building Pattern (Enhanced)
```typescript
// utils/prompts.ts - CRITICAL FIX NEEDED
export const buildArticlePrompt = (desc: string, info: IWebsiteInfo, options: {
  targetWords: number;
  includeCitations: boolean;
  tone: string;
}): string => {
  // CURRENT PROMPT IS TOO BASIC - competitors use 10x more sophisticated prompts
  const basePrompt = renderTemplateFile('article/generate-enhanced.md', {
    website_title: info.title,
    website_description: info.description,
    focus_keywords: info.focus_keywords,
    brand_voice_example: info.example_article || '',  // CRITICAL: Use example for tone
    topic: desc,
    target_words: options.targetWords,
    include_citations: options.includeCitations,
    tone: options.tone,
    current_date: new Date().toISOString().split('T')[0]
  });
  
  return basePrompt;
};

// TODO: Create enhanced prompt template at templates/prompts/article/generate-enhanced.md
// Should include:
// - Brand voice matching
// - SEO requirements
// - Citation requirements
// - Structure requirements
// - Quality checks
```

### Error Handling Pattern
```typescript
// Keep it simple - no custom error classes
try {
  const result = await aiService.generateContent(prompt, model);
  return { success: true, article: processResult(result) };
} catch (error) {
  return { 
    success: false, 
    error: error.message || 'Generation failed'
  };
}
```

## Common Tasks

### Adding a new update mode
1. Add the mode to `UpdateMode` type
2. Add prompt template in `prompts.ts`
3. Add case in update route handler
4. That's it - no database migrations, no complex logic

### Changing AI models
Edit `.env`:
```
# UPDATED MODEL RECOMMENDATIONS (2025)
DEFAULT_MODEL_FAST=openai/gpt-4o-mini        # $0.15/$0.60 per 1M tokens
DEFAULT_MODEL_QUALITY=openai/gpt-4o          # $2.50/$10 per 1M tokens

# Alternative models via OpenRouter
# DEFAULT_MODEL_FAST=meta-llama/llama-3.1-70b-instruct  # Even cheaper
# DEFAULT_MODEL_QUALITY=anthropic/claude-3.5-sonnet     # Best quality
```

### Adjusting word limits
Change `MAX_TOKENS` in `.env` (remember: ~1.3 tokens per word)

## What NOT to do (Boundaries)

❌ **Don't add state/storage** - This is stateless  
❌ **Don't add authentication** - Rails handles this  
❌ **Don't add complex retry logic** - Rails handles retries  
❌ **Don't add caching** - Rails can cache responses  
❌ **Don't add rate limiting** - Rails/nginx handles this  
❌ **Don't add database connections** - This service has no database
❌ **Don't add multiple AI providers** - OpenRouter handles failover

## What you MUST do (Critical Fixes)

✅ **Generate proper article titles** - Don't just copy website title
✅ **Calculate real costs in USD** - Critical for margin tracking
✅ **Use example articles for brand voice** - Key differentiator
✅ **Create sophisticated prompts** - Current ones are too basic
✅ **Extract SEO metadata** - Title, description, keywords
✅ **Add response streaming** - Better UX for long generation
✅ **Implement fact-checking prompts** - Quality control
✅ **Add citation support** - Trust building feature  

## Testing Approach & Local API Examples

**Create `test/api-examples.sh` for manual testing**:
```bash
#!/bin/bash
BASE_URL="http://localhost:3001/api/v1"

# Test 1: Enhanced Article Generation
curl -X POST $BASE_URL/article/generate \
  -H "Content-Type: application/json" \
  -d '{
    "description": "How to optimize Node.js performance in production",
    "website_info": {
      "url": "https://techblog.dev",
      "title": "TechBlog - Modern Development",
      "description": "Technical articles for senior developers",
      "focus_keywords": "Node.js, performance, optimization, production",
      "focus_instruction": "Write for senior developers, include code examples",
      "example_article": "Our articles are practical, code-heavy, and focus on real-world solutions..."
    },
    "target_words": 2000,
    "ai_model": "quality",
    "include_citations": true,
    "tone": "technical"
  }' | jq .

# Test 2: Cost Verification
echo "Expected cost: ~$0.08 for quality model"

# Test 3: Content Plan Generation
curl -X POST $BASE_URL/plan/generate \
  -H "Content-Type: application/json" \
  -d '{
    "website_info": {
      "url": "https://stripe.com/blog",
      "title": "Stripe Blog",
      "description": "Developer-focused payment platform blog",
      "focus_keywords": "payments, APIs, fintech",
      "brand_voice": "Technical but accessible"
    },
    "target_articles": 10
  }' | jq .
```

**Jest Tests**:
```typescript
describe('Sgen Service - MVP Requirements', () => {
  it('generates proper article title (not website title)');
  it('calculates accurate cost in USD');
  it('extracts SEO metadata');
  it('uses example article for brand voice');
  it('includes citations when requested');
  it('streams responses for UX');
});
```

## Local Development

```bash
# Install
cd apps/sgen
npm install

# Setup environment
cp .env.example .env
# Add OPENROUTER_API_KEY

# Run dev server
npm run dev  # Runs on port 3001

# Test endpoint
curl -X POST http://localhost:3001/api/v1/article/generate \
  -H "Content-Type: application/json" \
  -d '{"description": "Test article", "website_info": {...}}'
```

## Deployment Notes

- Stateless = horizontally scalable
- No persistent storage needed
- Can run in Docker/K8s/Lambda
- Health check: `GET /health`
- Logs to stdout (JSON format)
- Metrics: track tokens_used for cost monitoring

## Cost Tracking (CRITICAL FIX)

**Current Problem**: Returns `tokens_used` but not actual cost

**Required Fix**: Each response must include:
```typescript
interface CostData {
  tokens_used: number;
  cost_usd: number;           // MISSING - critical for margins
  model_used: string;         // MISSING - needed for cost attribution
  generation_time_ms: number; // MISSING - for performance tracking
}
```

**Rails Integration**:
1. Store `cost_usd` with each article for P&L tracking
2. Sum costs per customer for usage billing
3. Alert when customer costs exceed plan limits
4. Track margins: revenue - cost_usd - infrastructure

**Target Costs (2000-word article)**:
- GPT-4o-mini (fast): ~$0.01
- GPT-4o (quality): ~$0.08
- Infrastructure: ~$0.02
- **Total: $0.03-0.10 per article**

## MVP vs Future Features

**MVP Must-Haves** (Weeks 1-4):
✅ Proper article title/slug generation
✅ Cost calculation in USD
✅ Brand voice matching with examples
✅ SEO metadata extraction
✅ Basic response streaming
✅ Citation support
✅ Fact-checking prompts
✅ Enhanced website analysis

**Future Considerations** (v2 - Months 3+):
- WebSocket support for real-time collaboration
- Multi-language content generation
- Image generation integration
- Advanced SEO competitor analysis
- A/B testing for different prompts
- Custom model fine-tuning
- Batch processing for high-volume customers

## Quick Debugging

If generation fails:
1. Check OpenRouter API key is valid
2. Check model name is correct in .env
3. Check Rails is sending valid JSON
4. Check error message in response
5. That's usually it

## Remember

This service is intentionally simple. Resist the urge to add features. If you think you need to add something, ask:
1. Can Rails handle this instead?
2. Is this essential for MVP?
3. Does this maintain statelessness?

If any answer is "no", don't add it.
