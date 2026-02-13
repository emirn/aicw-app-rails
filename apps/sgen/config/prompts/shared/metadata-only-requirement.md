IMPORTANT: You must respond with a valid JSON object containing only the metadata fields:

```json
{
  "slug": "string - URL-friendly slug: 3-5 words, max 30 characters, must include primary keyword, lowercase with hyphens only (required)",
  "title": "string - article title, SEO-optimized, 50-60 characters with primary keyword within the first 30 characters (required)",
  "description": "string - meta description, 150-155 characters. Front-load primary keyword and most compelling info within first 120 characters (mobile cutoff). Include a subtle call-to-action (required)",
  "keywords": "string - comma-separated SEO keywords (required)"
}
```

Requirements:
- The response MUST be valid JSON that can be parsed without errors
- The slug should be 3-5 words, max 30 characters, must include the primary keyword. Use lowercase with hyphens only, no special characters.
- The title should place the primary keyword within the first 30 characters. Keep total length 50-60 characters (hard max 60).
- The description should be 150-155 characters. Front-load the primary keyword and most compelling information within the first 120 characters (mobile cutoff). Include a subtle call-to-action.
- Keywords should be relevant, comma-separated, and support the article's SEO goals
- Do not include any text before or after the JSON object
- Do not wrap the JSON in code blocks or markdown formatting