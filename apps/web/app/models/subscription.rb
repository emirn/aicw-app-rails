# frozen_string_literal: true

class Subscription < ApplicationRecord
  has_prefix_id :subscription

  belongs_to :account
  belongs_to :user, optional: true
  belongs_to :plan, class_name: "SubscriptionPlan"

  enum :status, { active: "active", expired: "expired", cancelled: "cancelled" }

  scope :active, -> { where(status: :active) }
  scope :trial, -> { joins(:plan).where(subscription_plans: { is_trial: true }) }

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

  after_commit :sync_account_projects_to_supabase, on: [:create, :update]

  private

  def sync_account_projects_to_supabase
    return unless saved_change_to_status? || saved_change_to_trial_ends_at?
    return unless SupabaseProjectSync.configured?

    account.projects.find_each do |project|
      SupabaseSyncJob.perform_later(project.id)
    end
  end
end
