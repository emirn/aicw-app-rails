# frozen_string_literal: true

# Thread-safe request context storage
# Usage: Current.user, Current.account, Current.account_user, Current.project
class Current < ActiveSupport::CurrentAttributes
  attribute :user, :account, :account_user, :project
  attribute :request_id, :user_agent, :ip_address

  def account_admin?
    !!account_user&.admin?
  end

  def other_accounts
    return Account.none unless user
    user.accounts.where.not(id: account&.id).order(:name)
  end

  def roles
    Array.wrap(account_user&.active_roles)
  end
end
