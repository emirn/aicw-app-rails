// @ts-check
import { defineConfig } from 'astro/config';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
// Note: Pagefind is run as a post-build step via CLI (see package.json build script)
// The astro-pagefind integration is kept for dev server middleware only
import pagefind from 'astro-pagefind';

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
export default defineConfig(() => {
  const siteConfig = getSiteConfig();
  const siteUrl = siteConfig?.site?.url || 'https://example.com';

  // Always include pagefind integration for dev server middleware
  const integrations = [sitemap(), mdx(), pagefind()];

  return {
    site: siteUrl,
    trailingSlash: 'always',
    vite: {
      resolve: {
        alias: {
          '@': resolve(__dirname, './src')
        }
      }
    },
    integrations
  };
});
