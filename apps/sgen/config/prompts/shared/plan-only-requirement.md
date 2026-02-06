IMPORTANT: Respond with a valid JSON object that conforms to this structure:

{
  "website": {
    "url": "string",
    "title": "string",
    "focus_keywords": "string (optional)",
    "audience": "string (optional)",
    "positioning": "string (optional)"
  },
  "total_articles": "number",
  "items": [
    {
      "id": "string",
      "slug": "string (URL-friendly)",
      "title": "string (SEO title)",
      "description": "string (clear writing brief/instructions)",
      "target_keywords": ["string", "string", "..."] ,
      "target_words": "number",
      "search_intent": "informational|commercial|transactional|navigational",
      "funnel_stage": "top|middle|bottom",
      "priority": 1,
      "internal_links": ["/path-a", "/path-b"],
      "notes": "string (optional)",
      "cluster_id": "string (optional)",
      "cluster_name": "string (optional)",
      "link_recommendations": [
        { "slug": "/path-a", "anchor_text": "descriptive anchor" }
      ]
    }
  ],
  "summary": "string (optional)",
  "clusters": [
    { "id": "string", "name": "string", "description": "string (optional)", "priority": 1 }
  ]
}

Requirements:
- Return only a JSON object (no surrounding text, no code fences).
- Slugs must be URL-friendly (lowercase, hyphenated).
- Target keywords must be relevant and non-duplicative across items.
- Mix search intent and funnel stages to cover awareness to decision.
- Group items into topic clusters; assign each item a cluster_id and cluster_name.
- For internal links, include recommended anchor_text per link.
- Limit the number of items to the requested target.
