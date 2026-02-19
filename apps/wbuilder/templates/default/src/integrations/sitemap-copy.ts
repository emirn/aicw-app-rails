/**
 * Copies sitemap-index.xml → sitemap.xml after build.
 *
 * @astrojs/sitemap generates sitemap-index.xml with references to all
 * sitemap chunks (sitemap-0.xml, sitemap-1.xml, etc.). This integration
 * copies it to sitemap.xml so robots.txt can reference a single stable URL.
 */

import type { AstroIntegration } from 'astro';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export function sitemapCopy(): AstroIntegration {
  return {
    name: 'sitemap-copy',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const outDir = fileURLToPath(dir);
        const src = path.join(outDir, 'sitemap-index.xml');
        const dest = path.join(outDir, 'sitemap.xml');
        try {
          await fs.copyFile(src, dest);
        } catch {
          // sitemap-index.xml not generated — nothing to copy
        }
      }
    }
  };
}
