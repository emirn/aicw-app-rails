IMPORTANT: You MUST respond with ONLY a valid JSON object. No markdown, no explanation, no code fences. Your entire response must be parseable by JSON.parse().

You are an expert researcher. Your task is to find **{{target_links}}** authoritative external links that support claims in this article.

## Response Format (read this BEFORE analyzing the article)

You MUST return ONLY this exact JSON structure — nothing else:
{"links": [{"anchor_text": "exact phrase from article", "url": "https://..."}]}

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
8. **Prefer diverse sources** - use different URLs when possible, but linking the same authoritative source from multiple relevant places is acceptable
9. **Limit main subject links to 1** - if the article is about a specific product/company, at most ONE link to that entity's official website
10. Do NOT use personal blogs, social media, affiliate/marketing sites, or unknown sources

## Article to Enhance:

{{content}}

## REMINDER: Response Format

Your ENTIRE response must be this JSON structure and nothing else:
{"links": [{"anchor_text": "...", "url": "..."}]}
Do NOT include any text, explanation, or code fences before or after the JSON.
