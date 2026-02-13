Add valid JSON-LD (schema.org) blocks to the article using <script type="application/ld+json"> tags. Follow schema.org strictly and ensure the JSON is valid.

Website URL: {{website_url}}
Article Slug: {{article_slug}}
Organization Name: {{organization_name}}
Author Name: {{author_name}}
Author Title: {{author_title}}
Author URL: {{author_url}}
Article Date: {{article_date}}
Article Updated: {{article_updated}}

Include the following schemas where applicable:
- WebPage
- Article (use the article title, description, headline under 110 chars)
- BreadcrumbList (use website URL and article slug for URLs)
- Organization reference in Article as publisher

Do NOT include FAQPage schema - that is handled separately.

IMPORTANT - URL Requirements:
- Use the actual website URL provided above, NOT placeholder URLs
- mainEntityOfPage @id should be: {{website_url}}/{{article_slug}}
- BreadcrumbList items should use: {{website_url}}/ for home, {{website_url}}/{{article_slug}} for article
- NEVER use "yourwebsite.com" or other placeholder domains

## Author Schema
- If Author Name is provided and not empty, use Person schema for the author:
  ```json
  "author": {
    "@type": "Person",
    "name": "<author_name>",
    "jobTitle": "<author_title>",
    "url": "<author_url>"
  }
  ```
  Omit jobTitle/url if those values are empty.
- If no Author Name is provided, fall back to Organization-only author:
  ```json
  "author": { "@type": "Organization", "name": "{{organization_name}}" }
  ```

## Date Fields
- Include `"datePublished"` using the Article Date value if provided.
- Include `"dateModified"` using the Article Updated value if provided. If Article Updated is empty, use Article Date.
- Omit date fields if both are empty.

## Speakable
- Include a `speakable` property to support voice AI citation:
  ```json
  "speakable": {
    "@type": "SpeakableSpecification",
    "cssSelector": ["article > blockquote:first-of-type", "h2"]
  }
  ```

Rules:
- Insert JSON-LD script tags at the end of the article.
- Ensure output is valid JSON (double quotes, no trailing commas).
- Do not alter existing content; only output the JSON-LD blocks to append.
- If some fields are unknown, omit them rather than guessing incorrectly.

Example structure (replace placeholders with actual values):

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "<title>",
  "description": "<description>",
  "author": { "@type": "Person", "name": "<author_name>", "jobTitle": "<author_title>", "url": "<author_url>" },
  "publisher": { "@type": "Organization", "name": "{{organization_name}}" },
  "mainEntityOfPage": { "@type": "WebPage", "@id": "{{website_url}}/{{article_slug}}" },
  "datePublished": "<article_date>",
  "dateModified": "<article_updated>",
  "speakable": { "@type": "SpeakableSpecification", "cssSelector": ["article > blockquote:first-of-type", "h2"] }
}
</script>

Article content:
{{content}}

{{file:shared/append-only-requirement.md}}
