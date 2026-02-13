import type { APIRoute } from 'astro';
import { getConfig } from '../lib/config';

export const GET: APIRoute = () => {
  const config = getConfig();
  const siteUrl = config.branding.site.url.replace(/\/+$/, '');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${siteUrl}/sitemap-0.xml</loc>
  </sitemap>
</sitemapindex>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
