You are an expert researcher. Your task is to find **{{target_links}}** authoritative external links that support claims in this article.

## Allowed Domains

Only use links from these allowed domains and patterns:

{{domains}}

## Requirements

1. **Search the web** to find authoritative sources that support claims in the article
2. Find **{{target_links}} links** - quality over quantity
3. **anchor_text must appear VERBATIM in the article** — copy it exactly (preserve capitalization, punctuation, spacing)
4. Choose anchor text that is **2-6 words** — a natural phrase or keyword from the article
5. Do NOT pick anchor text that is already inside a markdown link `[...]()`
6. Do NOT pick anchor text from markdown headings (lines starting with #, ##, ###, etc.)
7. Do NOT pick anchor text that is a standalone short line like a caption, label, or single-sentence paragraph — only link phrases within substantial body paragraphs
8. **Each URL must be used only once** - never link to the same URL or domain multiple times
9. **Limit main subject links to 1** - if the article is about a specific product/company, at most ONE link to that entity's official website
10. Do NOT use personal blogs, social media, affiliate/marketing sites, or unknown sources

## Article to Enhance:

{{content}}

## Response Format

Return a JSON object with link insertions. Each entry has:
- `anchor_text`: An exact 2-6 word phrase copied verbatim from the article
- `url`: The authoritative source URL

```json
{
  "links": [
    {
      "anchor_text": "44% more monthly sales",
      "url": "https://hbr.org/2023/01/example-article"
    }
  ]
}
```

Rules:
- anchor_text must appear EXACTLY as-is in the article text above
- Do NOT wrap the response in code fences
- Do NOT include any text before or after the JSON
