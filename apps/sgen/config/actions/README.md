# Action Config Reference

Each subfolder is an action with a `config.json` and optional `prompt.md`. The full TypeScript interface lives in `packages/types/src/action.ts` (`IActionConfig`).

## config.json fields

### Required

| Field | Type | Description |
|-------|------|-------------|
| `output_mode` | `"text_replace_all"` \| `"text_replace"` \| `"insert_content"` \| `"insert_content_top"` \| `"insert_content_bottom"` | How generated content is applied to the article |
| `description` | `string` | Human-readable action description (shown in UI) |

### AI provider

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ai_provider` | `"openrouter"` \| `"openai"` | `"openrouter"` | Which API to call |
| `ai_model_id` | `string` | — | Model ID for the provider (e.g. `"openai/gpt-4o-mini"`, `"anthropic/claude-sonnet-4.5"`) |
| `ai_base_url` | `string` | — | Override provider base URL (e.g. for Azure OpenAI or custom endpoints) |

### Behavior flags

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `local` | `boolean` | `false` | Runs locally without AI call — skips prompt.md validation and model config |
| `forcible` | `boolean` | `true` | Whether action can be used in force-enhance workflow |
| `require_changes` | `boolean` | `false` | Must produce visible content changes or treated as failure |
| `requires_article` | `boolean` | `true` | `false` = project-level action (no article needed) |
| `web_search` | `boolean` | `false` | Enable native web search (for OpenAI search-preview models) |

### Customization

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `supports_custom_prompt` | `boolean` | `false` | Allows per-project prompt overrides via `custom.md` (alias: `custom_prompt`) |
| `supports_custom_config` | `boolean` | `false` | Allows per-project config overrides with custom variables |
| `variables` | `Record<string, string>` | — | Template variables injected into prompt.md |
| `colors` | `Record<string, string>` | — | Color macros, supports `{{project.*}}` runtime resolution |

### Pricing

| Field | Type | Description |
|-------|------|-------------|
| `pricing.input_per_million` | `number` | Cost per 1M input tokens (USD) |
| `pricing.output_per_million` | `number` | Cost per 1M output tokens (USD) |
| `pricing.fixed_cost_per_call` | `number` | Fixed USD fee added per call (e.g. search fees) |
| `pricing.comment` | `string` | Human-readable pricing note |

### Image generation

| Field | Type | Description |
|-------|------|-------------|
| `image_engine` | `"recraft"` \| `"flux"` | Image generation engine |
| `image_model_id` | `string` | Model for image generation (e.g. `"recraft-v4"`) |

### Other

| Field | Type | Description |
|-------|------|-------------|
| `add_external_links` | `{ words_per_link: number }` | Link density config for the add_external_links action |
| `extra_templates` | `string[]` | Additional prompt template paths (not currently used) |

## Common config patterns

### Standard AI action (gpt-4o-mini)

```json
{
  "ai_provider": "openrouter",
  "ai_model_id": "openai/gpt-4o-mini",
  "output_mode": "text_replace",
  "description": "Humanize tone by replacing AI-ish words with friendlier terms",
  "pricing": {
    "input_per_million": 0.15,
    "output_per_million": 0.6
  }
}
```

### Premium AI action (Claude/GPT-4o)

```json
{
  "ai_provider": "openrouter",
  "ai_model_id": "anthropic/claude-sonnet-4.5",
  "output_mode": "text_replace_all",
  "description": "Generate initial blog article based on brief",
  "forcible": false,
  "supports_custom_prompt": true,
  "pricing": {
    "input_per_million": 3,
    "output_per_million": 15
  }
}
```

### Web search action (Perplexity Sonar + fixed fee)

```json
{
  "ai_provider": "openrouter",
  "ai_model_id": "perplexity/sonar",
  "output_mode": "text_replace",
  "description": "Verify facts using Perplexity Sonar with built-in web search and citations",
  "pricing": {
    "input_per_million": 1,
    "output_per_million": 1,
    "fixed_cost_per_call": 0.005,
    "comment": "Perplexity Sonar charges $5/1K searches on top of token pricing"
  }
}
```

### Image generation action

```json
{
  "description": "Generate hero image for article using Recraft (default) or Flux",
  "local": true,
  "output_mode": "text_replace",
  "supports_custom_prompt": true,
  "image_engine": "recraft",
  "image_model_id": "recraft-v4",
  "pricing": {
    "input_per_million": 0,
    "output_per_million": 0,
    "fixed_cost_per_call": 0.04,
    "comment": "Recraft: $0.04/image flat. Flux: ~$0.07/megapixel via OpenRouter."
  }
}
```

### Local action (no AI call)

```json
{
  "local": true,
  "output_mode": "text_replace",
  "description": "Generate table of contents and add anchor IDs to headings (local, no AI)"
}
```

## Prompt template variables

Prompt files (`prompt.md`) use `{{variable}}` syntax. Standard variables available to all actions:

| Variable | Description |
|----------|-------------|
| `{{title}}` | Article title |
| `{{keywords}}` | Article keywords |
| `{{content}}` | Current article content |
| `{{path}}` | Article publish path on the website |
| `{{website_title}}` | Website name |
| `{{custom}}` | Per-project custom prompt content (when `supports_custom_prompt: true`) |

### Shared prompt includes

Use `{{file:shared/filename.md}}` to include reusable prompt fragments from `config/prompts/shared/`:

| Include | Purpose |
|---------|---------|
| `{{file:shared/voice_guidelines.md}}` | Brand voice and tone rules |
| `{{file:shared/article_structure_requirement.md}}` | Article structure formatting |
| `{{file:shared/content-only-requirement.md}}` | Return content only (no explanations) |
| `{{file:shared/metadata-only-requirement.md}}` | Return metadata only |
| `{{file:shared/append-only-requirement.md}}` | Append to existing content |
| `{{file:shared/patch-mode-instructions.md}}` | Patch/diff mode instructions |
| `{{file:shared/plan-only-requirement.md}}` | Return plan structure only |

### Project branding macros

In the `colors` config field, use `{{project.branding.colors.primary}}` style macros to reference project-level branding values resolved at runtime.

## Folder structure

```
config/actions/
├── README.md                  # This file
├── write_draft/
│   ├── config.json            # Action configuration
│   └── prompt.md              # AI prompt template
├── fact_check/
│   └── config.json            # prompt.md required for AI actions
├── add_toc/
│   ├── config.json            # local: true — no AI call needed
│   └── prompt.md              # Optional for local actions
├── ...                        # 31 action folders total
config/prompts/
└── shared/                    # Reusable prompt fragments
    ├── voice_guidelines.md
    ├── article_structure_requirement.md
    └── ...
```

Each action folder name must match an `ActionMode` value from `packages/types/src/action.ts`. The loader at `apps/sgen/src/config/action-config.ts` auto-discovers all folders with a `config.json`.
