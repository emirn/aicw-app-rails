import type { APIRoute } from 'astro';
import { getConfig } from '../lib/config';

export const GET: APIRoute = () => {
  const config = getConfig();
  const siteUrl = config.branding.site.url.replace(/\/+$/, '');

  return new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap-index.xml\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
};
