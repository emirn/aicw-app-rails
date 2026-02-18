import { execa } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Process a data URL and save it as a file
 * @param {string} dataUrl - The data URL to process
 * @param {string} filename - Base filename (without extension)
 * @param {string} publicDir - Path to the public directory
 * @returns {Promise<string>} - The new URL path to use (e.g., '/logo.png')
 */
async function processDataUrl(dataUrl, filename, publicDir) {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    return dataUrl; // Not a data URL, return as-is
  }

  const match = dataUrl.match(/^data:image\/([^;]+);base64,(.+)$/);
  if (!match) {
    return dataUrl; // Invalid data URL format, return as-is
  }

  const [, mimeType, base64Data] = match;
  // Handle svg+xml mime type
  const ext = mimeType === 'svg+xml' ? 'svg' : mimeType;
  const outputPath = path.join(publicDir, `${filename}.${ext}`);

  await fs.writeFile(outputPath, Buffer.from(base64Data, 'base64'));
  return `/${filename}.${ext}`;
}

/**
 * Process all data URLs in the site config
 * @param {Object} config - Site configuration object
 * @param {string} publicDir - Path to the public directory
 * @param {Function} logFn - Logging function
 * @returns {Promise<Object>} - Updated config with processed URLs
 */
async function processConfigDataUrls(config, publicDir, logFn) {
  const updatedConfig = JSON.parse(JSON.stringify(config)); // Deep clone

  // Process logo.imageUrl
  if (updatedConfig.logo?.imageUrl?.startsWith('data:')) {
    logFn('Processing data URL for logo...');
    updatedConfig.logo.imageUrl = await processDataUrl(
      updatedConfig.logo.imageUrl,
      'logo',
      publicDir
    );
    logFn(`  Saved logo as ${updatedConfig.logo.imageUrl}`);
  }

  // Process seo.defaultOgImage
  if (updatedConfig.seo?.defaultOgImage?.startsWith('data:')) {
    logFn('Processing data URL for OG image...');
    updatedConfig.seo.defaultOgImage = await processDataUrl(
      updatedConfig.seo.defaultOgImage,
      'og-image',
      publicDir
    );
    logFn(`  Saved OG image as ${updatedConfig.seo.defaultOgImage}`);
  }

  // Process seo.jsonLd.organizationLogo
  if (updatedConfig.seo?.jsonLd?.organizationLogo?.startsWith('data:')) {
    logFn('Processing data URL for organization logo...');
    updatedConfig.seo.jsonLd.organizationLogo = await processDataUrl(
      updatedConfig.seo.jsonLd.organizationLogo,
      'org-logo',
      publicDir
    );
    logFn(`  Saved organization logo as ${updatedConfig.seo.jsonLd.organizationLogo}`);
  }

  return updatedConfig;
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  // Simple YAML key-value parsing (handles quoted and unquoted strings)
  const frontmatter = {};
  for (const line of match[1].split('\n')) {
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      let value = kvMatch[2].trim();
      // Remove surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[kvMatch[1]] = value;
    }
  }
  return { frontmatter, body: match[2] };
}

/**
 * Extract all local image references from markdown/HTML body content
 */
function extractBodyImages(body) {
  const images = [];

  // Markdown images: ![alt](url)
  const mdRegex = /!\[.*?\]\(([^)]+\.(?:webp|png|jpg|jpeg|gif|svg|avif))\)/gi;
  let match;
  while ((match = mdRegex.exec(body)) !== null) {
    if (match[1]) images.push(match[1]);
  }

  // HTML img tags: <img src="url">
  const htmlRegex = /<img[^>]+src=["']([^"']+\.(?:webp|png|jpg|jpeg|gif|svg|avif))["']/gi;
  while ((match = htmlRegex.exec(body)) !== null) {
    if (match[1]) images.push(match[1]);
  }

  return images;
}

/**
 * Validate that all image references in articles point to existing files.
 * Runs before npm install / astro build for fast feedback.
 *
 * @param {string} workDir - The Astro project working directory
 * @param {Function} logFn - Logging function
 */
