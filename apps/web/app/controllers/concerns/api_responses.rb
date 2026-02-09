# frozen_string_literal: true

module ApiResponses
  extend ActiveSupport::Concern

  included do
    rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
    rescue_from ActionController::ParameterMissing, with: :render_parameter_missing
    rescue_from Pundit::NotAuthorizedError, with: :render_forbidden
  end

  def render_api_success(data = nil, status: :ok, **kwargs)
    render json: data || kwargs, status: status
  end

  def render_api_created(data = nil, **kwargs)
    render json: data || kwargs, status: :created
  end

  def render_api_accepted(data = nil, **kwargs)
    render json: data || kwargs, status: :accepted
  end

  def render_api_bad_request(message, code: nil)
    error = { error: message }
    error[:code] = code if code
    render json: error, status: :bad_request
  end

  def render_api_no_content
    head :no_content
  end

  def render_api_error(message, status: :bad_request, code: nil, details: nil)
    error = { error: message }
    error[:code] = code if code
    error[:details] = details if details
    render json: error, status: status
  end

  def render_api_validation_error(record)
    render json: {
      error: "Validation failed",
      errors: record.errors.full_messages,
      details: record.errors.to_hash
    }, status: :unprocessable_entity
  end

  def render_api_not_found(resource = "Resource")
    render json: { error: "#{resource} not found" }, status: :not_found
  end

  def render_api_unauthorized(message = "Unauthorized")
    render json: { error: message }, status: :unauthorized
  end

  def render_api_forbidden(message = "Forbidden")
    render json: { error: message }, status: :forbidden
  end

  def render_api_internal_error(message = "Internal server error")
    render json: { error: message }, status: :internal_server_error
  end

  private

  def render_not_found
    render_api_not_found
  end

  def render_parameter_missing(exception)
    render_api_error("Missing parameter: #{exception.param}", code: "MISSING_PARAMETER")
  end

  def render_forbidden
    render_api_forbidden("You are not authorized to perform this action")
  end
end
