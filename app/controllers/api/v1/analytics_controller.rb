# frozen_string_literal: true

class Api::V1::AnalyticsController < Api::BaseController
  skip_before_action :authenticate_api_token!, only: [:public_query]

  before_action :find_project, only: [:query]

  # Supported Tinybird pipes for analytics
  ALLOWED_PIPES = %w[
    analytics_overview
    ai_sources_breakdown
    search_sources_breakdown
    traffic_sources
    traffic_trend_by_channel
    visits_geo
    top_pages_by_channel
    crawler_breakdown
    page_views_by_date
    unique_visitors_by_date
    ai_vs_search_comparison
  ].freeze

  # POST /api/v1/projects/:project_id/analytics/query
  def query
    pipe = params[:pipe]

    unless ALLOWED_PIPES.include?(pipe)
      render_api_bad_request("Invalid pipe: #{pipe}")
      return
    end

    result = TinybirdClient.query(
      pipe: pipe,
      params: build_tinybird_params(@project)
    )

    render_api_success(
      data: result["data"],
      meta: result["meta"],
      statistics: result["statistics"]
    )
  rescue TinybirdClient::TinybirdError => e
    render_api_error(e.message, status: :service_unavailable)
  end

  # POST /api/v1/analytics/public
  # Public endpoint for projects with enable_public_page=true
  def public_query
    project = Project.public_enabled.find_by!(domain: params[:domain])

    pipe = params[:pipe]

    unless ALLOWED_PIPES.include?(pipe)
      render_api_bad_request("Invalid pipe: #{pipe}")
      return
    end

    result = TinybirdClient.query(
      pipe: pipe,
      params: build_tinybird_params(project)
    )

    render_api_success(
      data: result["data"],
      meta: {
        project_name: project.name,
        domain: project.domain
      },
      statistics: result["statistics"]
    )
  rescue ActiveRecord::RecordNotFound
    render_api_not_found("Project")
  rescue TinybirdClient::TinybirdError => e
    render_api_error(e.message, status: :service_unavailable)
  end

  private

  def build_tinybird_params(project)
    params_hash = {
      tracking_id: project.tracking_id
    }

    # Optional date range filters
    params_hash[:start_date] = params[:start_date] if params[:start_date].present?
    params_hash[:end_date] = params[:end_date] if params[:end_date].present?

    # Optional channel filter
    params_hash[:channel] = params[:channel] if params[:channel].present?

    # Optional page path filter
    params_hash[:page_path] = params[:page_path] if params[:page_path].present?

    # Optional limit
    params_hash[:limit] = params[:limit].to_i if params[:limit].present?

    params_hash
  end
end
