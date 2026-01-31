# frozen_string_literal: true

class Account < ApplicationRecord
  has_prefix_id :acct

  # Associations
  belongs_to :owner, class_name: "User", inverse_of: :owned_accounts
  has_many :account_users, dependent: :destroy
  has_many :users, through: :account_users
  has_many :projects, dependent: :destroy

  # Validations
  validates :name, presence: true, length: { maximum: 100 }

  def owner?(user)
    owner_id == user.id
  end

  # Inherit subscription from owner (keep subscriptions on users for now)
  def subscription
    owner.subscription
  end

  def max_projects
    owner.max_projects
  end

  def max_views_per_month
    owner.max_views_per_month
  end
end
