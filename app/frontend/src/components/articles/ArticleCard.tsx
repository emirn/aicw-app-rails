import React from 'react'
import type { Article } from '@/types/article'

interface ArticleCardProps {
  article: Article
  onEdit: (article: Article) => void
  onDelete: (article: Article) => void
  onRunPipeline: (article: Article) => void
}

function getPipelineBadge(article: Article) {
  if (!article.last_pipeline) {
    return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">No pipeline</span>
  }
  const colors: Record<string, string> = {
    generate: 'bg-blue-100 text-blue-700',
    enhance: 'bg-green-100 text-green-700',
    optimize: 'bg-purple-100 text-purple-700',
  }
  const colorClass = colors[article.last_pipeline] || 'bg-gray-100 text-gray-700'
  return <span className={`px-2 py-0.5 text-xs rounded-full ${colorClass}`}>{article.last_pipeline}</span>
}

function ArticleCard({ article, onEdit, onDelete, onRunPipeline }: ArticleCardProps) {
  const isPublished = !!article.published_at

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{article.title}</h3>
            {isPublished ? (
              <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 whitespace-nowrap">Published</span>
            ) : (
              <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700 whitespace-nowrap">Draft</span>
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono mb-2">/{article.slug}</p>
          {article.description && (
            <p className="text-sm text-gray-600 line-clamp-2 mb-2">{article.description}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {getPipelineBadge(article)}
            {article.applied_actions.length > 0 && (
              <span className="text-xs text-gray-400">
                {article.applied_actions.length} action{article.applied_actions.length !== 1 ? 's' : ''}
              </span>
            )}
            {article.keywords.length > 0 && (
              <span className="text-xs text-gray-400">
                {article.keywords.slice(0, 3).join(', ')}
                {article.keywords.length > 3 && ` +${article.keywords.length - 3}`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onRunPipeline(article)}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="Run pipeline"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            onClick={() => onEdit(article)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(article)}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default ArticleCard
