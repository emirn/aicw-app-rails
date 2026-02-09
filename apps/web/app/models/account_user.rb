# frozen_string_literal: true

class AccountUser < ApplicationRecord
  include Roles
  include Auditable

  belongs_to :account
  belongs_to :user

  validates :user_id, uniqueness: { scope: :account_id, message: "is already a member of this account" }
end
