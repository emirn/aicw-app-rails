# frozen_string_literal: true

module Account::Membership
  extend ActiveSupport::Concern

  included do
    belongs_to :owner, class_name: "User", inverse_of: :owned_accounts
    has_many :account_users, dependent: :destroy
    has_many :users, through: :account_users
    has_many :account_invitations, dependent: :destroy
  end

  def owner?(user)
    owner_id == user.id
  end
end
