# frozen_string_literal: true

module User::Authenticatable
  extend ActiveSupport::Concern

  OTP_EXPIRY = 5.minutes
  OTP_COOLDOWN = 60.seconds
  OTP_MAX_ATTEMPTS = 5

  included do
    devise :rememberable, :omniauthable, omniauth_providers: [:google_oauth2]

    has_many :api_tokens, dependent: :destroy
  end

  class_methods do
    def from_omniauth(auth)
      user = find_by(email: auth.info.email)

      if user
        user
      else
        create!(
          email: auth.info.email,
          full_name: auth.info.name || auth.info.email.split("@").first
        )
      end
    end

    # Generate and store an OTP for an existing user.
    # Returns the plain-text code (for emailing), or nil if rate-limited.
    def generate_otp_for(user)
      return nil if user.otp_rate_limited?

      code = SecureRandom.random_number(10**6).to_s.rjust(6, "0")
      user.update!(
        otp_digest: Digest::SHA256.hexdigest(code),
        otp_sent_at: Time.current,
        otp_attempts: 0
      )
      code
    end

    # Generate an OTP for a not-yet-existing email.
    # Returns { code:, digest:, sent_at: } for session storage.
    def generate_otp_for_new_email
      code = SecureRandom.random_number(10**6).to_s.rjust(6, "0")
      {
        code: code,
        digest: Digest::SHA256.hexdigest(code),
        sent_at: Time.current.iso8601
      }
    end
  end

  def verify_otp(code)
    return :expired if otp_sent_at.nil? || otp_sent_at < OTP_EXPIRY.ago
    return :max_attempts if otp_attempts >= OTP_MAX_ATTEMPTS

    increment!(:otp_attempts)

    if ActiveSupport::SecurityUtils.secure_compare(
         Digest::SHA256.hexdigest(code), otp_digest.to_s)
      clear_otp!
      :valid
    else
      :invalid
    end
  end

  def otp_rate_limited?
    otp_sent_at.present? && otp_sent_at > OTP_COOLDOWN.ago
  end

  def name
    full_name.presence || email.split("@").first
  end

  private

  def clear_otp!
    update!(otp_digest: nil, otp_sent_at: nil, otp_attempts: 0)
  end
end
