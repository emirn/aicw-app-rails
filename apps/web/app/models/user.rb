# frozen_string_literal: true

class User < ApplicationRecord
  include Authenticatable
  include Accounts
  include SubscriptionMethods

  has_prefix_id :user

  has_many :sent_invitations, class_name: "AccountInvitation", foreign_key: :invited_by_id, dependent: :destroy

  # Validations
  validates :email, presence: true, uniqueness: true,
            'valid_email_2/email': { disposable: true }
end
