# frozen_string_literal: true

class Api::V1::WebsiteDeploymentsController < Api::BaseController
  before_action :find_website
  before_action :find_deployment, only: [:show]

  # GET /api/v1/websites/:website_id/deployments
  def index
    deployments = @website.deployments.recent

    # Optional status filter
    if params[:status].present?
      deployments = deployments.where(status: params[:status])
    end

    # Pagination
    limit = [params[:limit]&.to_i || 20, 100].min
    deployments = deployments.limit(limit)

    render_api_success(
      deployments: deployments.map { |d| deployment_json(d) },
      meta: {
        total: @website.deployments.count,
        in_progress: @website.deployments.in_progress.count,
        completed: @website.deployments.completed.count,
        failed: @website.deployments.failed.count
      }
    )
  end

  # GET /api/v1/websites/:website_id/deployments/:id
  def show
    render_api_success(deployment: deployment_json(@deployment))
  end

  # GET /api/v1/websites/:website_id/deployments/latest
  def latest
    deployment = @website.latest_deployment

    if deployment
      render_api_success(deployment: deployment_json(deployment))
    else
      render_api_not_found("Deployment")
    end
  end

  private

  def find_website
    # Find website by prefix_id, then verify its project belongs to current account via ActsAsTenant
    @website = ProjectWebsite.find_by_prefix_id(params[:website_id])
    unless @website && Project.exists?(@website.project_id)
      render_api_not_found("Website")
    end
  end

  def find_deployment
    @deployment = @website.deployments.find_by_prefix_id!(params[:id])
  rescue ActiveRecord::RecordNotFound
    render_api_not_found("Deployment")
  end

  def deployment_json(deployment)
    {
      id: deployment.prefix_id,
      website_id: @website.prefix_id,
      status: deployment.status,
      trigger_reason: deployment.trigger_reason,
      build_duration_ms: deployment.build_duration_ms,
      duration: deployment.duration_formatted,
      error_message: deployment.error_message,
      deployment_url: deployment.deployment_url,
      created_at: deployment.created_at,
      completed_at: deployment.completed_at
    }
  end
end
