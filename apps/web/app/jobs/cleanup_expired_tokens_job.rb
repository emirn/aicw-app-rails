# frozen_string_literal: true

class CleanupExpiredTokensJob < ApplicationJob
  queue_as :default

  def perform
    count = ApiToken.expired.delete_all
    Rails.logger.info("CleanupExpiredTokensJob: deleted #{count} expired tokens")
  end
end
