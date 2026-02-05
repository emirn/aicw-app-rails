import React, { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiClient } from '@/lib/api-client'
import { useArticles } from '@/hooks/useArticles'
import ArticleList from './articles/ArticleList'
import ArticleEditor from './articles/ArticleEditor'
import ArticleForm from './articles/ArticleForm'
import PipelineRunner from './pipeline/PipelineRunner'
import Loading from './Loading'
import type { Article } from '@/types/article'

interface Website {
  id: string
  name: string
  slug: string
  status: string
  public_url: string | null
}

interface ProjectResponse {
  project: {
    id: string
    name: string
    website?: Website | null
  }
}

type View = 'list' | 'new' | 'edit' | 'pipeline'

function WebsiteBuilder() {
  const { projectId } = useParams<{ projectId: string }>()
  const [website, setWebsite] = useState<Website | null>(null)
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('list')
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Article | null>(null)

  const { articles, meta, loading: articlesLoading, error: articlesError, refresh, getArticle, createArticle, updateArticle, deleteArticle } = useArticles(website?.id || null)

  // Fetch project to get website
  useEffect(() => {
    const fetchProject = async () => {
      try {
        const data = await apiClient.get<ProjectResponse>(`/api/v1/projects/${projectId}`)
        setProjectName(data.project.name)
        if (data.project.website) {
          setWebsite(data.project.website)
        }
      } catch {
        // Project fetch error handled silently
      } finally {
        setLoading(false)
      }
    }
    fetchProject()
  }, [projectId])

  const handleEdit = useCallback((article: Article) => {
    setSelectedArticle(article)
    setView('edit')
  }, [])

  const handleDelete = useCallback((article: Article) => {
    setDeleteConfirm(article)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) return
    try {
      await deleteArticle(deleteConfirm.id)
      setDeleteConfirm(null)
      if (selectedArticle?.id === deleteConfirm.id) {
        setView('list')
        setSelectedArticle(null)
      }
    } catch {
      // Delete error
    }
  }, [deleteConfirm, deleteArticle, selectedArticle])

  const handleRunPipeline = useCallback((article: Article) => {
    setSelectedArticle(article)
    setView('pipeline')
  }, [])

  const handleCreate = useCallback(() => {
    setSelectedArticle(null)
    setView('new')
  }, [])

  const handleSaveNew = useCallback(async (data: Record<string, unknown>) => {
    setSaving(true)
    try {
      await createArticle(data)
      setView('list')
    } finally {
      setSaving(false)
    }
  }, [createArticle])

  const handleSaveExisting = useCallback(async (articleId: string, data: Record<string, unknown>) => {
    const updated = await updateArticle(articleId, data)
    return updated
  }, [updateArticle])

  const handleBack = useCallback(() => {
    setView('list')
    setSelectedArticle(null)
  }, [])

  if (loading) return <Loading />

  if (!website) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Website Builder</h1>
          <Link to={`/dashboard/projects/${projectId}`} className="text-blue-600 hover:text-blue-800">
            Back to Project
          </Link>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 text-center">
          <p className="text-gray-600 mb-4">No website configured for this project yet.</p>
          <p className="text-sm text-gray-500">Create a website from the project settings to start managing articles.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{website.name || 'Website Builder'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {projectName}
            {website.public_url && (
              <a href={website.public_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 hover:underline">
                {website.public_url}
              </a>
            )}
          </p>
        </div>
        <Link to={`/dashboard/projects/${projectId}`} className="text-sm text-blue-600 hover:text-blue-800">
          Back to Project
        </Link>
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Article</h3>
            <p className="text-gray-600 text-sm mb-4">
              Are you sure you want to delete &quot;{deleteConfirm.title}&quot;? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        {view === 'list' && (
          <ArticleList
            articles={articles}
            meta={meta}
            loading={articlesLoading}
            error={articlesError}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onRunPipeline={handleRunPipeline}
            onCreate={handleCreate}
            onRefresh={refresh}
          />
        )}

        {view === 'new' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <button onClick={handleBack} className="text-sm text-gray-500 hover:text-gray-700">&larr; Back</button>
              <h2 className="text-lg font-semibold text-gray-900">New Article</h2>
            </div>
            <ArticleForm
              onSave={handleSaveNew}
              onCancel={handleBack}
              saving={saving}
            />
          </div>
        )}

        {view === 'edit' && selectedArticle && (
          <ArticleEditor
            article={selectedArticle}
            websiteId={website.id}
            onSave={handleSaveExisting}
            onBack={handleBack}
            getArticle={getArticle}
          />
        )}

        {view === 'pipeline' && selectedArticle && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <button onClick={handleBack} className="text-sm text-gray-500 hover:text-gray-700">&larr; Back</button>
              <h2 className="text-lg font-semibold text-gray-900">Pipeline: {selectedArticle.title}</h2>
            </div>
            <PipelineRunner
              article={selectedArticle}
              onComplete={() => {
                refresh()
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default WebsiteBuilder
