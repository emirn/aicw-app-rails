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
    "style": string,            // REQUIRED: One of "plain" | "border" | "pill" | "underline" | "highlight" | "monogram-circle" | "slash" | "backdrop"
    "font_family": string,      // Display font for logo (CSS font-family with fallbacks, e.g. "Playfair Display, serif"). Can differ from body/heading fonts for visual contrast.
    "font_weight": string,      // Font weight (e.g. "900", "700", "600")
    "layout": string,           // "text-only" or "mark-and-name" (mark = short abbreviation + full name side by side)
    "mark_text": string,        // Short 1-3 char abbreviation (e.g. "LV" for Legavima). Required when layout is "mark-and-name", empty otherwise.
    "color": string,            // Logo text color override (#RRGGBB). Optional — omit to use default text color.
    "background_color": string, // Logo background color (#RRGGBB). Used by pill, highlight, backdrop, monogram-circle styles. Optional.
    "size": string,             // "sm" | "md" | "lg" — pick based on text length (short names → lg, long names → sm)
    "letter_spacing": string,   // CSS letter-spacing (e.g. "0.05em", "0.15em"). Use wider spacing for uppercase/editorial brands.
    "text_transform": string,   // "uppercase" | "lowercase" | "capitalize" | "none". Uppercase for editorial/luxury brands.
    "separator": string,        // Separator between mark and name when layout is "mark-and-name": "|", "/", "·", "—", or "". Empty if not mark-and-name.
    "dark_mode": {              // Optional dark mode overrides. Only include if the chosen style needs color adjustments for dark backgrounds.
      "color": string,          // Logo text color in dark mode (#RRGGBB)
      "background_color": string // Logo background in dark mode (#RRGGBB)
    }
  },
  "colors": {
    "primary": string,          // Primary brand color (#RRGGBB) — main buttons, links, headers
    "primary_text": string,     // Text on primary color background (#RRGGBB) — must have WCAG AA 4.5:1 contrast with primary
    "secondary": string,        // Secondary brand color (#RRGGBB) — complementary to primary
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

### Logo Style Selection Guidelines

Pick ONE logo style that matches the brand personality. Each creates a visually distinct header logo:

| Style | Look | Best for |
|-------|------|----------|
| `plain` | Clean text, no decoration | Minimalist, modern brands |
| `border` | Text inside a rounded border box | Corporate, professional, established brands |
| `pill` | Text on colored pill/capsule background | SaaS, tech products, CTAs |
| `underline` | Text with colored bottom border | Editorial, news, media |
| `highlight` | Text on colored rectangle background | Bold, creative, marketing |
| `monogram-circle` | Mark letter(s) in colored circle + name | Agencies, portfolios, premium brands |
| `slash` | First letter + colored "/" + rest of name | Tech, developer, startup brands |
| `backdrop` | Text on subtle colored rounded rectangle | Soft, approachable, wellness brands |

**Logo layout rules:**
- Use `mark-and-name` layout for brands with names ≥ 8 characters. Pick a 1-3 letter abbreviation as `mark_text`.
- Short brand names (< 8 chars) should use `text-only` layout.
- When using `mark-and-name`, the `style` applies to the mark element. Pick a separator that fits the brand tone: `|` (corporate), `/` (tech), `·` (elegant), `—` (editorial), or `""` (clean).

**Logo font rules:**
- Pick a display font that contrasts with the body font for visual interest. E.g., if body is Inter (sans), logo could use Playfair Display (serif) or Montserrat at weight 900.
- Logo font should express brand personality — serif for authority, geometric sans for modern, rounded for friendly.
- Always include the font weight spec matching the chosen weight.

**Logo size rules:**
- 1-4 character logos → `lg`
- 5-10 character logos → `md`
- 11+ character logos → `sm`

**Letter spacing + text transform:**
- `uppercase` + wide letter-spacing (`0.1em`–`0.2em`) = luxury/editorial feel
- `lowercase` = casual/friendly
- Normal spacing (omit field) = default for most brands

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
- **Color harmony**: Primary and secondary should be complementary or analogous.
- **Dark mode**: Dark backgrounds should be dark grays (#111827 range), not pure black. Text should be slightly off-white for readability.
- **Honor user preferences**: If the user specified color preferences, use those as the starting point and build a cohesive palette around them.

## Reiteration Context

{{reiteration_context}}

## Output Format

Return ONLY the raw JSON object. No markdown fences, no explanation, no surrounding text. Just the JSON.
