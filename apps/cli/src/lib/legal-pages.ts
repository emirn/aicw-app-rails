/**
 * Legal Pages Helper
 *
 * Creates built-in privacy/terms markdown pages from templates
 * and generates footer column configuration for legal links.
 */

import { promises as fs } from 'fs';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

export interface LegalPagesChoice {
  mode: 'builtin' | 'external' | 'none';
  privacyUrl?: string;  // only when mode === 'external'
  termsUrl?: string;     // only when mode === 'external'
}

interface FooterLink {
  label: string;
  url: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

/**
 * Create built-in legal pages from markdown templates.
 * Places files in project's pages/privacy/index.md and pages/terms/index.md.
 * Skips if files already exist (reinit safety).
 */
export async function createBuiltinLegalPages(
  projectDir: string,
  siteName: string,
  siteUrl: string
): Promise<{ created: string[] }> {
  const templatesDir = path.join(__dirname, '..', 'config', 'templates', 'pages');
  const pagesDir = path.join(projectDir, 'pages');
  const created: string[] = [];
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  for (const pageName of ['privacy', 'terms']) {
    const destDir = path.join(pagesDir, pageName);
    const destFile = path.join(destDir, 'index.md');

    // Skip if already exists (reinit safety)
    if (existsSync(destFile)) {
      continue;
    }

    const templatePath = path.join(templatesDir, `${pageName}.md`);
    let content = readFileSync(templatePath, 'utf-8');

    // Replace placeholders
    content = content.replace(/\{\{site_name\}\}/g, siteName);
    content = content.replace(/\{\{site_url\}\}/g, siteUrl || 'https://example.com');
    content = content.replace(/\{\{date\}\}/g, currentDate);

    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(destFile, content, 'utf-8');
    created.push(`pages/${pageName}/index.md`);
  }

  return { created };
}

/**
 * Get footer columns based on legal pages choice.
 * Returns the full columns array (Navigation + optional Legal)
 * because deepMerge in local-publish replaces arrays wholesale.
 */
export function getLegalFooterColumns(choice: LegalPagesChoice): FooterColumn[] {
  const navColumn: FooterColumn = {
    title: 'Navigation',
    links: [
      { label: 'Home', url: '/' },
      { label: 'Contacts', url: '/contacts/' },
    ],
  };

  if (choice.mode === 'none') {
    return [navColumn];
  }

  const legalColumn: FooterColumn = {
    title: 'Legal',
    links: [],
  };

  if (choice.mode === 'builtin') {
    legalColumn.links = [
      { label: 'Privacy', url: '/privacy/' },
      { label: 'Terms', url: '/terms/' },
    ];
  } else if (choice.mode === 'external') {
    if (choice.privacyUrl) {
      legalColumn.links.push({ label: 'Privacy', url: choice.privacyUrl });
    }
    if (choice.termsUrl) {
      legalColumn.links.push({ label: 'Terms', url: choice.termsUrl });
    }
  }

  if (legalColumn.links.length === 0) {
    return [navColumn];
  }

  return [navColumn, legalColumn];
}
