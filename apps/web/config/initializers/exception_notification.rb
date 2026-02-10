# frozen_string_literal: true

if Rails.env.production? && ENV["EXCEPTION_RECIPIENTS"].present?
  Rails.application.config.middleware.use ExceptionNotification::Rack,
    email: {
      email_prefix: "[AICW] ",
      sender_address: ENV.fetch("MAIL_FROM", "noreply@aicw.io"),
      exception_recipients: ENV["EXCEPTION_RECIPIENTS"].split(",").map(&:strip)
    }
end
