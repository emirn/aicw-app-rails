import React from 'react'
import type { PipelineRun } from '@/types/pipeline'

interface PipelineProgressProps {
  run: PipelineRun
  onCancel?: () => void
}

function getStatusColor(status: PipelineRun['status']) {
  switch (status) {
    case 'pending': return 'text-yellow-600'
    case 'running': return 'text-blue-600'
    case 'completed': return 'text-green-600'
    case 'failed': return 'text-red-600'
    case 'cancelled': return 'text-gray-500'
  }
}

function getActionStatus(run: PipelineRun, index: number): 'done' | 'running' | 'pending' | 'failed' {
  if (index < run.current_action_index) {
    const actionName = run.actions[index]
    const result = run.results[actionName]
    return result?.success === false ? 'failed' : 'done'
  }
  if (index === run.current_action_index && run.status === 'running') return 'running'
  if (run.status === 'failed' && index === run.current_action_index) return 'failed'
  return 'pending'
}

function PipelineProgress({ run, onCancel }: PipelineProgressProps) {
  const isActive = run.status === 'pending' || run.status === 'running'

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${getStatusColor(run.status)}`}>
            {run.status === 'running' && (
              <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-pulse mr-1" />
            )}
            {run.pipeline_name}
          </span>
          <span className={`px-2 py-0.5 text-xs rounded-full ${
            run.status === 'completed' ? 'bg-green-100 text-green-700' :
            run.status === 'failed' ? 'bg-red-100 text-red-700' :
            run.status === 'running' ? 'bg-blue-100 text-blue-700' :
            run.status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {run.status}
          </span>
        </div>
        {isActive && onCancel && (
          <button
            onClick={onCancel}
            className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${
            run.status === 'failed' ? 'bg-red-500' :
            run.status === 'completed' ? 'bg-green-500' :
            'bg-blue-500'
          }`}
          style={{ width: `${run.progress_percent}%` }}
        />
      </div>

      {/* Actions list */}
      <div className="space-y-1.5">
        {run.actions.map((action, index) => {
          const status = getActionStatus(run, index)
          return (
            <div key={action} className="flex items-center gap-2 text-sm">
              {status === 'done' && (
                <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {status === 'running' && (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
              )}
              {status === 'pending' && (
                <div className="w-4 h-4 rounded-full border-2 border-gray-300 shrink-0" />
              )}
              {status === 'failed' && (
                <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className={`${
                status === 'done' ? 'text-gray-500' :
                status === 'running' ? 'text-blue-700 font-medium' :
                status === 'failed' ? 'text-red-600' :
                'text-gray-400'
              }`}>
                {action}
              </span>
              {run.results[action] && (
                <span className="text-xs text-gray-400">
                  {run.results[action].tokens ? `${run.results[action].tokens} tokens` : ''}
                  {run.results[action].cost_usd ? ` ($${run.results[action].cost_usd.toFixed(4)})` : ''}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Error message */}
      {run.error_message && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {run.error_message}
        </div>
      )}

      {/* Summary */}
      {run.status === 'completed' && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
          {run.duration_seconds !== null && (
            <span>Duration: {run.duration_seconds}s</span>
          )}
          {run.total_tokens > 0 && (
            <span>Tokens: {run.total_tokens.toLocaleString()}</span>
          )}
          {run.total_cost_usd > 0 && (
            <span>Cost: ${run.total_cost_usd.toFixed(4)}</span>
          )}
        </div>
      )}
    </div>
  )
}

export default PipelineProgress
