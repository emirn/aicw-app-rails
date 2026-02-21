# frozen_string_literal: true

# Adds time-based One Time Passwords (TOTPs) for user authentication
#
# Database columns required:
# * otp_required_for_login:boolean (default: false)
# * otp_secret:string
# * last_otp_timestep:integer
# * otp_backup_codes:text

module User::TwoFactorAuthentication
  extend ActiveSupport::Concern

  included do
    # Serialize backup codes as YAML array
    serialize :otp_backup_codes, coder: YAML, type: Array
  end

  def set_otp_secret!
    return if otp_secret?
    update(otp_secret: ROTP::Base32.random)
  end

  def enable_two_factor!
    update(otp_required_for_login: true)
  end

  def disable_two_factor!
    update!(otp_required_for_login: false, otp_secret: nil, otp_backup_codes: [])
  end

  def otp
    ROTP::TOTP.new(otp_secret, issuer: "AICW Dashboard")
  end

  def otp_provisioning_uri
    otp.provisioning_uri(email)
  end

  def otp_app_code
    otp.secret
  end

  def current_otp
    otp.now
  end

  def verify_and_consume_otp!(code)
    return false if code.blank?
    return consume_otp! if verify_otp(code)
    return consume_backup_code!(code) if verify_backup_code(code)
    false
  end

  def generate_otp_backup_codes!
    codes = []
    number_of_codes = 16
    code_length = 10

    number_of_codes.times do
      codes << SecureRandom.hex(code_length / 2) # Hexstring has length 2*n
    end

    update!(otp_backup_codes: codes)

    codes
  end

  def two_factor_otp_qr_code(**)
    qrcode = RQRCode::QRCode.new(otp.provisioning_uri(email))
    qrcode.as_svg(**)
  end

  # Generate QR code as PNG data URI for React frontend
  def two_factor_qr_code_data_uri
    qrcode = RQRCode::QRCode.new(otp_provisioning_uri)
    png = qrcode.as_png(
      bit_depth: 1,
      border_modules: 4,
      color_mode: ChunkyPNG::COLOR_GRAYSCALE,
      color: "black",
      file: nil,
      fill: "white",
      module_px_size: 6,
      resize_exactly_to: false,
      resize_gte_to: false,
      size: 300
    )
    "data:image/png;base64,#{Base64.strict_encode64(png.to_s)}"
  end

  private

  # Verify with 15 second drift
  def verify_otp(code)
    otp.verify(code, after: last_otp_timestep, drift_behind: 15)
  end

  def verify_backup_code(code)
    otp_backup_codes.include?(code)
  end

  # No valid OTP may be used more than once for a given timestep
  def consume_otp!
    if last_otp_timestep != current_otp_timestep
      update_attribute(:last_otp_timestep, current_otp_timestep)
    else
      false
    end
  end

  def consume_backup_code!(code)
    !!otp_backup_codes.delete(code) && save!
  end

  def current_otp_timestep
    Time.now.utc.to_i / otp.interval
  end
end
