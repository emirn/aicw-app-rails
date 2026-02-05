import React, { useState, useEffect } from 'react'
import type { PipelineRun } from '@/types/pipeline'
import { usePipeline } from '@/hooks/usePipeline'
import PipelineProgress from './PipelineProgress'

interface PipelineHistoryProps {
  articleId: string
}

function PipelineHistory({ articleId }: PipelineHistoryProps) {
  const { getPipelineRuns } = usePipeline()
  const [runs, setRuns] = useState<PipelineRun[]>([])
  const [meta, setMeta] = useState({ total: 0, in_progress: 0, completed: 0, failed: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      try {
        const data = await getPipelineRuns(articleId)
        setRuns(data.pipeline_runs)
        setMeta(data.meta)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history')
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [articleId, getPipelineRuns])

  if (loading) {
    return <div className="text-center py-8 text-gray-500 text-sm">Loading pipeline history...</div>
  }

  if (error) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
        {error}
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        No pipeline runs yet. Use the Pipeline tab to run a pipeline on this article.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <span>Total: {meta.total}</span>
        {meta.completed > 0 && <span className="text-green-600">Completed: {meta.completed}</span>}
        {meta.failed > 0 && <span className="text-red-600">Failed: {meta.failed}</span>}
        {meta.in_progress > 0 && <span className="text-blue-600">In progress: {meta.in_progress}</span>}
      </div>

      {/* Runs list */}
      {runs.map(run => (
        <div key={run.id}>
          <div className="text-xs text-gray-400 mb-1">
            {new Date(run.created_at).toLocaleString()}
          </div>
          <PipelineProgress run={run} />
        </div>
      ))}
    </div>
  )
}

export default PipelineHistory
