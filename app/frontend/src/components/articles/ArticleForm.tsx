import React, { useState, useEffect } from 'react'
import type { Article } from '@/types/article'

interface ArticleFormProps {
  article?: Article | null
  onSave: (data: Record<string, unknown>) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function ArticleForm({ article, onSave, onCancel, saving }: ArticleFormProps) {
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [keywordsStr, setKeywordsStr] = useState('')
  const [imageHero, setImageHero] = useState('')
  const [imageOg, setImageOg] = useState('')
  const [publishedAt, setPublishedAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (article) {
      setTitle(article.title || '')
      setSlug(article.slug || '')
      setDescription(article.description || '')
      setKeywordsStr((article.keywords || []).join(', '))
      setImageHero(article.image_hero || '')
      setImageOg(article.image_og || '')
      setPublishedAt(article.published_at ? article.published_at.split('T')[0] : '')
    }
  }, [article])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Title is required')
      return
    }

    const data: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim(),
      keywords: keywordsStr.split(',').map(k => k.trim()).filter(Boolean),
      image_hero: imageHero.trim() || null,
      image_og: imageOg.trim() || null,
      published_at: publishedAt || null,
    }

    // Only set slug for new articles or if changed
    if (!article || slug !== article.slug) {
      data.slug = slug.trim() || title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    }

    try {
      await onSave(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  // Auto-generate slug from title for new articles
  const handleTitleChange = (value: string) => {
    setTitle(value)
    if (!article) {
      setSlug(value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
        <input
          type="text"
          value={title}
          onChange={e => handleTitleChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Article title"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
        <div className="flex items-center">
          <span className="text-sm text-gray-400 mr-1">/</span>
          <input
            type="text"
            value={slug}
            onChange={e => setSlug(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            placeholder="article-slug"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="SEO meta description"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Keywords</label>
        <input
          type="text"
          value={keywordsStr}
          onChange={e => setKeywordsStr(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="keyword1, keyword2, keyword3"
        />
        <p className="mt-1 text-xs text-gray-400">Comma-separated</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hero Image</label>
          <input
            type="text"
            value={imageHero}
            onChange={e => setImageHero(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            placeholder="assets/hero.png"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">OG Image</label>
          <input
            type="text"
            value={imageOg}
            onChange={e => setImageOg(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            placeholder="assets/og.png"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Publish Date</label>
        <input
          type="date"
          value={publishedAt}
          onChange={e => setPublishedAt(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : article ? 'Update Article' : 'Create Article'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

export default ArticleForm
