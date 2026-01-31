# frozen_string_literal: true

class Subscription < ApplicationRecord
  # Connect to existing Supabase subscriptions table
  self.table_name = "subscriptions"
  self.primary_key = "id"

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
end
