# frozen_string_literal: true

class ArticlePipelineJob < ApplicationJob
  queue_as :default

  # AI calls cost money and partial state makes retry dangerous
  discard_on StandardError

  def perform(execution_prefix_id)
    execution = PipelineExecution.find_by_prefix_id!(execution_prefix_id)

    # Skip if execution is already in a terminal state
    return if execution.finished?

    result = ArticlePipelineService.new(execution).execute

    unless result[:success]
      Rails.logger.error("Article pipeline failed: #{result[:error]}")
    end
  end
end
