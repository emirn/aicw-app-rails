import React, { useState, useEffect, useCallback } from 'react'
import type { Article } from '@/types/article'
import ArticleForm from './ArticleForm'
import ContentEditor from './ContentEditor'
import PipelineRunner from '../pipeline/PipelineRunner'
import PipelineHistory from '../pipeline/PipelineHistory'

interface ArticleEditorProps {
  article: Article | null
  websiteId: string
  onSave: (articleId: string, data: Record<string, unknown>) => Promise<Article>
  onBack: () => void
  getArticle: (articleId: string) => Promise<Article | null>
}

type Tab = 'metadata' | 'content' | 'pipeline' | 'history'

function ArticleEditor({ article: initialArticle, onSave, onBack, getArticle }: ArticleEditorProps) {
  const [article, setArticle] = useState<Article | null>(initialArticle)
  const [activeTab, setActiveTab] = useState<Tab>('content')
  const [saving, setSaving] = useState(false)
  const [content, setContent] = useState(initialArticle?.content || '')

  // Fetch full article with content on mount
  useEffect(() => {
    if (initialArticle?.id) {
      getArticle(initialArticle.id).then(fullArticle => {
        if (fullArticle) {
          setArticle(fullArticle)
          setContent(fullArticle.content || '')
        }
      })
    }
  }, [initialArticle?.id, getArticle])

  const handleMetaSave = useCallback(async (data: Record<string, unknown>) => {
    if (!article) return
    setSaving(true)
    try {
      const updated = await onSave(article.id, data)
      setArticle(updated)
    } finally {
      setSaving(false)
    }
  }, [article, onSave])

  const handleContentSave = useCallback(async () => {
    if (!article) return
    setSaving(true)
    try {
      const updated = await onSave(article.id, { content })
      setArticle(updated)
    } finally {
      setSaving(false)
    }
  }, [article, content, onSave])

  const handlePipelineComplete = useCallback(() => {
    // Refresh article data after pipeline completion
    if (article?.id) {
      getArticle(article.id).then(fullArticle => {
        if (fullArticle) {
          setArticle(fullArticle)
          setContent(fullArticle.content || '')
        }
      })
    }
  }, [article?.id, getArticle])

  if (!article) {
    return <div className="text-center py-12 text-gray-500">Loading article...</div>
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'content', label: 'Content' },
    { id: 'metadata', label: 'Metadata' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'history', label: 'History' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back
          </button>
          <h2 className="text-lg font-semibold text-gray-900 truncate">{article.title}</h2>
          {article.last_pipeline && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
              {article.last_pipeline}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="flex gap-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-2 px-1 text-sm border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'content' && (
          <ContentEditor
            content={content}
            onChange={setContent}
            onSave={handleContentSave}
            saving={saving}
          />
        )}
        {activeTab === 'metadata' && (
          <ArticleForm
            article={article}
            onSave={handleMetaSave}
            onCancel={onBack}
            saving={saving}
          />
        )}
        {activeTab === 'pipeline' && (
          <PipelineRunner
            article={article}
            onComplete={handlePipelineComplete}
          />
        )}
        {activeTab === 'history' && (
          <PipelineHistory articleId={article.id} />
        )}
      </div>
    </div>
  )
}

export default ArticleEditor
