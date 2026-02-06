# frozen_string_literal: true

class Api::V1::ProjectWebsitesController < Api::BaseController
  before_action :find_project
  before_action :find_website, only: [:show, :update, :destroy, :deploy]

  # GET /api/v1/projects/:project_id/website
  def show
    render_api_success(website: website_json(@website))
  end

  # POST /api/v1/projects/:project_id/website
  def create
    if @project.website.present?
      render_api_error("Project already has a website", code: "WEBSITE_EXISTS")
      return
    end

    website = @project.build_website(website_params)

    if website.save
      render_api_created(website: website_json(website))
    else
      render_api_validation_error(website)
    end
  end

  # PATCH /api/v1/projects/:project_id/website
  def update
    if @website.update(website_params)
      render_api_success(website: website_json(@website))
    else
      render_api_validation_error(@website)
    end
  end

  # DELETE /api/v1/projects/:project_id/website
  def destroy
    @website.destroy
    render_api_no_content
  end

  # POST /api/v1/projects/:project_id/website/deploy
  def deploy
    unless @website.deployable?
      render_api_error("Website is not deployable. Ensure it's active and has published articles.", code: "NOT_DEPLOYABLE")
      return
    end

    deployment = @website.deployments.create!(
      status: :pending,
      trigger_reason: params[:reason] || "Manual deployment"
    )

    # Enqueue the deployment job
    WebsiteDeploymentJob.perform_later(deployment.prefix_id)

    render_api_accepted(
      deployment: deployment_json(deployment),
      message: "Deployment started"
    )
  end

  private

  def find_website
    @website = @project.website

    unless @website
      render_api_not_found("Website")
    end
  end

  def website_params
    params.require(:website).permit(
      :name,
      :slug,
      :status,
      :custom_domain,
      theme_config: [:primaryColor, :headerText, :footerText, :logoUrl]
    )
  end

  def website_json(website)
    {
      id: website.prefix_id,
      project_id: @project.prefix_id,
      name: website.name,
      slug: website.slug,
      status: website.status,
      custom_domain: website.custom_domain,
      cloudflare_project_name: website.cloudflare_project_name,
      theme_config: website.theme_config,
      public_url: website.public_url,
      last_deployed_at: website.last_deployed_at,
      created_at: website.created_at,
      updated_at: website.updated_at,
      articles_count: website.articles.count,
      published_articles_count: website.published_articles.count,
      latest_deployment: deployment_json(website.latest_deployment)
    }
  end

  def deployment_json(deployment)
    return nil unless deployment

    {
      id: deployment.prefix_id,
      status: deployment.status,
      trigger_reason: deployment.trigger_reason,
      deployment_url: deployment.deployment_url,
      error_message: deployment.error_message,
      duration: deployment.duration_formatted,
      created_at: deployment.created_at,
      completed_at: deployment.completed_at
    }
  end
end
