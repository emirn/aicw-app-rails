# frozen_string_literal: true

# Thread-safe request context storage
# Usage: Current.user, Current.account, Current.account_user, Current.project
class Current < ActiveSupport::CurrentAttributes
  attribute :user
  attribute :account
  attribute :account_user
  attribute :project
end
