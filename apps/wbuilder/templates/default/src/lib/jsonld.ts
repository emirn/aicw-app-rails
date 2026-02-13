import type { CollectionEntry } from 'astro:content';
import type { SiteConfig } from './config';
import { getDefaultAuthor } from './config';
import { getCategoryUrl } from './categories';

interface BreadcrumbItem {
  position: number;
  name: string;
  item: string;
}

/**
 * Generate BreadcrumbList JSON-LD schema
 */
export function generateBreadcrumbList(
  config: SiteConfig,
  items: Array<{ name: string; url: string }>
): object {
  const siteUrl = config.seo.canonical_domain || config.branding.site.url;

  const itemListElement: BreadcrumbItem[] = [
    {
      position: 1,
      name: 'Home',
      item: siteUrl,
    },
    ...items.map((item, index) => ({
      position: index + 2,
      name: item.name,
      item: `${siteUrl}${item.url.startsWith('/') ? item.url : '/' + item.url}`,
    })),
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: itemListElement.map((item) => ({
      '@type': 'ListItem',
      position: item.position,
      name: item.name,
      item: item.item,
    })),
  };
}

/**
 * Generate BlogPosting JSON-LD schema for an article
 */
export function generateBlogPosting(
  config: SiteConfig,
  article: CollectionEntry<'articles'>,
  canonicalUrl: string
): object {
  const { data } = article;
  const siteUrl = config.seo.canonical_domain || config.branding.site.url;

  // Build publisher object
  const publisher: Record<string, unknown> = {
    '@type': 'Organization',
    name: config.seo.json_ld?.organization_name || config.branding.site.name,
  };

  if (config.seo.json_ld?.organization_logo) {
    const logoUrl = config.seo.json_ld.organization_logo.startsWith('http')
      ? config.seo.json_ld.organization_logo
      : `${siteUrl}${config.seo.json_ld.organization_logo}`;
    publisher.logo = {
      '@type': 'ImageObject',
      url: logoUrl,
    };
  }

  // Build the BlogPosting schema
  const blogPosting: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: data.title,
    datePublished: data.published_at.toISOString(),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
    publisher,
  };

  // Optional fields
  if (data.description) {
    blogPosting.description = data.description;
  }

  if (data.updated_at) {
    blogPosting.dateModified = data.updated_at.toISOString();
  } else {
    blogPosting.dateModified = data.published_at.toISOString();
  }

  const authorName = data.author || getDefaultAuthor(config);
  blogPosting.author = {
    '@type': 'Person',
    name: authorName,
  };

  // Image - use OG image or hero image
  const imageUrl = data.image_og || data.image_hero;
  if (imageUrl) {
    const fullImageUrl = imageUrl.startsWith('http')
      ? imageUrl
      : `${siteUrl}${imageUrl}`;
    blogPosting.image = fullImageUrl;
  } else if (config.seo.default_og_image) {
    const fullImageUrl = config.seo.default_og_image.startsWith('http')
      ? config.seo.default_og_image
      : `${siteUrl}${config.seo.default_og_image}`;
    blogPosting.image = fullImageUrl;
  }

  // Keywords
  if (data.keywords && data.keywords.length > 0) {
    blogPosting.keywords = data.keywords.join(', ');
  }

  return blogPosting;
}

/**
 * Generate article breadcrumbs with optional category
 */
export function generateArticleBreadcrumbs(
  config: SiteConfig,
  article: CollectionEntry<'articles'>
): object {
  const breadcrumbItems: Array<{ name: string; url: string }> = [];

  // Add first category if categories are enabled and article has categories
  if (config.categories?.enabled && article.data.categories?.length) {
    const firstCategory = article.data.categories[0];
    breadcrumbItems.push({
      name: firstCategory,
      url: getCategoryUrl(firstCategory, config),
    });
  }

  // Add the article itself
  breadcrumbItems.push({
    name: article.data.title,
    url: `/${article.slug}/`,
  });

  return generateBreadcrumbList(config, breadcrumbItems);
}
