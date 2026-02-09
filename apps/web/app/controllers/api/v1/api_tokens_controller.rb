# frozen_string_literal: true

class Api::V1::ApiTokensController < Api::BaseController
  before_action :find_api_token, only: [:update, :destroy]

  # GET /api/v1/api_tokens
  def index
    tokens = current_user.api_tokens.api_tokens.order(created_at: :desc)

    render_api_success(
      api_tokens: tokens.map { |t| serialize_token(t) }
    )
  end

  # POST /api/v1/api_tokens
  def create
    expires_at = if params[:expires_at].present?
      Time.zone.parse(params[:expires_at])
    end

    token = ApiToken.create_api_token(
      current_user,
      name: params[:name],
      expires_at: expires_at
    )

    render_api_created(
      api_token: serialize_token(token).merge(token: token.token)
    )
  rescue ActiveRecord::RecordInvalid => e
    render_api_validation_error(e.record)
  end

  # PATCH /api/v1/api_tokens/:id
  def update
    if @managed_token.update(name: params[:name])
      render_api_success(api_token: serialize_token(@managed_token))
    else
      render_api_validation_error(@managed_token)
    end
  end

  # DELETE /api/v1/api_tokens/:id
  def destroy
    @managed_token.destroy!
    render_api_no_content
  end

  private

  def find_api_token
    @managed_token = current_user.api_tokens.api_tokens.find_by_prefix_id!(params[:id])
  rescue ActiveRecord::RecordNotFound
    render_api_not_found("API token")
  end

  def serialize_token(token)
    {
      id: token.prefix_id,
      name: token.name,
      token_preview: mask_token(token.token),
      last_used_at: token.last_used_at,
      expires_at: token.expires_at,
      created_at: token.created_at
    }
  end

  def mask_token(value)
    return nil if value.blank?
    "#{value[0, 8]}#{"*" * 24}"
  end
end
