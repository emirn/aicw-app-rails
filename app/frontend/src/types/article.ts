export interface Article {
  id: string
  website_id: string
  title: string
  slug: string
  description: string | null
  keywords: string[]
  image_hero: string | null
  image_og: string | null
  last_pipeline: string | null
  applied_actions: string[]
  published_at: string | null
  created_at: string
  updated_at: string
  path: string
  // Only included when fetching single article
  content?: string | null
  faq?: string | null
  jsonld?: string | null
  internal_links?: Array<{ slug: string; anchor: string }>
  assets?: Array<{ path: string; url: string }>
}

export interface ArticleListResponse {
  articles: Article[]
  meta: {
    total: number
    published: number
    drafts: number
  }
}

export interface ArticleResponse {
  article: Article
}

export interface ArticleFormData {
  title: string
  slug: string
  description: string
  content: string
  keywords: string[]
  image_hero: string
  image_og: string
  published_at: string
}
