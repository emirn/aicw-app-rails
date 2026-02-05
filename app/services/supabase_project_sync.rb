# frozen_string_literal: true

# Service to sync project data to Supabase for edge function validation
# Rails is the source of truth - Supabase is just a lookup table for analytics
class SupabaseProjectSync
  SUPABASE_URL = ENV.fetch("SUPABASE_URL", nil)
  SUPABASE_KEY = ENV.fetch("SUPABASE_SERVICE_ROLE_KEY", nil)

  class SyncError < StandardError; end

  def self.sync(project)
    new.sync(project)
  end

  def self.update_status(tracking_id, is_active:)
    new.update_status(tracking_id, is_active: is_active)
  end

  def self.configured?
    SUPABASE_URL.present? && SUPABASE_KEY.present?
  end

  def sync(project)
    return false unless self.class.configured?

    response = connection.post("/rest/v1/projects_new") do |req|
      req.headers["Prefer"] = "resolution=merge-duplicates"
      req.body = {
        tracking_id: project.tracking_id,
        domain: project.domain,
        is_active: determine_active_status(project),
        rails_project_id: project.id.to_s,
        updated_at: Time.current.iso8601
      }.to_json
    end

    unless response.success?
      Rails.logger.error("[SupabaseSync] Failed to sync project #{project.tracking_id}: #{response.status} - #{response.body}")
      raise SyncError, "Supabase sync failed: #{response.status}"
    end

    Rails.logger.info("[SupabaseSync] Project synced: #{project.tracking_id} (active: #{determine_active_status(project)})")
    true
  end

  def update_status(tracking_id, is_active:)
    return false unless self.class.configured?

    response = connection.patch("/rest/v1/projects_new?tracking_id=eq.#{tracking_id}") do |req|
      req.body = {
        is_active: is_active,
        updated_at: Time.current.iso8601
      }.to_json
    end

    if response.success?
      Rails.logger.info("[SupabaseSync] Status updated: #{tracking_id} -> is_active: #{is_active}")
      true
    else
      Rails.logger.error("[SupabaseSync] Failed to update status for #{tracking_id}: #{response.status} - #{response.body}")
      false
    end
  end

  private

  def connection
    @connection ||= Faraday.new(url: SUPABASE_URL) do |f|
      f.request :json
      f.response :json
      f.headers["apikey"] = SUPABASE_KEY
      f.headers["Authorization"] = "Bearer #{SUPABASE_KEY}"
      f.headers["Content-Type"] = "application/json"
      f.adapter Faraday.default_adapter
    end
  end

  def determine_active_status(project)
    # Logic to determine if project should be active
    # Based on subscription status in Rails
    subscription = project.user&.subscription
    return false unless subscription

    subscription.active? || subscription.trial?
  end
end
