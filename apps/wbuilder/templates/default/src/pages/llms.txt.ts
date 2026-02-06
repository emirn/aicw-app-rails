import type { APIRoute } from 'astro';
import { getConfig } from '../lib/config';
import { getPublishedArticles } from '../lib/articles';
import { getCategoriesWithCounts } from '../lib/categories';

export const GET: APIRoute = async () => {
  const config = getConfig();

  // Return 404 if llms.txt is disabled
  if (!config.llmsTxt?.enabled) {
    return new Response('Not found', { status: 404 });
  }

  const siteUrl = config.seo.canonicalDomain || config.branding.site.url;
  const lines: string[] = [];

  // Site header
  lines.push(`# ${config.branding.site.name}`);
  lines.push('');

  // Site description
  if (config.branding.site.description) {
    lines.push(`> ${config.branding.site.description}`);
    lines.push('');
  }

  // Categories section
  if (config.llmsTxt.includeCategories !== false && config.categories?.enabled) {
    const categories = await getCategoriesWithCounts();
    if (categories.length > 0) {
      lines.push('## Categories');
      lines.push('');
      for (const cat of categories) {
        lines.push(`- [${cat.name}](${siteUrl}${cat.url}): ${cat.count} articles`);
      }
      lines.push('');
    }
  }

  // Articles section
  if (config.llmsTxt.includeArticles !== false) {
    const articles = await getPublishedArticles();

    // Sort by date descending
    const sortedArticles = articles.sort((a, b) => {
      const dateA = a.data.date?.getTime() || 0;
      const dateB = b.data.date?.getTime() || 0;
      return dateB - dateA;
    });

    // Limit number of articles
    const maxArticles = config.llmsTxt.maxArticles || 50;
    const limitedArticles = sortedArticles.slice(0, maxArticles);

    if (limitedArticles.length > 0) {
      lines.push('## Articles');
      lines.push('');
      for (const article of limitedArticles) {
        const url = `${siteUrl}/${article.slug}/`;
        const description = article.data.description
          ? `: ${truncate(article.data.description, 100)}`
          : '';
        lines.push(`- [${article.data.title}](${url})${description}`);
      }
      lines.push('');
    }
  }

  const content = lines.join('\n');

  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3).trim() + '...';
}
