sgen is the API server that generates and updates articles and scans websites using AI.
It is a Node.js + Fastify service. Default port is 3001 (configurable via .env).

Website scanning uses `sitemap.xml` to visit each page with a short delay to avoid
overloading sites. When `SCAN_DEBUG=true` is set in the environment, the full scan
result is written to `website-scan-<timestamp>.json` for inspection.

Prompt text lives in `templates/prompts` as markdown files using `{{placeholder}}`
macros. All placeholders must be replaced at runtime or an error is thrown to avoid
sending incomplete prompts to AI providers.
