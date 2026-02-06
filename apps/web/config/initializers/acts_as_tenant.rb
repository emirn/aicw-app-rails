# frozen_string_literal: true

ActsAsTenant.configure do |config|
  # Require a tenant to be set when accessing tenant-scoped models.
  # This helps prevent data leakage between accounts.
  # Set to true in production for stricter enforcement.
  config.require_tenant = Rails.env.production?
end
