export interface PipelineRun {
  id: string
  article_id: string
  pipeline_name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  actions: string[]
  current_action_index: number
  current_action: string | null
  progress_percent: number
  results: Record<string, ActionResult>
  total_cost_usd: number
  total_tokens: number
  error_message: string | null
  duration_seconds: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface ActionResult {
  success: boolean
  cost_usd?: number
  tokens?: number
  error?: string
  completed_at?: string
}

export interface Pipeline {
  name: string
  description: string
  actions: string[]
}

export interface PipelineRunListResponse {
  pipeline_runs: PipelineRun[]
  meta: {
    total: number
    in_progress: number
    completed: number
    failed: number
  }
}

export interface PipelineRunResponse {
  pipeline_run: PipelineRun
}

export interface PipelinesResponse {
  pipelines: Pipeline[]
}
