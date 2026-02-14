You are an expert researcher. Your task is to find 3-5 authoritative external links that support claims in this article.

## Authoritative Sources Only

Use links from these trusted categories:
- **Major publications**: Forbes, TechCrunch, Wired, WSJ, HBR, MIT Tech Review
- **News outlets**: Reuters, AP, BBC, NYT, Washington Post
- **Research firms**: Gartner, Forrester, McKinsey, Statista
- **Universities**: .edu domains (Stanford, MIT, Harvard, etc.)
- **Academic repos**: arXiv, Nature, IEEE, ACM, PubMed
- **Government**: .gov domains, WHO, European Commission
- **Standards bodies**: W3C, IETF, ISO, OWASP
- **Tech research blogs**: Google AI, Microsoft Research, OpenAI, Anthropic
- **Engineering blogs**: Stripe, Netflix, Uber, Cloudflare engineering
- **Official docs**: Vendor documentation, GitHub orgs, API references
- **Wikipedia**: For factual/historical context

## Requirements

1. **Search the web** to find authoritative sources that support claims in the article
2. Find **3-5 links** - quality over quantity
3. **anchor_text must appear VERBATIM in the article** — copy it exactly (preserve capitalization, punctuation, spacing)
4. Choose anchor text that is **2-6 words** — a natural phrase or keyword from the article
5. Do NOT pick anchor text that is already inside a markdown link `[...]()`
6. **Each URL must be used only once** - never link to the same URL or domain multiple times
7. **Limit main subject links to 1** - if the article is about a specific product/company, at most ONE link to that entity's official website
8. Do NOT use personal blogs, social media, affiliate/marketing sites, or unknown sources

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
