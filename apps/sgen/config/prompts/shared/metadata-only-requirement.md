IMPORTANT: You must respond with a valid JSON object containing only the metadata fields:

```json
{
  "slug": "string - URL-friendly slug derived from title (required)",
  "title": "string - article title, SEO-optimized, under 60 characters (required)",
  "description": "string - meta description, under 155 characters (required)",
  "keywords": "string - comma-separated SEO keywords (required)"
}
```

Requirements:
- The response MUST be valid JSON that can be parsed without errors
- The slug should be URL-friendly (lowercase, hyphens instead of spaces, no special characters)
- The title should be optimized for SEO and under 60 characters
- The description should be compelling and under 155 characters for meta description
- Keywords should be relevant, comma-separated, and support the article's SEO goals
- Do not include any text before or after the JSON object
- Do not wrap the JSON in code blocks or markdown formatting