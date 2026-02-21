# frozen_string_literal: true

class Users::OmniauthCallbacksController < Devise::OmniauthCallbacksController
  def google_oauth2
    @user = User.from_omniauth(request.env["omniauth.auth"])

    if @user.persisted?
      # Check if user has TOTP 2FA enabled
      if @user.otp_required_for_login?
        session[:pending_totp_user_id] = @user.id
        redirect_to verify_totp_path
      else
        @user.remember_me!
        sign_in_and_redirect @user, event: :authentication
        set_flash_message(:notice, :success, kind: "Google") if is_navigational_format?
      end
    else
      session["devise.google_data"] = request.env["omniauth.auth"].except(:extra)
      redirect_to new_user_session_path, alert: "Could not sign in with Google. Please try again."
    end
  end

  def failure
    redirect_to root_path
  end
end
