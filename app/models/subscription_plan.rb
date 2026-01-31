# frozen_string_literal: true

class SubscriptionPlan < ApplicationRecord
  # Connect to existing Supabase subscription_plans table
  self.table_name = "subscription_plans"
  self.primary_key = "id"

  has_prefix_id :plan

  # Associations
  has_many :subscriptions, foreign_key: :plan_id

  # Validations
  validates :name, presence: true, uniqueness: true
  validates :max_projects, presence: true, numericality: { greater_than: 0 }
  validates :max_views_per_month, presence: true, numericality: { greater_than: 0 }

  # Scopes
  scope :trial_plans, -> { where(is_trial: true) }
  scope :paid_plans, -> { where(is_trial: false).where.not(price_cents: nil) }

  # Price helpers
  def free?
    price_cents.nil? || price_cents.zero?
  end

  def price_dollars
    return 0.0 if price_cents.nil?

    price_cents / 100.0
  end

  def formatted_price
    return "Free" if free?

    "$#{price_dollars}/mo"
  end
end
