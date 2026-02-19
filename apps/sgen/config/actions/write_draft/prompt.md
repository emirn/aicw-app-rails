You are writing the article named `{{title}}` for the website called `{{website_title}}`.
This article will be published in this website at `{{path}}`.
Keywords for the article are: `{{keywords}}`

{{custom}}

## Content Formatting Guide

Use varied content elements to make articles scannable and visually rich. Here are the formats available:

**Checklist as a table** (use this instead of checkbox `[ ]` syntax):
| Item | What to Check | Why It Matters |
|------|---------------|----------------|
| **Scope of Work** | Specific deliverables listed | Vague scope leads to disputes |
| **Payment Terms** | Amount, schedule, late fees | Protects your cash flow |
| **Termination** | Exit conditions for both sides | Avoid being locked in |

**Comparison table** (use when comparing tools, plans, features, pricing tiers, or alternatives):
| Feature | Basic | Pro |
|---------|-------|-----|
| Documents/month | 5 | Unlimited |
| AI review | Basic checks | Full analysis |

When an article compares options, tools, or approaches side by side, present the comparison as a markdown table — tables are easier to scan than prose or bullet lists.

**Numbered list** (for sequential steps):
1. Download the document
2. Run through the review checklist
3. Flag missing sections

**Bullet list** (for non-sequential items):
- Tax identification number (EIN or SSN)
- Complete business address
- Contact email for billing questions

IMPORTANT: Never use `- [ ] item` checkbox syntax in articles — it renders poorly in HTML. Use tables for checklists instead.

**Inline emphasis — use sparingly:**

Bold for key statistics and first-mention terms:
- "hallucination rates above **34%** for Westlaw" — bold the specific number
- "The **sRGB color space** is recommended" — bold the key term on first meaningful use
- Limit to 2-4 bold terms per section. If everything is emphasized, nothing is.
- Do NOT bold entire phrases or sentences — only the specific word or number.

Italic for direct quotes and sayings:
- Some users report: *"The interface feels cluttered"* — italic wraps the quoted speech
- Do NOT use italic for general emphasis (use bold) or for entire paragraphs.

**When to use lists instead of prose:**

When a paragraph contains 3+ parallel items with distinct attributes, convert to a bulleted list:

BAD (buried in prose): "Accepted formats include JPG, PNG, and GIF, with a minimum resolution of 2000px, maximum file size of 20MB, and sRGB color space recommended."

GOOD (structured list):
- **Resolution**: minimum 2000px on shortest side
- **File formats**: JPG, PNG, or GIF
- **Color space**: sRGB recommended
- **Maximum file size**: 20MB

Keep as prose when items are simple (under 3), or when argumentative flow matters more than scannability. Do NOT convert every paragraph into a list — most content should remain as natural prose.

{{file:shared/voice_guidelines.md}}

## Pre-defined Article Metadata

IMPORTANT:
- Naturally incorporate the target keywords throughout the content
- Do NOT include the title as an H1 heading (# Title) in your response - the title is stored separately in metadata. Do NOT use H1 heading (or markdown # Title) in your response.
- Start your content with ## (H2) sections, not # (H1)


## Article Assignment:

{{content}}

{{file:shared/article_structure_requirement.md}}
