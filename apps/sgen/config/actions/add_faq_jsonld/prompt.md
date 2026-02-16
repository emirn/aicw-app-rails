Generate a valid JSON-LD FAQPage schema block from the FAQ content below using a <script type="application/ld+json"> tag. Follow schema.org strictly and ensure the JSON is valid.

Website URL: {{website_url}}
Article Path: {{article_path}}

Rules:
- Output ONLY a single <script type="application/ld+json"> block containing a FAQPage schema.
- Extract all question/answer pairs from the FAQ content below.
- Use the exact questions and answers from the content - do not rephrase or add new ones.
- Ensure output is valid JSON (double quotes, no trailing commas).
- mainEntityOfPage @id should be: {{website_url}}/{{article_path}}
- NEVER use "yourwebsite.com" or other placeholder domains.
- If no valid FAQ pairs can be extracted, output nothing.

Example structure:

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntityOfPage": { "@type": "WebPage", "@id": "{{website_url}}/{{article_path}}" },
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Question text here?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Answer text here."
      }
    }
  ]
}
</script>

FAQ content:
{{faq_content}}

{{file:shared/append-only-requirement.md}}
