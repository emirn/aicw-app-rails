You are a branding expert. Generate a complete project branding configuration for a website.

## Website Details

- **Name**: {{site_name}}
- **Description**: {{site_description}}
- **URL**: {{site_url}}
- **Color preference**: {{color_preference}}

## Your Task

Generate a JSON object matching the IProjectBranding schema below. Every field must be populated with thoughtful, industry-appropriate values.

### IProjectBranding Schema

```
{
  "badge": string,              // Short uppercase label (2-6 chars) shown on article cards. Examples: "BLOG", "GUIDE", "TOOLS", "LEGAL", "TECH", "NEWS"
  "brand_name": string,         // Display name of the brand (can differ from site name)
  "site": {
    "name": string,             // Site name (usually same as brand_name)
    "tagline": string,          // Short catchy tagline (5-10 words)
    "description": string,      // SEO meta description (120-155 chars)
    "url": string,              // Website URL (use provided URL or derive from name)
    "language": "en"            // Always "en"
  },
  "logo": {
    "type": "text",             // Always "text" (no image generation)
    "text": string,             // Logo text (usually brand name or abbreviation)
    "image_url": "",            // Always empty
    "show_border": boolean      // true for professional/corporate, false for creative/casual
  },
  "colors": {
    "primary": string,          // Primary brand color (#RRGGBB) — main buttons, links, headers
    "primary_text": string,     // Text on primary color background (#RRGGBB) — must have WCAG AA 4.5:1 contrast with primary
    "secondary": string,        // Secondary brand color (#RRGGBB) — complementary to primary
    "accent": string,           // Accent/highlight color (#RRGGBB) — calls to action, badges
    "background": string,       // Page background (#RRGGBB) — usually white or near-white
    "background_secondary": string, // Secondary background (#RRGGBB) — cards, sidebars, code blocks
    "text_primary": string,     // Main body text color (#RRGGBB) — must have WCAG AA contrast with background
    "text_secondary": string,   // Secondary text (#RRGGBB) — subtitles, metadata
    "text_muted": string,       // Muted text (#RRGGBB) — timestamps, captions
    "border": string            // Border color (#RRGGBB) — dividers, card borders
  },
  "dark_mode": {
    "enabled": true,
    "default": "dark",          // "dark" or "light"
    "toggle_position": "footer",
    "colors": {
      "text_primary": string,       // Light text for dark backgrounds (#RRGGBB)
      "text_secondary": string,     // Secondary text for dark mode (#RRGGBB)
      "text_muted": string,         // Muted text for dark mode (#RRGGBB)
      "background": string,         // Dark page background (#RRGGBB)
      "background_secondary": string, // Slightly lighter dark background (#RRGGBB)
      "border": string              // Dark mode border color (#RRGGBB)
    }
  },
  "illustration_style": string, // Pick from the allowed styles list below
  "typography": {
    "fontFamily": string,         // Body text font (CSS font-family with fallbacks, e.g. "Inter, system-ui, sans-serif")
    "headingFontFamily": string,  // Heading font (can differ from body for contrast, e.g. "Playfair Display, serif")
    "googleFonts": string[]       // Google Fonts specs to load (e.g. ["Inter:wght@400;500;600;700", "Playfair Display:wght@400;700"])
  }
}
```

### Illustration Styles

Pick the ONE style that best matches the brand personality and audience. Only choose from this list:

{{illustration_styles}}

### Font Selection Guidelines

Pick fonts from this curated Google Fonts list. Always include CSS fallbacks.

**Sans-Serif (modern, clean):**
- Inter — clean, modern, highly readable (great for tech/SaaS)
- DM Sans — geometric, clean, modern
- Open Sans — friendly, highly readable
- Lato — warm, professional
- Poppins — geometric, modern, bold
- Nunito — rounded, friendly, approachable
- Work Sans — clean, professional
- Raleway — elegant, thin
- Source Sans 3 — technical, clean
- Roboto — versatile, neutral
- Montserrat — geometric, strong headings

**Serif (traditional, authoritative):**
- Merriweather — highly readable, warm
- Playfair Display — elegant, editorial (best for headings only)
- Lora — elegant, readable
- Source Serif 4 — clean, modern serif
- Libre Baskerville — classic, authoritative

**Font pairing rules:**
- Same font for body+headings (e.g., Inter/Inter) — safe, cohesive
- Serif headings + sans body (e.g., Playfair Display/Inter) — editorial, premium feel
- Match brand personality: Legal/finance → serif. Tech/SaaS → geometric sans. Creative → display fonts. Health/edu → rounded sans.
- Always include weight specs in googleFonts (e.g., "Inter:wght@400;500;600;700")
- Always include CSS fallbacks: sans-serif fonts end with "system-ui, sans-serif", serif fonts end with "serif"

### Color Design Guidelines

- **WCAG Accessibility**: Ensure primary_text has at least 4.5:1 contrast ratio with primary. Ensure text_primary has at least 4.5:1 contrast with background.
- **Industry conventions**: Legal/finance → navy/gold. Health → green/blue. Tech → blue/purple. Food → warm reds/oranges. Creative → bold/vibrant. Education → calming blues/greens.
- **Color harmony**: Primary and secondary should be complementary or analogous. Accent should pop against both light and dark backgrounds.
- **Dark mode**: Dark backgrounds should be dark grays (#111827 range), not pure black. Text should be slightly off-white for readability.
- **Honor user preferences**: If the user specified color preferences, use those as the starting point and build a cohesive palette around them.

## Output Format

Return ONLY the raw JSON object. No markdown fences, no explanation, no surrounding text. Just the JSON.
