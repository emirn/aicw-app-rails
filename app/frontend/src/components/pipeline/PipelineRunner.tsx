import React, { useState, useEffect } from 'react'
import type { Article } from '@/types/article'
import { usePipeline } from '@/hooks/usePipeline'
import { usePipelineStatus } from '@/hooks/usePipelineStatus'
import PipelineProgress from './PipelineProgress'

interface PipelineRunnerProps {
  article: Article
  onComplete?: () => void
}

function PipelineRunner({ article, onComplete }: PipelineRunnerProps) {
  const { pipelines, pipelinesLoading, pipelinesError, fetchPipelines, startPipeline, cancelPipelineRun } = usePipeline()
  const [selectedPipeline, setSelectedPipeline] = useState<string>('')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { run: activeRun } = usePipelineStatus(
    activeRunId ? article.id : null,
    activeRunId
  )

  // Fetch pipelines on mount
  useEffect(() => {
    fetchPipelines()
  }, [fetchPipelines])

  // Auto-select first pipeline
  useEffect(() => {
    if (pipelines.length > 0 && !selectedPipeline) {
      setSelectedPipeline(pipelines[0].name)
    }
  }, [pipelines, selectedPipeline])

  // Call onComplete when pipeline finishes
  useEffect(() => {
    if (activeRun && ['completed', 'failed', 'cancelled'].includes(activeRun.status)) {
      if (activeRun.status === 'completed' && onComplete) {
        onComplete()
      }
    }
  }, [activeRun?.status, onComplete])

  const handleStart = async () => {
    if (!selectedPipeline) return
    setStarting(true)
    setError(null)

    try {
      const run = await startPipeline(article.id, selectedPipeline)
      setActiveRunId(run.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start pipeline')
    } finally {
      setStarting(false)
    }
  }

  const handleCancel = async () => {
    if (!activeRunId) return
    try {
      await cancelPipelineRun(article.id, activeRunId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel')
    }
  }

  const isRunning = !!(activeRun && (activeRun.status === 'pending' || activeRun.status === 'running'))

  return (
    <div className="space-y-4">
      {/* Pipeline selector */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Run Pipeline</h3>

        {pipelinesError && (
          <div className="p-3 mb-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
            {pipelinesError}
            <button onClick={fetchPipelines} className="ml-2 underline">Retry</button>
          </div>
        )}

        {pipelinesLoading ? (
          <p className="text-sm text-gray-500">Loading pipelines...</p>
        ) : (
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Pipeline</label>
              <select
                value={selectedPipeline}
                onChange={e => setSelectedPipeline(e.target.value)}
                disabled={isRunning}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              >
                {pipelines.map(p => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.actions.length} actions)
                  </option>
                ))}
                {pipelines.length === 0 && (
                  <option value="">No pipelines available</option>
                )}
              </select>
            </div>
            <button
              onClick={handleStart}
              disabled={starting || isRunning || !selectedPipeline}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {starting ? 'Starting...' : 'Run'}
            </button>
          </div>
        )}

        {/* Selected pipeline details */}
        {selectedPipeline && !pipelinesLoading && (
          <div className="mt-3">
            {pipelines.filter(p => p.name === selectedPipeline).map(p => (
              <div key={p.name}>
                {p.description && <p className="text-xs text-gray-500 mb-1">{p.description}</p>}
                <div className="flex gap-1 flex-wrap">
                  {p.actions.map(action => (
                    <span key={action} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                      {action}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Article context */}
        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
          Article: {article.title}
          {article.applied_actions.length > 0 && (
            <span className="ml-2">
              (previously applied: {article.applied_actions.join(', ')})
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Active run progress */}
      {activeRun && (
        <PipelineProgress
          run={activeRun}
          onCancel={isRunning ? handleCancel : undefined}
        />
      )}
    </div>
  )
}

export default PipelineRunner
