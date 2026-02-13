/**
 * Branding Preview - Display AI-generated branding with colored swatches
 */

import chalk from 'chalk';

/**
 * Render a color swatch block with hex value and label
 */
function colorSwatch(hex: string, label: string): string {
  try {
    const block = chalk.bgHex(hex)('    ');
    return `  ${block} ${hex}  ${label}`;
  } catch {
    return `  [????] ${hex}  ${label}`;
  }
}

/**
 * Display a formatted branding preview to stderr
 */
export function displayBrandingPreview(branding: any): void {
  const log = (msg: string) => console.error(msg);

  log('');
  log(chalk.bold('=== Generated Branding ==='));
  log('');

  // Brand identity
  if (branding.brand_name) {
    log(`  Brand:    ${branding.brand_name}`);
  }
  if (branding.badge) {
    log(`  Badge:    ${branding.badge}`);
  }
  if (branding.site?.tagline) {
    log(`  Tagline:  ${branding.site.tagline}`);
  }
  if (branding.site?.description) {
    log(`  SEO:      ${branding.site.description}`);
  }

  // Light mode colors
  const colors = branding.colors;
  if (colors && typeof colors === 'object') {
    log('');
    log(chalk.bold('  Light Mode Colors:'));
    for (const [key, value] of Object.entries(colors)) {
      if (typeof value === 'string') {
        log(colorSwatch(value, key));
      }
    }
  }

  // Dark mode colors
  const darkColors = branding.dark_mode?.colors;
  if (darkColors && typeof darkColors === 'object') {
    log('');
    log(chalk.bold('  Dark Mode Colors:'));
    for (const [key, value] of Object.entries(darkColors)) {
      if (typeof value === 'string') {
        log(colorSwatch(value, key));
      }
    }
  }

  // Typography
  const typo = branding.typography;
  if (typo) {
    log('');
    log(chalk.bold('  Typography:'));
    if (typo.fontFamily) log(`    Body:     ${typo.fontFamily}`);
    if (typo.headingFontFamily) log(`    Headings: ${typo.headingFontFamily}`);
    if (typo.googleFonts?.length) log(`    Fonts:    ${typo.googleFonts.join(', ')}`);
  }

  // Logo preview
  const logo = branding.logo;
  if (logo) {
    log('');
    log(chalk.bold('  Logo:'));

    const style = logo.style || (logo.show_border ? 'border' : 'plain');
    const logoText = logo.text || branding.brand_name || branding.site?.name || '?';
    const markText = logo.mark_text || '';
    const layout = logo.layout || 'text-only';
    const separator = logo.separator || '';
    const primary = branding.colors?.primary || '#3B82F6';

    // Build styled logo text for terminal
    let styledLogo = '';
    try {
      const baseText = layout === 'mark-and-name' && markText
        ? `${markText}${separator ? ` ${separator} ` : ' '}${logoText}`
        : logoText;

      switch (style) {
        case 'pill':
        case 'highlight':
        case 'backdrop':
          styledLogo = chalk.bgHex(primary).hex('#FFFFFF').bold(` ${baseText} `);
          break;
        case 'border':
          styledLogo = chalk.hex(primary)('┌─') + chalk.bold(baseText) + chalk.hex(primary)('─┐');
          break;
        case 'underline':
          styledLogo = chalk.bold.underline(baseText);
          break;
        case 'monogram-circle':
          // Show just mark in a colored circle-like rendering
          const mark = markText || logoText.charAt(0);
          styledLogo = chalk.bgHex(primary).hex('#FFFFFF').bold(` ${mark} `) + ' ' + chalk.bold(logoText);
          break;
        case 'slash':
          styledLogo = chalk.bold(logoText.charAt(0)) + chalk.hex(primary)('/') + chalk.bold(logoText.slice(1));
          break;
        default: // plain
          styledLogo = chalk.bold(baseText);
      }
    } catch {
      styledLogo = chalk.bold(logoText);
    }

    log(`    ${styledLogo}  (style: ${style})`);
    if (logo.font_family) log(`    Font: ${logo.font_family}${logo.font_weight ? ` @ ${logo.font_weight}` : ''}`);
    if (logo.size && logo.size !== 'md') log(`    Size: ${logo.size}`);
    if (logo.letter_spacing) log(`    Letter spacing: ${logo.letter_spacing}`);
    if (logo.text_transform) log(`    Transform: ${logo.text_transform}`);
    if (logo.color) log(`    Color: ${logo.color}`);
    if (logo.background_color) log(`    Background: ${logo.background_color}`);
  }

  // Illustration style
  if (branding.illustration_style) {
    log('');
    log(chalk.bold('  Illustration Style:'));
    log(`    ${branding.illustration_style}`);
  }

  log('');
}
