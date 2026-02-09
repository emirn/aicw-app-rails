# frozen_string_literal: true

class AccountInvitation < ApplicationRecord
  include Auditable

  has_prefix_id :invite

  belongs_to :account
  belongs_to :invited_by, class_name: "User"

  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :email, uniqueness: { scope: :account_id, message: "has already been invited to this account" }
  validates :token, presence: true, uniqueness: true

  before_validation :generate_token, on: :create

  scope :pending, -> { all }

  def accept!(user)
    transaction do
      account.account_users.create!(user: user, roles: roles)
      destroy!
    end
  end

  def reject!
    destroy!
  end

  private

  def generate_token
    self.token ||= SecureRandom.urlsafe_base64(32)
  end
end
