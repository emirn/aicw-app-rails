// @ts-check
import { defineConfig } from 'astro/config';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
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
  const searchEnabled = siteConfig?.search?.enabled || false;

  // Build integrations list
  const integrations = [sitemap(), mdx()];

  // Only add pagefind if search is enabled
  if (searchEnabled) {
    integrations.push(pagefind());
  }

  return {
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
  };
});
