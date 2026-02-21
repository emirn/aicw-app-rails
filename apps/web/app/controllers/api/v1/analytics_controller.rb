# frozen_string_literal: true

class Api::V1::AnalyticsController < Api::BaseController
  skip_before_action :authenticate_api_token!, only: [:public_query]
  skip_before_action :set_current_account, only: [:public_query]

  before_action :find_project, only: [:query]

  # Rate limit public endpoint to prevent abuse
  rate_limit to: 100, within: 5.minutes, only: :public_query,
             with: -> { render_api_error("Rate limit exceeded. Please try again later.", status: :too_many_requests) }

  # Supported Tinybird pipes for analytics
  ALLOWED_PIPES = %w[
    analytics_overview
    ai_sources_breakdown
    search_sources_breakdown
    other_sources_breakdown
    traffic_sources
    traffic_trend_by_channel
    ai_visits_geo
    visits_geo
    top_pages_by_channel
    crawler_breakdown
    page_views_by_date
    unique_visitors_by_date
    ai_vs_search_comparison
    summarize_clicks_overview
    summarize_clicks_timeseries
    summarize_clicks_by_page
    share_clicks_overview
    share_clicks_timeseries
    share_clicks_by_page
  ].freeze

  # POST /api/v1/projects/:project_id/analytics/query
  def query
    pipe = params[:pipe]

    unless ALLOWED_PIPES.include?(pipe)
      render_api_bad_request("Invalid pipe: #{pipe}")
      return
    end

    result = CachedTinybirdClient.query(
      pipe: pipe,
      params: build_tinybird_params(@project),
      public_mode: false
    )

    render_api_success({
      data: result["data"],
      meta: result["meta"],
      statistics: result["statistics"]
    })
  rescue TinybirdClient::TinybirdError => e
    render_api_error(e.message, status: :service_unavailable)
  end

  # POST /api/v1/analytics/public
  # Public endpoint for projects with enable_public_page=true
  def public_query
    # Handle lookup_project without calling Tinybird
    if params[:pipe] == "lookup_project"
      handle_lookup_project
      return
    end

    project = find_public_project
    return unless project

    pipe = params[:pipe]

    unless ALLOWED_PIPES.include?(pipe)
      render_api_bad_request("Invalid pipe: #{pipe}")
      return
    end

    result = CachedTinybirdClient.query(
      pipe: pipe,
      params: build_tinybird_params(project),
      public_mode: true
    )

    response.headers["Cache-Control"] = "public, max-age=86400"
    response.headers["X-Cache-TTL"] = "86400"

    render_api_success({
      data: result["data"],
      meta: {
        project_name: project.name,
        domain: project.domain
      },
      statistics: result["statistics"]
    })
  rescue ActiveRecord::RecordNotFound
    render_api_not_found("Project")
  rescue TinybirdClient::TinybirdError => e
    render_api_error(e.message, status: :service_unavailable)
  end

  private

  def handle_lookup_project
    project = Project.unscoped.public_enabled.find_by(domain: params[:domain])
    if project
      render_api_success({
        data: [{ project_id: project.prefix_id, name: project.name, domain: project.domain }],
        meta: { project_name: project.name, domain: project.domain }
      })
    else
      render_api_not_found("Project")
    end
  end

  def find_public_project
    if params[:domain].present?
      Project.unscoped.public_enabled.find_by!(domain: params[:domain])
    elsif params[:project_id].present?
      project = Project.find_by_prefix_id(params[:project_id])
      raise ActiveRecord::RecordNotFound unless project&.enable_public_page
      project
    else
      render_api_bad_request("domain or project_id required")
      nil
    end
  end

  def build_tinybird_params(project)
    params_hash = {
      project_id: project.tracking_id
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
