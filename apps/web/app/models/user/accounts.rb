# frozen_string_literal: true

module User::Accounts
  extend ActiveSupport::Concern

  included do
    has_many :account_users, dependent: :destroy
    has_many :accounts, through: :account_users
    has_many :owned_accounts, class_name: "Account", foreign_key: :owner_id, inverse_of: :owner, dependent: :destroy

    after_create :create_default_account
  end

  def default_account
    owned_accounts.order(:created_at).first
  end

  private

  def create_default_account
    return if owned_accounts.exists?

    transaction do
      account = owned_accounts.create!(name: "#{name}'s Account")
      account_users.create!(account: account, roles: { admin: true, member: true })
    end
  end
end
