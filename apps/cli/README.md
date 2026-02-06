# BlogPostGen CLI

Command-line tool for AI-powered SEO article generation using the BlogPostGen API.

## Installation

```bash
cd apps/cli/blogpostgen
npm install
npm run build
npm link  # Makes 'blogpostgen' available globally
```

## Prerequisites

**The Sgen API service must be running:**

```bash
# Terminal 1: Start Sgen (handles both planning and article generation)
cd apps/sgen
npm install && npm run build  # First time only
npm run dev  # Starts on http://localhost:3001
```

## Usage

### Basic Usage

```bash
blogpostgen \
  --url https://example.com \
  --website-title "Example Blog" \
  --website-description "Tech tutorials and guides" \
  --keywords "programming, tutorials" \
  --audience "Software developers" \
  --articles 3
```

### Interactive Mode (Recommended)

Interactive mode prompts for everything - just run with `-i`:

```bash
blogpostgen -i
```

You'll be guided through:

```
═══ WEBSITE INFO ═══
? Website URL: https://example.com
? Website title: My Blog
? Description: Tech tutorials and guides
? Focus keywords: programming, tutorials
? Target audience: Software developers
? Brand voice: Professional and friendly

═══ CONTENT PLAN ═══
Generating content plan...

Generated 10 article ideas:
  1. React Performance Tips (High)
  2. Node.js Best Practices (High)
  ...

? Edit plan in editor? [y/N]:
? How many articles to generate? [3]:
? Add custom article ideas? (comma-separated, or skip):

═══ ARTICLE GENERATION ═══

Article 1/3: "React Performance Tips"
Keywords: react, performance, optimization

? Must-cover points (or skip): React.memo, useMemo, useCallback
? Examples to include (or skip): Dashboard speedup case study
? Tone notes (or skip):

Generating... done (48s)
```

### All Options

```bash
blogpostgen \
  --base http://localhost:3001 \        # Sgen API base URL
  --url https://example.com \           # Website URL
  --website-title "My Blog" \           # Website title (manual input)
  --website-description "..." \         # Website description (manual input)
  --keywords "topic1, topic2" \         # Focus keywords (manual input)
  --audience "target audience" \        # Target audience (manual input)
  --brand-voice "tone description" \    # Brand voice (manual input)
  --target 10 \                         # Target articles in content plan
  --articles 3 \                        # Number of articles to generate
  --ideas "idea 1|idea 2" \            # Optional article ideas (pipe-separated)
  --timeout 60000 \                     # API timeout (ms)
  --range N:M \                         # Batch select: start at article N, process M articles
  -i, --interactive \                   # Enable interactive mode
  --auto-edit \                         # Auto-open files in $EDITOR
  --skip-sitemap                        # Skip sitemap fetch in interactive mode
```

## Action-Based Workflow

The CLI uses an action-based workflow where articles progress through stages:

```
plan-import/plan-add → generate → mark-reviewed → enhance* → finalize → /ready/
```

Check status anytime:
```bash
blogpostgen status myproject           # Project overview
blogpostgen status myproject/blog/slug # Single article status
```

### 1. Import Content Plan

Import article briefs from a file or clipboard:

```bash
# From file (supports .md, .yaml, .json)
blogpostgen plan-import myproject --file content-plan.md

# From clipboard
blogpostgen plan-import myproject --clipboard

# Interactive mode (prompts for file path)
blogpostgen plan-import myproject -i
```

This creates article folders in `/drafts/` with `last_action: plan-import`.

### 2. Generate Articles

Generate full content from briefs:

```bash
# Single article
blogpostgen generate myproject/blog/article-slug

# Interactive picker (select which articles)
blogpostgen generate myproject

# All articles ready for generation
blogpostgen generate myproject --all

# Limit batch size
blogpostgen generate myproject --all --limit 5

# Batch range: generate articles 1-50 (non-interactive)
blogpostgen generate myproject --range 1:50

# Batch range: generate next batch (articles 51-100)
blogpostgen generate myproject --range 51:50
```

**Batch Selection Syntax:**

When using the interactive picker, you can select articles using:
- Comma-separated numbers: `1,3,5` (select articles 1, 3, and 5)
- Range syntax: `N:M` (start at article N, process M articles)
  - `1:10` = process articles 1-10
  - `11:10` = process articles 11-20
  - `5:3` = process articles 5-7
- `all` = select ALL eligible articles (not just displayed 10)
- `q` = quit without selecting

The interactive picker displays the 10 oldest articles, but range syntax lets you access ALL articles beyond the displayed list.

Only articles with `last_action: plan-import` or `plan-add` can be generated.

