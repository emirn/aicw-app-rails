# frozen_string_literal: true

module User::SubscriptionMethods
  extend ActiveSupport::Concern

  # Check if user has any active subscription via their owned accounts
  def subscribed?
    owned_accounts.joins(:subscription).where(subscriptions: { status: :active }).exists?
  end

  def max_projects
    default_account&.max_projects || 1
  end

  def max_views_per_month
    default_account&.max_views_per_month || 10_000
  end
end
