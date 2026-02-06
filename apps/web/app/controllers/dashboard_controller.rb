# frozen_string_literal: true

class DashboardController < ApplicationController
  layout "dashboard"

  before_action :authenticate_user!
  before_action :set_api_token

  def index
    # Serves the React frontend via Vite
    # The actual React app is mounted via the layout
  end

  def manifest
    render json: {
      appVersion: Rails.application.version.to_s,
      appRevision: Rails.application.version.revision
    }
  end

  private

  def set_api_token
    existing_token_value = cookies.signed[:aicw_api_token]
    if existing_token_value.present?
      existing = ApiToken.active.find_by(token: existing_token_value)
      return if existing  # Cookie still valid, nothing to do
    end

    token = ApiToken.create_session_token(current_user)
    cookies.signed[:aicw_api_token] = {
      value: token.token,
      httponly: true,
      secure: Rails.env.production?,
      same_site: :lax,
      expires: token.expires_at
    }
  end
end
