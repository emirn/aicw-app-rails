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
    # Generate a frontend session token for API access
    token = ApiToken.create_frontend_token(current_user)

    # Set signed HttpOnly cookie for security
    cookies.signed[:aicw_api_token] = {
      value: token.token,
      httponly: true,
      secure: Rails.env.production?,
      same_site: :lax,
      expires: 24.hours.from_now
    }
  end
end