async function validateArticleImages(workDir, logFn) {
  const articlesDir = path.join(workDir, 'src/content/articles');
  const publicDir = path.join(workDir, 'public');

  let entries;
  try {
    entries = await fs.readdir(articlesDir, { withFileTypes: true, recursive: true });
  } catch {
    logFn('No articles directory found, skipping image validation');
    return;
  }

  const errors = [];
  let articlesChecked = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md') && !entry.name.endsWith('.mdx')) continue;

    const parentPath = entry.parentPath || entry.path || articlesDir;
    const fullPath = path.join(parentPath, entry.name);
    const relativePath = path.relative(articlesDir, fullPath);
    const slug = relativePath.replace(/\.(md|mdx)$/, '');

    const content = await fs.readFile(fullPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    articlesChecked++;

    // Check image_hero
    if (frontmatter.image_hero && !frontmatter.image_hero.startsWith('http')) {
      const imgPath = frontmatter.image_hero.startsWith('/')
        ? path.join(publicDir, frontmatter.image_hero)
        : path.join(publicDir, frontmatter.image_hero);
      try {
        await fs.access(imgPath);
      } catch {
        errors.push(`[image_hero] ${slug}: missing ${frontmatter.image_hero}`);
      }
    }

    // Check body images
    const bodyImages = extractBodyImages(body);
    for (const imgRef of bodyImages) {
      if (imgRef.startsWith('http://') || imgRef.startsWith('https://')) continue;
      const imgPath = imgRef.startsWith('/')
        ? path.join(publicDir, imgRef)
        : path.join(publicDir, imgRef);
      try {
        await fs.access(imgPath);
      } catch {
        errors.push(`[body] ${slug}: missing ${imgRef}`);
      }
    }
  }

  if (errors.length > 0) {
    const errorMsg = `Image validation failed: ${errors.length} missing image(s) in ${articlesChecked} articles:\n  ${errors.join('\n  ')}`;
    logFn(errorMsg);
    throw new Error(errorMsg);
  }

  logFn(`Image validation passed: ${articlesChecked} articles checked`);
}

/**
 * Build an Astro site from the astro-blog template
 *
 * @param {Object} options
 * @param {string} options.templateDir - Path to the astro-blog template
 * @param {string} options.outputDir - Path to output the built site
 * @param {Object} options.config - Site configuration object
 * @param {Array} options.articles - Array of articles to include
 * @param {string} options.jobDir - Path to the job directory (for assets)
 * @param {Function} options.logFn - Logging function
 */
