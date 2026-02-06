import { useState, useEffect, useRef, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import type { PipelineRun, PipelineRunResponse } from '@/types/pipeline'

const POLL_INTERVAL = 3000

export function usePipelineStatus(articleId: string | null, runId: string | null) {
  const [run, setRun] = useState<PipelineRun | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!articleId || !runId) return

    try {
      const data = await apiClient.get<PipelineRunResponse>(
        `/api/v1/articles/${articleId}/pipeline_runs/${runId}`
      )
      setRun(data.pipeline_run)
      setError(null)

      // Stop polling if finished
      if (['completed', 'failed', 'cancelled'].includes(data.pipeline_run.status)) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status')
    }
  }, [articleId, runId])

  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    setLoading(true)
    fetchStatus().then(() => setLoading(false))
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL)
  }, [fetchStatus])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Start polling when articleId/runId change
  useEffect(() => {
    if (articleId && runId) {
      startPolling()
    }
    return () => stopPolling()
  }, [articleId, runId, startPolling, stopPolling])

  return {
    run,
    loading,
    error,
    startPolling,
    stopPolling,
    refresh: fetchStatus,
  }
}
