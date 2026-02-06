# frozen_string_literal: true

class PipelineExecutionJob < ApplicationJob
  queue_as :default

  # Retry up to 3 times with exponential backoff
  retry_on StandardError, wait: :polynomially_longer, attempts: 3

  def perform(pipeline_run_prefix_id)
    pipeline_run = PipelineRun.find_by!(prefix_id: pipeline_run_prefix_id)

    # Skip if already in a terminal state
    return if pipeline_run.finished?

    result = PipelineService.new(pipeline_run).execute

    unless result[:success]
      Rails.logger.error("Pipeline execution failed: #{result[:error]}")
    end
  end
end
