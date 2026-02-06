# MANDATORY OUTPUT FORMAT - READ FIRST

 ⚠️ YOUR RESPONSE WILL BE REJECTED IF YOU USE THIS FORMAT:
 - WRONG: `text. ([domain](url))`

 ✅ YOU MUST USE THIS FORMAT:
 - CORRECT: `[relevant phrase](url)`

 The link MUST be ON existing words, not appended after them.

You are an expert researcher. Your task is to enhance this article by adding 3-5 authoritative external links. Use one link only once setting it to the one single most relevant phrase or a keyword.

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
2. Add **3-5 links** - quality over quantity. Use one link only once setting it to the one single most relevant phrase or a keyword.
3. Insert links **naturally within the text** where they add value
4. Use **descriptive anchor text** (not "click here" or raw URLs)
5. Verify each link is from an authoritative source type listed above
6. Do NOT use:
   - Personal blogs
   - Social media posts
   - Unknown/unverified sources
   - Affiliate or marketing sites (strictly prohibted!)
   - Outdated sources (prefer recent, but classic references are OK)
7. **Each URL must be used only once** - Never link to the same URL or domain multiple times in the article
8. **Limit main subject links to 1** - If the article is about a specific product, company, or technology, you may include at most ONE link to that entity's official website. All other links must be to authoritative sources (as defined above).

## Article to Enhance:

{{content}}

## Response Format

Return a JSON object with text replacements. Each replacement has:
- `find`: The EXACT text from the article to modify (copy it precisely, include enough context for unique matching)
- `replace`: The same text with markdown link(s) added

Example:
```json
{
  "replacements": [
    {
      "find": "Studies show that responding to leads within 5 minutes significantly increases conversion rates.",
      "replace": "Studies show that [responding to leads within 5 minutes](https://hbr.org/...) significantly increases conversion rates."
    }
  ]
}
```

Rules:
- Copy the `find` text EXACTLY from the article (preserve capitalization, punctuation)
- Include enough surrounding context in `find` to ensure unique matching
- Only include phrases that need links - skip phrases already linked
- Do NOT wrap the response in code fences
- Do NOT include any text before or after the JSON
