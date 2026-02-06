IMPORTANT: You must respond with a valid JSON object that strictly conforms to the following IArticle interface structure:

```json
{
  "id": "string - unique identifier (required)",
  "slug": "string - URL-friendly slug derived from title (required)",
  "title": "string - unique article title specific to the topic (NOT the website name), SEO-optimized, under 60 characters (required)",
  "description": "string - meta description, under 155 characters (required)",
  "keywords": "string - comma-separated SEO keywords (required)",
  "content": "string - full article content in markdown format (required)",
  "word_count": "number - total word count (optional)",
  "estimated_cost": "number - generation cost in USD (optional)"
}
```

Requirements:
- The response MUST be valid JSON that can be parsed without errors
- All required fields (id, slug, title, description, keywords, content) MUST be present
- The slug should be URL-friendly (lowercase, hyphens instead of spaces, no special characters)
- The title MUST be unique and specific to the article topic (never use the website name as the title), optimized for SEO and under 60 characters
- The description should be compelling and under 155 characters for meta description
- Keywords should be relevant, comma-separated, and support the article's SEO goals
- Content should be in proper markdown format with appropriate headings, lists, and formatting
- Do not include any text before or after the JSON object
- Do not wrap the JSON in code blocks or markdown formatting