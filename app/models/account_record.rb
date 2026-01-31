# frozen_string_literal: true

# Base class for models that are scoped to an account.
# All tenant-scoped models should inherit from this class.
#
# Example:
#   class Project < AccountRecord
#     # automatically scoped to current account
#   end
#
class AccountRecord < ApplicationRecord
  self.abstract_class = true

  acts_as_tenant :account
end
