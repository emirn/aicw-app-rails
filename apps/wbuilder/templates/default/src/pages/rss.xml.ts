import rss from '@astrojs/rss';
import { getConfig } from '../lib/config';
import { getPublishedArticles } from '../lib/articles';

export async function GET() {
  const config = getConfig();
  const articles = (await getPublishedArticles())
    .sort((a, b) => b.data.published_at.valueOf() - a.data.published_at.valueOf())
    .slice(0, 20);

  return rss({
    title: config.branding.site.name,
    description: config.branding.site.description || '',
    site: config.branding.site.url,
    items: articles.map((article) => ({
      title: article.data.title,
      pubDate: article.data.published_at,
      description: article.data.description || '',
      link: `/${article.slug}/`,
    })),
    customData: `<language>${config.branding.site.language || 'en'}</language>`,
  });
}
