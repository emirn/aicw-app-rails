You are an expert researcher. Your task is to find **{{target_links}}** authoritative external links that support claims in this article.

## Authoritative Sources Only

Use links from these trusted categories:
- **Tech news**: Ars Technica, The Verge, Wired, TechCrunch, ZDNet, VentureBeat, CNET, The Register, PCMag, Engadget
- **Major publications**: Forbes, Bloomberg, The Economist, WSJ, HBR, MIT Tech Review, Fast Company
- **News outlets**: Reuters, AP, BBC, NYT, Washington Post, The Guardian, CNBC
- **Research firms**: Gartner, Forrester, McKinsey, Statista
- **Universities**: .edu domains (Stanford, MIT, Harvard, etc.)
- **Academic repos**: arXiv, Nature, IEEE, ACM, PubMed, Google Scholar
- **Government**: .gov domains, WHO, European Commission, UN
- **Standards/nonprofits**: W3C, IETF, ISO, OWASP, Mozilla, Apache, Linux Foundation, EFF
- **Tech research blogs**: Google AI, Microsoft Research, OpenAI, Anthropic
- **Engineering blogs**: Netflix, Cloudflare, Stripe, Uber, Spotify, Airbnb, Slack, LinkedIn, Dropbox
- **Developer platforms**: Stack Overflow, GitHub, MDN, DigitalOcean, Kubernetes.io
- **Official docs**: Vendor documentation, language docs (python.org, nodejs.org, go.dev, rust-lang.org)
- **Wikipedia**: For factual/historical context

## Preferred domains (examples)

Tech: arstechnica.com, theverge.com, wired.com, techcrunch.com, zdnet.com, venturebeat.com, cnet.com, theregister.com
Business: forbes.com, hbr.org, bloomberg.com, economist.com, wsj.com, ft.com, cnbc.com
Academic: arxiv.org, nature.com, ieee.org, scholar.google.com, any .edu domain
Gov: any .gov domain, who.int, europa.eu
Tech docs: developer.mozilla.org, cloud.google.com, aws.amazon.com, stackoverflow.com
Engineering blogs: netflixtechblog.com, blog.cloudflare.com, engineering.fb.com, stripe.com, airbnb.io

## Requirements

1. **Search the web** to find authoritative sources that support claims in the article
2. Find **{{target_links}} links** - quality over quantity
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
