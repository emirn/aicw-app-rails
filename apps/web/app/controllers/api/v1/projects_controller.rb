# frozen_string_literal: true

class Api::V1::ProjectsController < Api::BaseController
  before_action :find_project, only: [:show, :update, :destroy]

  # GET /api/v1/projects
  # Projects auto-scoped to current account via ActsAsTenant
  def index
    authorize Project
    projects = Project.order(created_at: :desc)

    render_api_success(
      projects: projects.map { |p| project_json(p) }
    )
  end

  # GET /api/v1/projects/:id
  def show
    authorize @project
    render_api_success(project: project_json(@project, include_details: true))
  end

  # POST /api/v1/projects
  def create
    authorize Project

    # Check account subscription limits (subscription is inherited from owner)
    if Project.count >= current_account.max_projects
      render_api_error("Project limit reached. Please upgrade your plan.", code: "PROJECT_LIMIT")
      return
    end

    # ActsAsTenant auto-sets account_id
    project = Project.new(project_params)

    if project.save
      render_api_created(project: project_json(project))
    else
      render_api_validation_error(project)
    end
  end

  # PATCH /api/v1/projects/:id
  def update
    authorize @project

    if @project.update(project_params)
      render_api_success(project: project_json(@project))
    else
      render_api_validation_error(@project)
    end
  end

  # DELETE /api/v1/projects/:id
  def destroy
    authorize @project
    @project.destroy
    render_api_no_content
  end

  private

  def project_params
    params.require(:project).permit(:name, :domain, :enable_public_page)
  end

  def project_json(project, include_details: false)
    data = {
      id: project.prefix_id,
      name: project.name,
      domain: project.domain,
      tracking_id: project.tracking_id,
      enable_public_page: project.enable_public_page,
      created_at: project.created_at,
      updated_at: project.updated_at
    }

    if include_details
      data[:visibility_check] = visibility_check_json(project.visibility_checks.recent.first)
      data[:ranking_config] = ranking_config_json(project.ranking_config)
      data[:website] = website_summary_json(project.website)
    end

    data
  end

  def visibility_check_json(check)
    return nil unless check

    {
      id: check.prefix_id,
      score_percent: check.score_percent,
      created_at: check.created_at
    }
  end

  def ranking_config_json(config)
    return nil unless config

    {
      id: config.prefix_id,
      brand_synonyms: config.brand_synonyms,
      domain_synonyms: config.domain_synonyms
    }
  end

  def website_summary_json(website)
    return nil unless website

    {
      id: website.prefix_id,
      name: website.name,
      slug: website.slug,
      status: website.status,
      public_url: website.public_url
    }
  end
end
