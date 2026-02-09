# frozen_string_literal: true

class Api::BaseController < ActionController::API
  include ActionController::Cookies  # Enable cookie support for API controllers
  include Pundit::Authorization
  include ApiResponses
  include PrefixIdSerialization

  before_action :authenticate_api_token!
  before_action :set_current_account
  before_action :set_request_details
  around_action :track_api_response_time

  protected

  def current_user
    @current_user
  end

  def current_account
    Current.account
  end

  def current_account_user
    Current.account_user
  end

  # Pundit uses this as the first argument to all policies.
  # By passing account_user instead of user, policies can check roles directly.
  def pundit_user
    Current.account_user
  end

  private

  def authenticate_api_token!
    token = token_from_request

    if token.blank?
      render_api_unauthorized("API token required")
      return false
    end

    @api_token = ApiToken.active.find_by(token: token)

    if @api_token.nil?
      render_api_unauthorized("Invalid or expired API token")
      return false
    end

    @api_token.touch_last_used_at
    @current_user = @api_token.user
    Current.user = @current_user
  end

  # Set the current account context from X-Account-ID header or API token metadata
  def set_current_account
    return unless @current_user

    # Try to get account from header, then API token metadata, then default account
    account_prefix = request.headers["X-Account-ID"].presence ||
                     @api_token&.metadata&.dig("account_id")

    Current.account = if account_prefix.present?
      @current_user.accounts.find_by_prefix_id(account_prefix)
    else
      @current_user.default_account
    end

    unless Current.account
      render_api_forbidden("No valid account found")
      return false
    end

    Current.account_user = Current.account.account_users.find_by(user: @current_user)

    unless Current.account_user
      render_api_forbidden("You are not a member of this account")
      return false
    end

    # Set ActsAsTenant for automatic query scoping
    ActsAsTenant.current_tenant = Current.account
  end

  # Retrieve token from Authorization header OR signed HttpOnly cookie
  # This supports both external API clients (Bearer token) and frontend (cookie)
  def token_from_request
    # First try Authorization header (for external API clients)
    token = token_from_header
    return token if token.present?

    # Fall back to signed HttpOnly cookie (for frontend with credentials: 'include')
    token_from_cookie
  end

  def token_from_cookie
    cookies.signed[:aicw_api_token]
  end

  def token_from_header
    request.headers.fetch("Authorization", "").split(" ").last
  end

  # Pundit authorization helper
  def authorize_action(record, action = nil)
    action ||= "#{action_name}?"
    authorize record, action
  rescue Pundit::NotAuthorizedError
    render_api_forbidden("You are not authorized to perform this action")
    false
  end

  def set_request_details
    Current.request_id = request.request_id
    Current.ip_address = request.remote_ip
    Current.user_agent = request.user_agent
  end

  def track_api_response_time
    start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    yield
    elapsed = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round(2)
    response.headers["X-Response-Time"] = "#{elapsed}ms"
  end

  # Helper to find project by prefix_id (auto-scoped to current account via ActsAsTenant)
  def find_project
    @project = Project.find_by_prefix_id!(params[:project_id] || params[:id])
  rescue ActiveRecord::RecordNotFound
    render_api_not_found("Project")
  end
end
