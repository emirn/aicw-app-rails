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
      date: meta.date || new Date().toISOString(),
      updated_at: meta.updated_at,
      published_at: meta.published_at,
      image_hero: meta.image_hero,
      image_og: meta.image_og,
      keywords: meta.keywords || [],
      author: meta.author,
      categories: meta.categories || [],
      tags: meta.tags || [],
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

  // 6. Copy favicon if exists
  const faviconExtensions = ['ico', 'png', 'svg'];
  for (const ext of faviconExtensions) {
    const faviconPath = path.join(jobDir, `favicon.${ext}`);
    try {
      await fs.access(faviconPath);
      await fs.copyFile(faviconPath, path.join(workDir, `public/favicon.${ext}`));
      logFn(`Copied favicon.${ext}`);
      break;
    } catch {
      // Favicon not found, continue
    }
  }

  // 7. Install dependencies if node_modules doesn't exist
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

  // 8. Run astro build
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

  // 9. Copy dist to output directory
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
