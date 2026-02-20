# Topic: {{title}}
# Keywords: {{keywords}}

You need to find authoritative external links for the following article content:

{{excerpt}}

IMPORTANT: You MUST respond with ONLY a valid JSON object. No markdown, no explanation, no code fences. Your entire response must be parseable by JSON.parse().

You are an expert researcher. Your task is to find **{{target_links}}** authoritative external links that support claims in this article.

## Response Format (read this BEFORE analyzing the article)

You MUST return ONLY this exact JSON structure — nothing else:
{"links": [{"anchor_text": "exact phrase from article", "url": "https://..."}]}

## Recommended Domains

Here are recommended authoritative domains — prefer these when possible, but any well-known, reputable source is acceptable:

{{domains}}

You are NOT limited to this list. Any established brand, organization, or authoritative publication (recognized in its industry for 10+ years) is a valid source. Use your judgment — quality and relevance matter more than matching a specific list.

## Requirements

1. **Search the web** to find authoritative sources that support claims in the article
2. Find **{{target_links}} links** - quality over quantity
3. **anchor_text must appear VERBATIM in the article** — copy it exactly (preserve capitalization, punctuation, spacing)
4. Choose anchor text that is **2-6 words** — a natural phrase or keyword from the article
5. Do NOT pick anchor text that is already inside a markdown link `[...]()`
6. Do NOT pick anchor text from markdown headings (lines starting with #, ##, ###, etc.)
7. Do NOT pick anchor text that is a standalone short line like a caption, label, or single-sentence paragraph — only link phrases within substantial body paragraphs
8. Do NOT pick anchor text from checklist items (lines starting with `- [ ]` or `- [x]`) or table rows inside checklist sections
9. Each anchor_text MUST be unique and non-overlapping — do NOT return two anchor texts where one contains the other (e.g., if you pick "vendor contract review checklist", do NOT also pick "vendor contract review" or "contract review checklist")
10. **Repeating authoritative sources is fine** - if only one or a few highly authoritative sources exist for this topic, it is perfectly acceptable to link the same domain or even the same URL multiple times at different relevant places in the article. Diversity is preferred when good alternatives exist, but do not sacrifice link quality just to use different domains
11. **Limit main subject links to 1** - if the article is about a specific product/company, at most ONE link to that entity's official website
12. Do NOT use personal blogs, social media, affiliate/marketing sites, or unknown sources
13. **URLs MUST point to specific pages, articles, or resources — NEVER link to a domain homepage** (e.g. `https://nature.com/` or `https://ieee.org/` are WRONG; `https://nature.com/articles/s41586-024-07588-8` is CORRECT). Every URL must have a meaningful path beyond just `/`.
14. If you cannot find a specific page URL for a source, **skip that link entirely** rather than using a homepage URL

## URL Examples

GOOD: `{"anchor_text": "AI detection tools", "url": "https://www.technologyreview.com/2024/01/15/ai-writing-detection-tools-review/"}`
GOOD: `{"anchor_text": "transformer architecture", "url": "https://arxiv.org/abs/1706.03762"}`
BAD:  `{"anchor_text": "AI detection tools", "url": "https://www.technologyreview.com/"}`
BAD:  `{"anchor_text": "AI detection tools", "url": "https://www.technologyreview.com"}`
BAD:  `{"anchor_text": "research papers", "url": "https://scholar.google.com/"}`

## Article to Enhance:

{{content}}

## REMINDER: Response Format

Your ENTIRE response must be this JSON structure and nothing else:
{"links": [{"anchor_text": "...", "url": "..."}]}
Do NOT include any text, explanation, or code fences before or after the JSON.
