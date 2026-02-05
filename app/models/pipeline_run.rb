# frozen_string_literal: true

class PipelineRun < ApplicationRecord
  has_prefix_id :pipeline_run

  # Associations
  belongs_to :article, class_name: "WebsiteArticle"

  # Status enum
  enum :status, {
    pending: "pending",
    running: "running",
    completed: "completed",
    failed: "failed",
    cancelled: "cancelled"
  }

  # Validations
  validates :pipeline_name, presence: true
  validates :article_id, presence: true

  # Scopes
  scope :recent, -> { order(created_at: :desc) }
  scope :in_progress, -> { where(status: [:pending, :running]) }
  scope :finished, -> { where(status: [:completed, :failed, :cancelled]) }

  # Check if run is in a terminal state
  def finished?
    completed? || failed? || cancelled?
  end

  # Start execution
  def start!
    update!(status: :running, started_at: Time.current)
  end

  # Advance to next action
  def advance_action!(action_name, result_data)
    new_results = results.merge(action_name => result_data)
    cost = result_data[:cost_usd] || result_data["cost_usd"] || 0
    tokens = result_data[:tokens] || result_data["tokens"] || 0

    update!(
      current_action_index: current_action_index + 1,
      results: new_results,
      total_cost_usd: total_cost_usd + cost,
      total_tokens: total_tokens + tokens
    )
  end

  # Mark as completed
  def complete!
    update!(
      status: :completed,
      completed_at: Time.current
    )
  end

  # Mark as failed
  def fail!(error)
    update!(
      status: :failed,
      error_message: error,
      completed_at: Time.current
    )
  end

  # Mark as cancelled
  def cancel!
    return if finished?

    update!(
      status: :cancelled,
      completed_at: Time.current
    )
  end

  # Current action name
  def current_action
    actions[current_action_index]
  end

  # Progress percentage
  def progress_percent
    return 100 if completed?
    return 0 if actions.blank?

    ((current_action_index.to_f / actions.size) * 100).round
  end

  # Duration in seconds
  def duration_seconds
    return nil unless started_at

    end_time = completed_at || Time.current
    (end_time - started_at).round
  end
end
