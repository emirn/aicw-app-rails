import { useState, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import type { Pipeline, PipelinesResponse, PipelineRunResponse, PipelineRunListResponse } from '@/types/pipeline'

export function usePipeline() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [pipelinesLoading, setPipelinesLoading] = useState(false)
  const [pipelinesError, setPipelinesError] = useState<string | null>(null)

  const fetchPipelines = useCallback(async () => {
    setPipelinesLoading(true)
    try {
      const data = await apiClient.get<PipelinesResponse>('/api/v1/pipelines')
      setPipelines(data.pipelines)
      setPipelinesError(null)
    } catch (err) {
      setPipelinesError(err instanceof Error ? err.message : 'Failed to load pipelines')
    } finally {
      setPipelinesLoading(false)
    }
  }, [])

  const startPipeline = useCallback(async (articleId: string, pipelineName: string, actions?: string[]) => {
    const body: Record<string, unknown> = { pipeline_name: pipelineName }
    if (actions) body.actions = actions

    const data = await apiClient.post<PipelineRunResponse>(
      `/api/v1/articles/${articleId}/pipeline_runs`,
      body
    )
    return data.pipeline_run
  }, [])

  const getPipelineRuns = useCallback(async (articleId: string) => {
    const data = await apiClient.get<PipelineRunListResponse>(
      `/api/v1/articles/${articleId}/pipeline_runs`
    )
    return data
  }, [])

  const cancelPipelineRun = useCallback(async (articleId: string, runId: string) => {
    const data = await apiClient.post<PipelineRunResponse>(
      `/api/v1/articles/${articleId}/pipeline_runs/${runId}/cancel`
    )
    return data.pipeline_run
  }, [])

  return {
    pipelines,
    pipelinesLoading,
    pipelinesError,
    fetchPipelines,
    startPipeline,
    getPipelineRuns,
    cancelPipelineRun,
  }
}