### 3. Review and Enhance

After generation, mark articles as reviewed:

```bash
blogpostgen mark-reviewed myproject/blog/article-slug
blogpostgen mark-reviewed myproject --all
```

Optionally enhance with AI:

```bash
blogpostgen enhance myproject --mode improve_seo --all
blogpostgen enhance myproject --mode add_faq --all
blogpostgen enhance myproject --mode add_diagrams --all
```

### 4. Finalize (Move to /ready/)

Finalize moves articles from `/drafts/` to `/ready/`:

```bash
# Single article
blogpostgen finalize myproject/blog/article-slug

# All eligible articles
blogpostgen finalize myproject --all
```

**Important:** Only articles with `last_action: mark-reviewed` or `enhance` can be finalized.

There is no automatic pipeline - you must explicitly run `finalize` to move articles.

### Environment Variables

All CLI flags can also be set via environment variables:

```bash
export BASE_URL=http://localhost:3001        # Sgen API
export URL=https://example.com
export TARGET=10
export AI_MODEL=quality
export CLI_TIMEOUT_MS=60000
export CLI_GEN_LIMIT=3

blogpostgen  # Uses env vars
```

## Output

Articles are saved to `~/Library/Application Support/blogpostgen/<username>/data/projects/<project-name>/`:

```
~/Library/Application Support/blogpostgen/default-user/data/projects/example-com/
├── _project.yaml                     # Project configuration
├── drafts/                           # Work in progress
│   └── blog/article-slug/
│       ├── meta.md                  # Article metadata (last_action, keywords, etc.)
│       ├── index.md                  # Article content
│       └── _history/                 # Version history (automatic)
├── ready/                            # Finalized articles (for CMS sync)
│   └── blog/article-slug/
│       ├── meta.md
│       └── index.md
├── content-plan.md                   # Editable content plan (interactive mode)
├── step-1-plan.json                  # Cached content plan (JSON)
└── sitemap-pages.json                # Fetched existing pages (interactive mode)
```

Logs are saved to `~/Library/Application Support/blogpostgen/<username>/logs/cli/cli-run.log`.

## Development

```bash
# Run without building
npm run dev -- --url https://example.com

# Build TypeScript
npm run build

# Run built version
npm run start -- --url https://example.com
```

## Architecture

The CLI is a thin orchestration layer that:

1. Calls **Sgen API** for all operations (content planning + article generation)
2. Accepts manual website input (no automatic scanning)
3. Manages multi-step article generation pipeline
4. Handles caching of content plans locally
5. Provides progress logging and file output
6. Applies 8 enhancement actions per article:
   - fact_check
   - humanize_text
   - add_diagrams
   - add_links
   - add_faq
   - improve_seo
   - create_meta
   - add_jsonld

**No AI or content logic runs in the CLI itself** - it's purely an API orchestration tool that calls the Sgen service.

## Troubleshooting

### API Connection Failed

Ensure the sgen service is running:
```bash
cd apps/sgen
npm run dev
curl http://localhost:3001/health  # Should return {"ok":true}
```

### Permission Denied

Make sure the executable has proper permissions:
```bash
chmod +x bin/blogpostgen
```

### TypeScript Errors

Rebuild the project:
```bash
npm run build
```

## Example Workflow

```bash
# Terminal 1: Start Sgen API
cd apps/sgen
npm run dev

# Terminal 2: CLI workflow
cd apps/cli/blogpostgen
npm install  # First time only
npm run build  # First time or after changes

# 1. Import content plan from file
npm run start -- plan-import aichatwatch.com --file content-plan.md

# 2. Check status
npm run start -- status aichatwatch.com
# Shows: 50 articles at plan-import

# 3. Generate articles (interactive picker or --all)
npm run start -- generate aichatwatch.com --all --limit 5

# 4. Mark as reviewed
npm run start -- mark-reviewed aichatwatch.com --all

# 5. Enhance (optional)
npm run start -- enhance aichatwatch.com --mode improve_seo --all

# 6. Finalize (moves to /ready/)
npm run start -- finalize aichatwatch.com --all

# 7. Check final output
ls ~/Library/Application\ Support/blogpostgen/default-user/data/projects/aichatwatch-com/ready/
```

## Migration from Sgen CLI

If you previously used the CLI from the sgen service:

**Before**:
```bash
cd apps/sgen
npm run cli:run -- --url https://example.com
```

**After**:
```bash
# Start API (Terminal 1)
cd apps/sgen
npm run dev

# Run CLI (Terminal 2)
cd apps/cli/blogpostgen
npm run start -- --url https://example.com
```

## License

MIT
