import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '@/lib/api-client'
import Loading from './Loading'

interface ApiToken {
  id: string
  name: string
  token_preview: string
  token?: string
  last_used_at: string | null
  expires_at: string | null
  created_at: string
}

function ApiTokenSettings() {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newTokenName, setNewTokenName] = useState('')
  const [newTokenExpiry, setNewTokenExpiry] = useState('')
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchTokens = async () => {
    try {
      const data = await apiClient.get<{ api_tokens: ApiToken[] }>('/api/v1/api_tokens')
      setTokens(data.api_tokens)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tokens')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTokens()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTokenName.trim()) return

    setCreating(true)
    setError(null)
    try {
      const data = await apiClient.post<{ api_token: ApiToken }>('/api/v1/api_tokens', {
        name: newTokenName.trim(),
        expires_at: newTokenExpiry || undefined,
      })
      setCreatedToken(data.api_token.token || null)
      setNewTokenName('')
      setNewTokenExpiry('')
      fetchTokens()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token')
    } finally {
      setCreating(false)
    }
  }

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return
    setError(null)
    try {
      await apiClient.patch(`/api/v1/api_tokens/${id}`, { name: editName.trim() })
      setEditingId(null)
      fetchTokens()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update token')
    }
  }

  const handleDelete = async (id: string) => {
    setError(null)
    try {
      await apiClient.delete(`/api/v1/api_tokens/${id}`)
      setDeletingId(null)
      fetchTokens()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete token')
    }
  }

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <Loading />

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <Link to="/dashboard" className="text-primary hover:text-primary/80">
          Back to Dashboard
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
          {error}
        </div>
      )}

      {/* Created token banner */}
      {createdToken && (
        <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
          <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
            Copy this token now. You won't see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-2 bg-background border border-green-500/30 rounded text-sm font-mono break-all text-foreground">
              {createdToken}
            </code>
            <button
              onClick={() => copyToClipboard(createdToken)}
              className="px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setCreatedToken(null)}
            className="mt-2 text-sm text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create token form */}
      <div className="bg-card rounded-lg border border-border shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold text-card-foreground mb-4">Create API Token</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-foreground mb-1">Name</label>
            <input
              type="text"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              placeholder="e.g. CI/CD Pipeline"
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-ring"
              required
            />
          </div>
          <div className="min-w-[200px]">
            <label className="block text-sm font-medium text-foreground mb-1">
              Expires (optional)
            </label>
            <input
              type="date"
              value={newTokenExpiry}
              onChange={(e) => setNewTokenExpiry(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-ring"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !newTokenName.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Token'}
          </button>
        </form>
      </div>

      {/* Token list */}
      <div className="bg-card rounded-lg border border-border shadow-sm">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-xl font-semibold text-card-foreground">API Tokens</h2>
        </div>
        {tokens.length === 0 ? (
          <div className="px-6 py-8 text-center text-muted-foreground">
            No API tokens yet. Create one above to get started.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tokens.map((token) => (
              <div key={token.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {editingId === token.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="px-2 py-1 border border-input rounded text-sm bg-background text-foreground"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdate(token.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                      />
                      <button
                        onClick={() => handleUpdate(token.id)}
                        className="text-sm text-primary hover:text-primary/80"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="font-medium text-card-foreground">{token.name}</p>
                      <p className="text-sm text-muted-foreground font-mono">{token.token_preview}</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Created {new Date(token.created_at).toLocaleDateString()}
                        {token.last_used_at && (
                          <> &middot; Last used {new Date(token.last_used_at).toLocaleDateString()}</>
                        )}
                        {token.expires_at && (
                          <> &middot; Expires {new Date(token.expires_at).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {editingId !== token.id && (
                    <button
                      onClick={() => {
                        setEditingId(token.id)
                        setEditName(token.name)
                      }}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      Edit
                    </button>
                  )}
                  {deletingId === token.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-destructive">Delete?</span>
                      <button
                        onClick={() => handleDelete(token.id)}
                        className="text-sm text-destructive font-medium hover:text-destructive/80"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingId(token.id)}
                      className="text-sm text-destructive hover:text-destructive/80"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ApiTokenSettings
