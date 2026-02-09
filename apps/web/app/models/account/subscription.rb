# frozen_string_literal: true

module Account::Subscription
  extend ActiveSupport::Concern

  included do
    has_one :subscription, class_name: "::Subscription", dependent: :destroy
  end

  def max_projects
    subscription&.plan&.max_projects || 1
  end

  def max_views_per_month
    subscription&.plan&.max_views_per_month || 10_000
  end
end
