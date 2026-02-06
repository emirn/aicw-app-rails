import React, { useState, useEffect } from 'react'

interface ContentEditorProps {
  content: string
  onChange: (content: string) => void
  onSave: () => Promise<void>
  saving: boolean
}

function ContentEditor({ content, onChange, onSave, saving }: ContentEditorProps) {
  const [preview, setPreview] = useState(false)
  const [localContent, setLocalContent] = useState(content)

  useEffect(() => {
    setLocalContent(content)
  }, [content])

  const handleChange = (value: string) => {
    setLocalContent(value)
    onChange(value)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 bg-gray-50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreview(false)}
            className={`px-3 py-1 text-sm rounded ${!preview ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Edit
          </button>
          <button
            onClick={() => setPreview(true)}
            className={`px-3 py-1 text-sm rounded ${preview ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Preview
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {localContent.length} chars
          </span>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-3 py-1 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Editor / Preview */}
      {preview ? (
        <div className="flex-1 p-4 overflow-auto bg-white border border-t-0 border-gray-200 rounded-b-lg prose prose-sm max-w-none">
          <div dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(localContent) }} />
        </div>
      ) : (
        <textarea
          value={localContent}
          onChange={e => handleChange(e.target.value)}
          className="flex-1 p-4 border border-t-0 border-gray-200 rounded-b-lg font-mono text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Write your article content in Markdown..."
          spellCheck={false}
        />
      )}
    </div>
  )
}

// Basic markdown to HTML for preview (no external deps)
function simpleMarkdownToHtml(md: string): string {
  if (!md) return '<p class="text-gray-400">No content yet.</p>'

  let html = md
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```[\s\S]*?```/g, (match) => {
      const code = match.replace(/```\w*\n?/, '').replace(/```$/, '')
      return `<pre><code>${code}</code></pre>`
    })
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    // Line breaks into paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')

  return `<p>${html}</p>`
}

export default ContentEditor
