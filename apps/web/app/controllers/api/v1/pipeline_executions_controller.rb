# frozen_string_literal: true

class Api::V1::PipelineExecutionsController < Api::BaseController
  before_action :find_website
  before_action :find_execution, only: [:show]

  # GET /api/v1/websites/:website_id/pipeline_executions
  def index
    authorize PipelineExecution

    executions = @website.pipeline_executions.recent

    # Optional filters
    executions = executions.where(status: params[:status]) if params[:status].present?
    executions = executions.where(article_id: find_article_by_prefix(params[:article_id]).id) if params[:article_id].present?

    limit = [params[:limit]&.to_i || 20, 100].min
    executions = executions.limit(limit)

    render_api_success(
      executions: executions.map { |e| execution_json(e) },
      meta: {
        total: @website.pipeline_executions.count,
        in_progress: @website.pipeline_executions.in_progress.count
      }
    )
  end

  # GET /api/v1/websites/:website_id/pipeline_executions/:id
  def show
    authorize @execution

    render_api_success(execution: execution_json(@execution))
  end

  # POST /api/v1/websites/:website_id/pipeline_executions
  def create
    authorize PipelineExecution

    pipeline_name = params[:pipeline_name]

    # Validate pipeline name
    unless PipelineExecution::VALID_PIPELINES.include?(pipeline_name)
      return render_api_error("Invalid pipeline name. Valid: #{PipelineExecution::VALID_PIPELINES.join(', ')}", code: "INVALID_PIPELINE")
    end

    # Validate sgen_config is present
    if @website.sgen_config.blank? || @website.sgen_config == {}
      return render_api_error("Website sgen_config must be configured before running pipelines", code: "SGEN_CONFIG_MISSING")
    end

    # Handle batch (article_ids) or single (article_id)
    article_ids = params[:article_ids] || [params[:article_id]].compact

    if pipeline_name == "generate"
      return create_generate_execution(pipeline_name)
    end

    if article_ids.empty?
      return render_api_error("article_id or article_ids required for '#{pipeline_name}' pipeline", code: "ARTICLE_REQUIRED")
    end

    executions = []
    errors = []

    article_ids.each do |aid|
      article = find_article_by_prefix(aid)
      unless article
        errors << { article_id: aid, error: "Article not found" }
        next
      end

      # Check for in-progress pipeline on this article
      if @website.pipeline_executions.in_progress.where(article: article).exists?
        errors << { article_id: aid, error: "Article already has an in-progress pipeline" }
        next
      end

      execution = @website.pipeline_executions.build(
        pipeline_name: pipeline_name,
        article: article,
        trigger_reason: params[:trigger_reason]
      )

      unless execution.valid?
        errors << { article_id: aid, error: execution.errors.full_messages.join(", ") }
        next
      end

      execution.save!
      ArticlePipelineJob.perform_later(execution.prefix_id)
      executions << execution
    end

    render_api_accepted(
      executions: executions.map { |e| execution_json(e) },
      errors: errors,
      message: "#{executions.size} pipeline(s) started"
    )
  end

  private

  def create_generate_execution(pipeline_name)
    execution = @website.pipeline_executions.create!(
      pipeline_name: pipeline_name,
      trigger_reason: params[:trigger_reason] || params[:description]
    )

    ArticlePipelineJob.perform_later(execution.prefix_id)

    render_api_accepted(
      executions: [execution_json(execution)],
      errors: [],
      message: "1 pipeline(s) started"
    )
  end

  def find_website
    @website = ProjectWebsite.find_by_prefix_id(params[:website_id])
    unless @website && Project.exists?(@website.project_id)
      render_api_not_found("Website")
    end
  end

  def find_execution
    @execution = @website.pipeline_executions.find_by_prefix_id!(params[:id])
  rescue ActiveRecord::RecordNotFound
    render_api_not_found("Pipeline execution")
  end

  def find_article_by_prefix(prefix_id)
    @website.articles.find_by_prefix_id(prefix_id)
  end

  def execution_json(execution)
    {
      id: execution.prefix_id,
      website_id: @website.prefix_id,
      article_id: execution.article&.prefix_id,
      pipeline_name: execution.pipeline_name,
      status: execution.status,
      current_action: execution.current_action,
      completed_actions: execution.completed_actions,
      total_actions: execution.total_actions,
      actions_completed: execution.actions_completed,
      progress_percent: execution.progress_percent,
      tokens_used: execution.tokens_used,
      cost_usd: execution.cost_usd&.to_f,
      duration_ms: execution.duration_ms,
      error_message: execution.error_message,
      failed_action: execution.failed_action,
      trigger_reason: execution.trigger_reason,
      created_at: execution.created_at,
      completed_at: execution.completed_at
    }
  end
end