export async function buildAstroSite(options) {
  const {
    templateDir,
    outputDir,
    config,
    articles,
    jobDir,
    logFn = console.log
  } = options;

  logFn('Starting Astro build...');

  // 1. Create working directory and copy template
  const workDir = path.join(jobDir, 'astro-build');
  logFn(`Copying template to ${workDir}`);
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.cp(templateDir, workDir, { recursive: true });

  // 1.5. Copy shared og-image-gen library source to template (if not already present)
  const ogImageGenDir = path.join(workDir, 'src/lib/og-image-gen');
  try {
    await fs.access(ogImageGenDir);
    logFn('Shared og-image-gen library already present');
  } catch {
    // Development mode: copy from monorepo packages/
    const monoRepoShared = path.resolve(workDir, '../../packages/og-image-gen/src');
    const monoRepoFonts = path.resolve(workDir, '../../packages/og-image-gen/fonts');
    try {
      await fs.mkdir(path.join(workDir, 'src/lib/og-image-gen'), { recursive: true });
      await fs.cp(monoRepoShared, path.join(workDir, 'src/lib/og-image-gen'), { recursive: true });
      await fs.mkdir(path.join(workDir, 'src/fonts'), { recursive: true });
      await fs.cp(monoRepoFonts, path.join(workDir, 'src/fonts'), { recursive: true });
      logFn('Copied shared og-image-gen library');
    } catch {
      logFn('Shared og-image-gen not found, OG images will be skipped');
    }
  }

  // 2. Process data URLs and write site config
  logFn('Writing site configuration...');
  const dataDir = path.join(workDir, 'data');
  const publicDir = path.join(workDir, 'public');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(publicDir, { recursive: true });

  // Process any data URLs in the config (logo, OG image, etc.)
  const processedConfig = await processConfigDataUrls(config, publicDir, logFn);

  await fs.writeFile(
    path.join(dataDir, 'site-config.json'),
    JSON.stringify(processedConfig, null, 2)
  );

  // 3. Write articles as MDX files
  logFn(`Processing ${articles.length} articles...`);
  const articlesDir = path.join(workDir, 'src/content/articles');
  await fs.mkdir(articlesDir, { recursive: true });

  for (const article of articles) {
    // Parse article - supports both JSON format and raw markdown with frontmatter
    let articleData;

    if (article.filename?.endsWith('.json')) {
      // JSON format from BlogPostGen
      articleData = JSON.parse(article.content);
    } else if (article.slug && article.meta) {
      // Already parsed JSON object
      articleData = article;
    } else {
      // Legacy markdown format - parse frontmatter
      const matter = await import('gray-matter');
      const parsed = matter.default(article.content);
      articleData = {
        slug: parsed.data.slug,
        meta: {
          title: parsed.data.title,
          description: parsed.data.description || parsed.data.excerpt,
          date: parsed.data.date,
          updated_at: parsed.data.updated_at,
          published_at: parsed.data.published_at,
          image_hero: parsed.data.image_hero || parsed.data.featured_image_url || parsed.data.image,
          image_og: parsed.data.image_og || parsed.data.image_social,
          keywords: parsed.data.keywords ? (Array.isArray(parsed.data.keywords) ? parsed.data.keywords : parsed.data.keywords.split(',').map(k => k.trim())) : [],
          author: parsed.data.author,
          categories: parsed.data.categories || [],
          tags: parsed.data.tags || [],
        },
        content: parsed.content
      };
    }

    const { slug, meta, content } = articleData;

    if (!slug) {
      logFn(`Warning: Article missing slug, skipping: ${article.filename}`);
      continue;
    }

    // Build frontmatter for MDX
    const frontmatter = {
      title: meta.title || 'Untitled',
      description: meta.description,
      published_at: meta.created_at || meta.published_at || new Date().toISOString(),
      updated_at: meta.updated_at,
      image_hero: meta.image_hero,
      image_og: meta.image_og,
      keywords: meta.keywords || [],
      author: meta.author,
      categories: meta.categories || [],
      tags: meta.tags || [],
      reviewed_by: meta.reviewed_by,
    };

    // Filter out undefined values
    const cleanFrontmatter = Object.fromEntries(
      Object.entries(frontmatter).filter(([_, v]) => v !== undefined && v !== null)
    );

    // Create MDX content
    const mdxContent = `---
${Object.entries(cleanFrontmatter)
  .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
  .join('\n')}
---

${content}
`;

    // Preserve nested directory structure from slug
    const filePath = path.join(articlesDir, slug + '.md');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, mdxContent);
    logFn(`  Written article: ${slug}.md`);
  }

  // 4. Copy assets from job directory to public/assets
  const jobAssetsDir = path.join(jobDir, 'assets');
  const publicAssetsDir = path.join(workDir, 'public/assets');
  try {
    await fs.access(jobAssetsDir);
    await fs.mkdir(publicAssetsDir, { recursive: true });
    await fs.cp(jobAssetsDir, publicAssetsDir, { recursive: true });
    logFn('Copied assets to public folder');
  } catch {
    // No assets directory
  }

  // 5. Copy images from job directory to public/images
  const jobImagesDir = path.join(jobDir, 'images');
  const publicImagesDir = path.join(workDir, 'public/images');
  try {
    await fs.access(jobImagesDir);
    const imageFiles = await fs.readdir(jobImagesDir);
    if (imageFiles.length > 0) {
      await fs.mkdir(publicImagesDir, { recursive: true });
      await fs.cp(jobImagesDir, publicImagesDir, { recursive: true });
      logFn(`Copied ${imageFiles.length} images`);
    }
  } catch {
    // No images directory
  }

  // 6. Copy favicon if exists (check root first, then assets/branding/ from sgen)
  const faviconExtensions = ['ico', 'png', 'svg'];
  let faviconFound = false;
  for (const ext of faviconExtensions) {
    const faviconPath = path.join(jobDir, `favicon.${ext}`);
    try {
      await fs.access(faviconPath);
      await fs.copyFile(faviconPath, path.join(workDir, `public/favicon.${ext}`));
      logFn(`Copied favicon.${ext}`);
      faviconFound = true;
      break;
    } catch {
      // Favicon not found, continue
    }
  }
  // Fallback: check assets/branding/ (pre-generated by sgen generate_favicon)
  if (!faviconFound) {
    for (const ext of faviconExtensions) {
      const brandingPath = path.join(jobDir, 'assets', 'branding', `favicon.${ext}`);
      try {
        await fs.access(brandingPath);
        await fs.copyFile(brandingPath, path.join(workDir, `public/favicon.${ext}`));
        // Also copy to public/assets/branding/ for template reference
        const brandingDest = path.join(workDir, 'public', 'assets', 'branding');
        await fs.mkdir(brandingDest, { recursive: true });
        await fs.copyFile(brandingPath, path.join(brandingDest, `favicon.${ext}`));
        logFn(`Copied favicon.${ext} from assets/branding/`);
        faviconFound = true;
      } catch { /* not found */ }
    }
  }

  // 6.5. Merge custom project styles into project.css
  if (options.stylesDir) {
    let projectCss = '/* Project-specific styles */\n';
    const globalStylesPath = path.join(options.stylesDir, 'styles.css');
    try {
      await fs.access(globalStylesPath);
      projectCss += await fs.readFile(globalStylesPath, 'utf-8') + '\n';
    } catch { /* no global styles */ }
    try {
      const entries = await fs.readdir(options.stylesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sectionCss = path.join(options.stylesDir, entry.name, 'styles.css');
          try {
            await fs.access(sectionCss);
            projectCss += `/* Section: ${entry.name} */\n`;
            projectCss += await fs.readFile(sectionCss, 'utf-8') + '\n';
          } catch { /* no section styles */ }
        }
      }
    } catch { /* no styles dir */ }
    await fs.writeFile(path.join(workDir, 'src/styles/project.css'), projectCss);
    logFn('Merged custom project styles into project.css');

    // Merge custom project scripts into project-scripts.js
    let projectJs = '/* Project-specific scripts */\n';
    const globalScriptsPath = path.join(options.stylesDir, 'scripts.js');
    try {
      await fs.access(globalScriptsPath);
      projectJs += await fs.readFile(globalScriptsPath, 'utf-8') + '\n';
    } catch { /* no global scripts */ }
    try {
      const jsEntries = await fs.readdir(options.stylesDir, { withFileTypes: true });
      for (const entry of jsEntries) {
        if (entry.isDirectory()) {
          const sectionJs = path.join(options.stylesDir, entry.name, 'scripts.js');
          try {
            await fs.access(sectionJs);
            projectJs += `/* Section: ${entry.name} */\n`;
            projectJs += await fs.readFile(sectionJs, 'utf-8') + '\n';
          } catch { /* no section scripts */ }
        }
      }
    } catch { /* no styles dir */ }
    await fs.mkdir(path.join(workDir, 'src/scripts'), { recursive: true });
    await fs.writeFile(path.join(workDir, 'src/scripts/project-scripts.js'), projectJs);
    logFn('Merged custom project scripts into project-scripts.js');
  }

  // 7. Validate image references before expensive build steps
  logFn('Validating image references...');
  await validateArticleImages(workDir, logFn);

  // 8. Install dependencies if node_modules doesn't exist
  // (In Docker, we pre-install deps, but for local dev we might need to install)
  const nodeModulesPath = path.join(workDir, 'node_modules');
  try {
    await fs.access(nodeModulesPath);
    logFn('Dependencies already installed');
  } catch {
    logFn('Installing dependencies...');
    await execa('npm', ['ci'], {
      cwd: workDir,
      timeout: 300000, // 5 minutes
    });
  }

  // 9. Run astro build
  logFn('Running astro build...');
  const buildResult = await execa('npm', ['run', 'build'], {
    cwd: workDir,
    timeout: 600000, // 10 minutes
    env: {
      ...process.env,
      NODE_ENV: 'production'
    }
  });

  if (buildResult.stdout) {
    logFn(buildResult.stdout);
  }

  // 10. Copy dist to output directory
  const distDir = path.join(workDir, 'dist');
  logFn(`Copying build output to ${outputDir}`);
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.cp(distDir, outputDir, { recursive: true });

  logFn('Astro build complete!');

  // Count output files for stats
  let totalPages = 0;
  async function countHtmlFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await countHtmlFiles(path.join(dir, entry.name));
      } else if (entry.name.endsWith('.html')) {
        totalPages++;
      }
    }
  }
  await countHtmlFiles(outputDir);

  return {
    totalArticles: articles.length,
    totalPages,
    outputDir
  };
}

export default { buildAstroSite };
