// @ts-check
import { defineConfig } from 'astro/config';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
// Note: Pagefind is run as a post-build step via CLI (see package.json build script)
// The astro-pagefind integration is kept for dev server middleware only
import pagefind from 'astro-pagefind';
import { validateImages } from './src/integrations/validate-images.js';
import { ogImages } from './src/integrations/og-images.js';
import { sitemapCopy } from './src/integrations/sitemap-copy.js';

// Load site config if available
function getSiteConfig() {
  try {
    const configPath = './data/site-config.json';
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, 'utf-8'));
    }
  } catch {}
  return null;
}

// https://astro.build/config
// Note: Using object form (not function form) for defineConfig to ensure integration hooks run properly
const siteConfig = getSiteConfig();
const siteUrl = siteConfig?.branding?.site?.url;
if (!siteUrl) {
  throw new Error('Missing site URL: data/site-config.json must have branding.site.url');
}

// Always include pagefind integration for dev server middleware
// ogImages BEFORE validateImages so OG images exist during validation
const integrations = [sitemap(), mdx(), pagefind(), ogImages(), validateImages(), sitemapCopy()];

export default defineConfig({
  site: siteUrl,
  trailingSlash: 'always',
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src')
      }
    }
  },
  integrations
});
