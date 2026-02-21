# frozen_string_literal: true

class Users::TotpSessionsController < ApplicationController
  include Devise::Controllers::Helpers

  layout "auth"

  rate_limit to: 10, within: 1.minute, only: :create,
             with: -> { redirect_to verify_totp_path, alert: "Too many attempts. Please slow down." }

  before_action :require_pending_totp_user, only: [:new, :create]

  def new
    # Show TOTP verification form
    @user = pending_totp_user
  end

  def create
    @user = pending_totp_user
    code = params[:totp_code].to_s.strip

    if code.blank?
      redirect_to verify_totp_path, alert: "Please enter your authenticator code or backup code."
      return
    end

    if @user.verify_and_consume_otp!(code)
      # TOTP verification successful - complete sign-in
      session.delete(:pending_totp_user_id)
      reset_session
      @user.remember_me!
      sign_in(:user, @user)
      redirect_to after_sign_in_path_for(@user), notice: "Signed in successfully."
    else
      Rails.logger.warn("[TOTP] Invalid code for user #{@user.id} from #{request.remote_ip}")
      redirect_to verify_totp_path, alert: "Invalid code. Please try again."
    end
  end

  private

  def require_pending_totp_user
    unless session[:pending_totp_user_id]
      redirect_to new_user_session_path, alert: "Session expired. Please sign in again."
      return
    end

    @pending_user = User.find_by(id: session[:pending_totp_user_id])
    unless @pending_user
      session.delete(:pending_totp_user_id)
      redirect_to new_user_session_path, alert: "User not found. Please sign in again."
    end
  end

  def pending_totp_user
    @pending_user ||= User.find(session[:pending_totp_user_id])
  end
end
