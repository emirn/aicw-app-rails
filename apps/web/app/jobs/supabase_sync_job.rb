# frozen_string_literal: true

# Background job to sync project data to Supabase
# Retries with exponential backoff on failure
class SupabaseSyncJob < ApplicationJob
  queue_as :default

  # Retry with exponential backoff: 3s, 18s, 83s, 258s, 627s (~10 min total)
  retry_on StandardError, wait: :polynomially_longer, attempts: 5

  # Discard if project no longer exists
  discard_on ActiveRecord::RecordNotFound

  def perform(project_id)
    project = Project.find_by(id: project_id)
    return unless project # Project may have been deleted

    SupabaseProjectSync.sync(project)
  end
end
