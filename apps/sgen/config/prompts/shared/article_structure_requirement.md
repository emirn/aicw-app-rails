IMPORTANT: You must respond with a valid JSON object that strictly conforms to the following IArticle interface structure:

```json
{
  "id": "string - unique identifier (required)",
  "slug": "string - URL-friendly slug: 3-5 words, max 30 characters, must include primary keyword, lowercase with hyphens only (required)",
  "title": "string - unique article title specific to the topic (NOT the website name), SEO-optimized, 50-60 characters with primary keyword within the first 30 characters (required)",
  "description": "string - meta description, 150-155 characters. Front-load the primary keyword and most compelling information within the first 120 characters (mobile cutoff). Include a subtle call-to-action (required)",
  "keywords": "string - comma-separated SEO keywords (required)",
  "content": "string - full article content in markdown format (required)",
  "word_count": "number - total word count (optional)",
  "estimated_cost": "number - generation cost in USD (optional)"
}
```

Requirements:
- The response MUST be valid JSON that can be parsed without errors
- All required fields (id, slug, title, description, keywords, content) MUST be present
- The slug should be 3-5 words, max 30 characters, must include the primary keyword. Use lowercase with hyphens only, no special characters.
- The title MUST be unique and specific to the article topic (never use the website name as the title). Place the primary keyword within the first 30 characters. Keep total length 50-60 characters (hard max 60).
- The description should be 150-155 characters. Front-load the primary keyword and most compelling information within the first 120 characters (mobile cutoff). Include a subtle call-to-action.
- Keywords should be relevant, comma-separated, and support the article's SEO goals
- Content should be in proper markdown format with appropriate headings, lists, and formatting
- Do not include any text before or after the JSON object
- Do not wrap the JSON in code blocks or markdown formatting