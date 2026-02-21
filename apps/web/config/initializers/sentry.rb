# frozen_string_literal: true

if ENV['SENTRY_DSN'].present?
  Sentry.init do |config|
    config.dsn = ENV['SENTRY_DSN']
    config.breadcrumbs_logger = [:active_support_logger, :http_logger]
    config.environment = Rails.env

    # Only enable in production (can override with SENTRY_ENABLED=true in dev)
    config.enabled_environments = %w[production]
    config.enabled_environments << Rails.env if ENV['SENTRY_ENABLED'] == 'true'

    # Performance monitoring - sample 10% of transactions
    config.traces_sample_rate = 0.1

    # Send PII (personally identifiable information)
    config.send_default_pii = false

    # Filter out sensitive parameters
    config.before_send = lambda do |event, hint|
      # Filter params
      if event.request&.data
        filtered_params = Rails.application.config.filter_parameters
        event.request.data = ActiveSupport::ParameterFilter.new(filtered_params).filter(event.request.data)
      end

      # Add custom context
      event.contexts[:app] = {
        version: ENV.fetch('APP_VERSION', 'unknown'),
        environment: Rails.env
      }

      event
    end

    # Release tracking (useful for deployment tracking)
    config.release = ENV.fetch('APP_VERSION', 'unknown')
  end

  Rails.logger.info("[Sentry] Initialized for #{Rails.env} environment")
end
