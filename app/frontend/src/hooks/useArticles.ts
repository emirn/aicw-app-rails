import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import type { Article, ArticleListResponse, ArticleResponse } from '@/types/article'

export function useArticles(websiteId: string | null) {
  const [articles, setArticles] = useState<Article[]>([])
  const [meta, setMeta] = useState({ total: 0, published: 0, drafts: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchArticles = useCallback(async () => {
    if (!websiteId) return
    setLoading(true)
    try {
      const data = await apiClient.get<ArticleListResponse>(
        `/api/v1/websites/${websiteId}/articles`
      )
      setArticles(data.articles)
      setMeta(data.meta)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load articles')
    } finally {
      setLoading(false)
    }
  }, [websiteId])

  useEffect(() => {
    fetchArticles()
  }, [fetchArticles])

  const getArticle = useCallback(async (articleId: string): Promise<Article | null> => {
    if (!websiteId) return null
    try {
      const data = await apiClient.get<ArticleResponse>(
        `/api/v1/websites/${websiteId}/articles/${articleId}`
      )
      return data.article
    } catch {
      return null
    }
  }, [websiteId])

  const createArticle = useCallback(async (articleData: Record<string, unknown>) => {
    if (!websiteId) throw new Error('No website')
    const data = await apiClient.post<ArticleResponse>(
      `/api/v1/websites/${websiteId}/articles`,
      { article: articleData }
    )
    await fetchArticles()
    return data.article
  }, [websiteId, fetchArticles])

  const updateArticle = useCallback(async (articleId: string, articleData: Record<string, unknown>) => {
    if (!websiteId) throw new Error('No website')
    const data = await apiClient.patch<ArticleResponse>(
      `/api/v1/websites/${websiteId}/articles/${articleId}`,
      { article: articleData }
    )
    await fetchArticles()
    return data.article
  }, [websiteId, fetchArticles])

  const deleteArticle = useCallback(async (articleId: string) => {
    if (!websiteId) throw new Error('No website')
    await apiClient.delete(`/api/v1/websites/${websiteId}/articles/${articleId}`)
    await fetchArticles()
  }, [websiteId, fetchArticles])

  return {
    articles,
    meta,
    loading,
    error,
    refresh: fetchArticles,
    getArticle,
    createArticle,
    updateArticle,
    deleteArticle,
  }
}
