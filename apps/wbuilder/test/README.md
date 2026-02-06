# Test Sites

This folder contains test site configurations for verifying template features.

## test-default

Tests the default template with all new features enabled:

- **Categories**: Technology, AI, Web Development, Productivity, Career
- **Search**: Pagefind client-side search (Cmd+K)
- **llms.txt**: LLM-friendly site overview at /llms.txt
- **JSON-LD**: BlogPosting + BreadcrumbList schemas

### Files

```
test-default/
├── site-config.json      # Full site configuration
├── articles/             # Sample articles (JSON format)
│   ├── getting-started-with-ai.json
│   ├── web-development-trends-2025.json
│   └── productivity-tips-developers.json
├── build.sh              # Build script
└── build/                # Output (after build)
```

### Building Locally

```bash
cd test/test-default
chmod +x build.sh
./build.sh
```

### Using API Server

```bash
# Start the API server first
cd api-server
npm run dev

# Then build using API
cd ../test/test-default
./build.sh --api
```

### Preview

After building:

```bash
cd test/test-default/build
npx serve
```

### Verification Checklist

After building, verify these features work:

- [ ] Homepage shows 3 articles with category badges
- [ ] `/category/technology/` shows Technology articles
- [ ] `/categories/` shows all categories with counts
- [ ] Cmd+K opens search modal
- [ ] Search returns relevant results
- [ ] `/llms.txt` shows markdown with articles and categories
- [ ] View page source on any article - check for BlogPosting JSON-LD
- [ ] View page source - check for BreadcrumbList JSON-LD
