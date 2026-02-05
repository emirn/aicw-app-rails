# frozen_string_literal: true

class AccountUser < ApplicationRecord
  ROLES = [:admin, :member].freeze

  # Associations
  belongs_to :account
  belongs_to :user

  # Validations
  validates :user_id, uniqueness: { scope: :account_id, message: "is already a member of this account" }

  # Scopes (SQLite JSON syntax)
  scope :admins, -> { where("json_extract(roles, '$.admin') = ?", true) }
  scope :members, -> { where("json_extract(roles, '$.member') = ?", true) }

  # Role methods - dynamically define admin? and member?
  ROLES.each do |role|
    define_method("#{role}?") do
      roles&.dig(role.to_s) == true
    end
  end

  # Authorization helpers
  def can_manage_members?
    admin?
  end

  def can_manage_projects?
    admin?
  end

  # Check if this membership can be removed (owner cannot be removed)
  def removable?
    !account.owner?(user)
  end
end
