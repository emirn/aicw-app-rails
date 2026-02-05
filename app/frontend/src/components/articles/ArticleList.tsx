import React, { useState } from 'react'
import type { Article } from '@/types/article'
import ArticleCard from './ArticleCard'

interface ArticleListProps {
  articles: Article[]
  meta: { total: number; published: number; drafts: number }
  loading: boolean
  error: string | null
  onEdit: (article: Article) => void
  onDelete: (article: Article) => void
  onRunPipeline: (article: Article) => void
  onCreate: () => void
  onRefresh: () => void
}

function ArticleList({
  articles,
  meta,
  loading,
  error,
  onEdit,
  onDelete,
  onRunPipeline,
  onCreate,
  onRefresh,
}: ArticleListProps) {
  const [filter, setFilter] = useState<'all' | 'published' | 'drafts'>('all')

  const filteredArticles = articles.filter(article => {
    if (filter === 'published') return !!article.published_at
    if (filter === 'drafts') return !article.published_at
    return true
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-sm ${filter === 'all' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              All ({meta.total})
            </button>
            <button
              onClick={() => setFilter('published')}
              className={`px-3 py-1.5 text-sm border-l border-gray-200 ${filter === 'published' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Published ({meta.published})
            </button>
            <button
              onClick={() => setFilter('drafts')}
              className={`px-3 py-1.5 text-sm border-l border-gray-200 ${filter === 'drafts' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Drafts ({meta.drafts})
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Refresh
          </button>
          <button
            onClick={onCreate}
            className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            New Article
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && articles.length === 0 && (
        <div className="text-center py-12 text-gray-500">Loading articles...</div>
      )}

      {/* Empty state */}
      {!loading && filteredArticles.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">
            {filter === 'all' ? 'No articles yet.' : `No ${filter} articles.`}
          </p>
          {filter === 'all' && (
            <button
              onClick={onCreate}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Create your first article
            </button>
          )}
        </div>
      )}

      {/* Article list */}
      <div className="space-y-2">
        {filteredArticles.map(article => (
          <ArticleCard
            key={article.id}
            article={article}
            onEdit={onEdit}
            onDelete={onDelete}
            onRunPipeline={onRunPipeline}
          />
        ))}
      </div>
    </div>
  )
}

export default ArticleList
