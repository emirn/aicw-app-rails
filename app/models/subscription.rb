# frozen_string_literal: true

class Subscription < ApplicationRecord
  has_prefix_id :subscription

  # Associations
  belongs_to :user
  belongs_to :plan, class_name: "SubscriptionPlan"

  # Status enum (matches Supabase subscription_status type)
  enum :status, { active: "active", expired: "expired", cancelled: "cancelled" }

  # Scopes
  scope :active, -> { where(status: :active) }
  scope :trial, -> { joins(:plan).where(subscription_plans: { is_trial: true }) }

  # Check if subscription is active (including trial)
  def active?
    status == "active" && (!trial? || !trial_expired?)
  end

  def trial?
    plan&.is_trial?
  end

  def trial_expired?
    trial_ends_at.present? && trial_ends_at < Time.current
  end

  def days_remaining
    return nil unless trial?
    return 0 if trial_expired?

    ((trial_ends_at - Time.current) / 1.day).ceil
  end

  # Sync all user's projects to Supabase when subscription status changes
  after_commit :sync_user_projects_to_supabase, on: [ :create, :update ]

  private

  def sync_user_projects_to_supabase
    return unless saved_change_to_status? || saved_change_to_trial_ends_at?
    return unless SupabaseProjectSync.configured?

    # Sync all projects for this user with updated active status
    user.projects.find_each do |project|
      SupabaseSyncJob.perform_later(project.id)
    end
  end
end
