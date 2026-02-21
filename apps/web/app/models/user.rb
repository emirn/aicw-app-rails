# frozen_string_literal: true

class User < ApplicationRecord
  include Authenticatable
  include Accounts
  include SubscriptionMethods
  include TwoFactorAuthentication

  # Set to true to reject emails with plus-addressing aliases (e.g. user+tag@gmail.com).
  # Disabled by default — the controller already normalizes aliases before storage.
  REJECT_PLUS_ALIASES = false

  has_prefix_id :user

  has_many :sent_invitations, class_name: "AccountInvitation", foreign_key: :invited_by_id, dependent: :destroy

  # Validations
  validates :email, presence: true, uniqueness: true,
            'valid_email_2/email': { disposable: true }
end
