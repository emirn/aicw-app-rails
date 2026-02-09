# frozen_string_literal: true

class AuditLog < ApplicationRecord
  has_prefix_id :audit

  acts_as_tenant :account

  belongs_to :account
  belongs_to :user
  belongs_to :auditable, polymorphic: true, optional: true

  validates :action, presence: true

  scope :recent, -> { order(created_at: :desc) }
  scope :by_action, ->(action) { where(action: action) }
  scope :by_user, ->(user) { where(user: user) }

  def self.log(action, auditable: nil, metadata: {})
    return unless Current.account && Current.user

    create!(
      account: Current.account,
      user: Current.user,
      action: action,
      auditable: auditable,
      metadata: metadata,
      request_id: Current.request_id,
      ip_address: Current.ip_address
    )
  end
end
