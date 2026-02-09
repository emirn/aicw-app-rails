# frozen_string_literal: true

class WebsiteDeployment < ApplicationRecord
  include Auditable

  has_prefix_id :deployment

  # Associations
  belongs_to :website, class_name: "ProjectWebsite"

  # Status enum (matches Supabase CHECK constraint)
  enum :status, {
    pending: "pending",
    building: "building",
    deploying: "deploying",
    completed: "completed",
    failed: "failed"
  }

  # Scopes
  scope :recent, -> { order(created_at: :desc) }
  scope :completed, -> { where(status: :completed) }
  scope :failed, -> { where(status: :failed) }
  scope :in_progress, -> { where(status: [:pending, :building, :deploying]) }

  # Check if deployment is in a terminal state
  def finished?
    completed? || failed?
  end

  # Check if deployment is still running
  def running?
    pending? || building? || deploying?
  end

  # Mark as building
  def start_building!
    update!(status: :building)
  end

  # Mark as deploying
  def start_deploying!
    update!(status: :deploying)
  end

  # Mark as completed
  def complete!(url: nil, duration_ms: nil)
    update!(
      status: :completed,
      deployment_url: url,
      build_duration_ms: duration_ms,
      completed_at: Time.current
    )
  end

  # Mark as failed
  def fail!(error_message)
    update!(
      status: :failed,
      error_message: error_message,
      completed_at: Time.current
    )
  end

  # Duration in human-readable format
  def duration_formatted
    return nil unless build_duration_ms

    seconds = build_duration_ms / 1000.0
    if seconds < 60
      "#{seconds.round(1)}s"
    else
      minutes = (seconds / 60).floor
      remaining_seconds = (seconds % 60).round
      "#{minutes}m #{remaining_seconds}s"
    end
  end
end
