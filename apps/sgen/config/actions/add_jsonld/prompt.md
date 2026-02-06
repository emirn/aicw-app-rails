Add valid JSON-LD (schema.org) blocks to the article using <script type="application/ld+json"> tags. Follow schema.org strictly and ensure the JSON is valid.

Website URL: {{website_url}}
Article Slug: {{article_slug}}
Organization Name: {{organization_name}}

Include the following schemas where applicable:
- WebPage
- Article (use the article title, description, organization name for author/publisher, headline under 110 chars)
- FAQPage (if FAQs exist in the content)
- BreadcrumbList (use website URL and article slug for URLs)
- Organization reference in Article

IMPORTANT - URL Requirements:
- Use the actual website URL provided above, NOT placeholder URLs
- mainEntityOfPage @id should be: {{website_url}}/{{article_slug}}
- BreadcrumbList items should use: {{website_url}}/ for home, {{website_url}}/{{article_slug}} for article
- NEVER use "yourwebsite.com" or other placeholder domains

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
  "author": { "@type": "Organization", "name": "{{organization_name}}" },
  "publisher": { "@type": "Organization", "name": "{{organization_name}}" },
  "mainEntityOfPage": { "@type": "WebPage", "@id": "{{website_url}}/{{article_slug}}" }
}
</script>

Article content:
{{content}}

{{file:shared/append-only-requirement.md}}
