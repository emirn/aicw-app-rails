/**
 * Patches vite-plugin-ruby@5.1.2 to fix `this.meta` being undefined
 * when used with Vite 5. The config hook's `this` context is undefined
 * in Vite 5, causing "Cannot read properties of undefined (reading 'meta')".
 *
 * This patch adds a guard: `this && this.meta && this.meta.rolldownVersion`
 *
 * Can be removed once vite-plugin-ruby fixes this upstream.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(__dirname, '../node_modules/vite-plugin-ruby/dist/index.js');

try {
  let content = readFileSync(filePath, 'utf8');
  const buggy = 'const isUsingRolldown = this.meta && this.meta.rolldownVersion;';
  const fixed = 'const isUsingRolldown = this && this.meta && this.meta.rolldownVersion;';

  if (content.includes(buggy)) {
    content = content.replace(buggy, fixed);
    writeFileSync(filePath, content, 'utf8');
    console.log('[patch] Fixed vite-plugin-ruby this.meta bug');
  } else if (content.includes(fixed)) {
    console.log('[patch] vite-plugin-ruby already patched');
  } else {
    console.log('[patch] vite-plugin-ruby: pattern not found, may need update');
  }
} catch (e) {
  console.error('[patch] Failed to patch vite-plugin-ruby:', e.message);
}
