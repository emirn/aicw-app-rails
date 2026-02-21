# frozen_string_literal: true

class Users::OtpSessionsController < ApplicationController
  include Devise::Controllers::Helpers

  layout "auth"

  rate_limit to: 5, within: 1.minute, only: :send_code,
             with: -> { redirect_to new_user_session_path, alert: "Too many requests. Please try again later." }
  rate_limit to: 10, within: 1.minute, only: :confirm,
             with: -> { redirect_to verify_otp_code_path, alert: "Too many attempts. Please slow down." }

  before_action :redirect_if_authenticated, only: [:new, :verify]

  def new
    # Sign-in page: email entry + Google OAuth button
  end

  def send_code
    raw_email = params[:email].to_s.strip.downcase
    if raw_email.blank?
      redirect_to new_user_session_path, alert: "Please enter your email address."
      return
    end

    # Verify Turnstile captcha if configured
    if ENV['TURNSTILE_SECRET_KEY'].present? && !verify_turnstile(params[:'cf-turnstile-response'])
      redirect_to new_user_session_path, alert: "Captcha verification failed. Please try again."
      return
    end

    if User::REJECT_PLUS_ALIASES && raw_email.match?(/\+[^@]+@/)
      redirect_to new_user_session_path, alert: "Email addresses with aliases (e.g. user+tag@example.com) are not allowed."
      return
    end

    email = raw_email.sub(/\+[^@]*@/, '@')

    if ValidEmail2::Address.new(email).disposable?
      redirect_to new_user_session_path, alert: "Disposable email addresses are not allowed."
      return
    end

    user = User.find_by(email: email)

    if user
      if user.otp_rate_limited?
        redirect_to new_user_session_path, alert: "Please wait 60 seconds before requesting a new code."
        return
      end

      code = User.generate_otp_for(user)
      OtpMailer.sign_in_code(email: email, otp_code: code).deliver_later
    else
      # New user — store OTP in session
      if pending_otp_rate_limited?
        redirect_to new_user_session_path, alert: "Please wait 60 seconds before requesting a new code."
        return
      end

      otp_data = User.generate_otp_for_new_email
      session[:pending_otp] = { digest: otp_data[:digest], sent_at: otp_data[:sent_at] }
      OtpMailer.sign_in_code(email: email, otp_code: otp_data[:code]).deliver_later
    end

    session[:otp_email] = email
    redirect_to verify_otp_code_path, notice: "We sent a 6-digit code to #{email}."
  end

  def verify
    unless session[:otp_email]
      redirect_to new_user_session_path
      return
    end

    @email = session[:otp_email]
  end

  def confirm
    email = session[:otp_email]
    code = params[:otp_code].to_s.strip

    unless email
      redirect_to new_user_session_path, alert: "Session expired. Please start over."
      return
    end

    if code.blank?
      redirect_to verify_otp_code_path, alert: "Please enter the 6-digit code."
      return
    end

    user = User.find_by(email: email)

    if user
      result = user.verify_otp(code)
    else
      result = verify_pending_otp(code)
    end

    case result
    when :valid
      user ||= User.find_or_create_by!(email: email) do |u|
        u.full_name = email.split("@").first
      end
      clear_otp_session!

      # Check if user has TOTP 2FA enabled
      if user.otp_required_for_login?
        session[:pending_totp_user_id] = user.id
        redirect_to verify_totp_path
      else
        reset_session
        user.remember_me!
        sign_in(:user, user)
        redirect_to after_sign_in_path_for(user)
      end
    when :expired
      Rails.logger.warn("[OTP] Expired code used for #{email} from #{request.remote_ip}")
      flash[:prefill_email] = email
      clear_otp_session!
      redirect_to new_user_session_path, alert: "Code expired. Please request a new one."
    when :max_attempts
      Rails.logger.warn("[OTP] Max attempts reached for #{email} from #{request.remote_ip}")
      flash[:prefill_email] = email
      clear_otp_session!
      redirect_to new_user_session_path, alert: "Too many attempts. Please request a new code."
    when :invalid
      Rails.logger.warn("[OTP] Invalid code for #{email} from #{request.remote_ip}")
      redirect_to verify_otp_code_path, alert: "Invalid code. Please try again."
    end
  end

  def destroy
    sign_out(:user)
    redirect_to new_user_session_path, notice: "Signed out successfully."
  end

  private

  def redirect_if_authenticated
    redirect_to dashboard_path if user_signed_in?
  end

  def pending_otp_rate_limited?
    pending = session[:pending_otp]
    return false unless pending && pending["sent_at"]

    Time.parse(pending["sent_at"]) > User::Authenticatable::OTP_COOLDOWN.ago
  end

  def verify_pending_otp(code)
    pending = session[:pending_otp]
    return :expired unless pending && pending["sent_at"]

    sent_at = Time.parse(pending["sent_at"])
    return :expired if sent_at < User::Authenticatable::OTP_EXPIRY.ago

    attempts = (pending["attempts"] || 0) + 1
    session[:pending_otp]["attempts"] = attempts
    return :max_attempts if attempts >= User::Authenticatable::OTP_MAX_ATTEMPTS

    if ActiveSupport::SecurityUtils.secure_compare(
         Digest::SHA256.hexdigest(code), pending["digest"].to_s)
      :valid
    else
      :invalid
    end
  end

  def clear_otp_session!
    session.delete(:otp_email)
    session.delete(:pending_otp)
  end

  def verify_turnstile(token)
    return true unless ENV['TURNSTILE_SECRET_KEY'].present?
    return false if token.blank?

    require 'net/http'
    require 'json'

    uri = URI('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    response = Net::HTTP.post_form(uri, {
      'secret' => ENV['TURNSTILE_SECRET_KEY'],
      'response' => token,
      'remoteip' => request.remote_ip
    })

    data = JSON.parse(response.body)
    data['success'] == true
  rescue => e
    Rails.logger.error("[Turnstile] Verification error: #{e.message}")
    false
  end
end
