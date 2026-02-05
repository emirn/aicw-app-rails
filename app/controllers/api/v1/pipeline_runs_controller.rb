# frozen_string_literal: true

class Api::V1::PipelineRunsController < Api::BaseController
  before_action :find_article
  before_action :find_pipeline_run, only: [:show, :cancel]

  # GET /api/v1/articles/:article_id/pipeline_runs
  def index
    runs = @article.pipeline_runs.recent

    if params[:status].present?
      runs = runs.where(status: params[:status])
    end

    limit = [params[:limit]&.to_i || 20, 100].min
    runs = runs.limit(limit)

    render_api_success(
      pipeline_runs: runs.map { |r| pipeline_run_json(r) },
      meta: {
        total: @article.pipeline_runs.count,
        in_progress: @article.pipeline_runs.in_progress.count,
        completed: @article.pipeline_runs.where(status: :completed).count,
        failed: @article.pipeline_runs.where(status: :failed).count
      }
    )
  end

  # POST /api/v1/articles/:article_id/pipeline_runs
  def create
    # Check for existing in-progress run
    if @article.pipeline_runs.in_progress.exists?
      return render_api_error(
        "Article already has a pipeline run in progress",
        status: :conflict,
        code: "PIPELINE_IN_PROGRESS"
      )
    end

    pipeline_name = params[:pipeline_name]
    actions = params[:actions]

    if pipeline_name.blank?
      return render_api_error("pipeline_name is required", status: :unprocessable_entity)
    end

    # If actions not provided, fetch from sgen
    if actions.blank?
      begin
        sgen = SgenClient.new
        pipelines = sgen.get_pipelines
        pipeline = pipelines.find { |p| p["name"] == pipeline_name }
        actions = pipeline&.dig("actions") || []
      rescue SgenClient::ConnectionError => e
        return render_api_error(
          "Cannot connect to sgen service: #{e.message}",
          status: :service_unavailable,
          code: "SGEN_UNAVAILABLE"
        )
      rescue SgenClient::SgenError => e
        return render_api_error(
          "Sgen error: #{e.message}",
          status: :bad_gateway
        )
      end
    end

    if actions.blank?
      return render_api_error(
        "No actions found for pipeline '#{pipeline_name}'",
        status: :unprocessable_entity
      )
    end

    pipeline_run = @article.pipeline_runs.create!(
      pipeline_name: pipeline_name,
      actions: actions,
      status: :pending
    )

    PipelineExecutionJob.perform_later(pipeline_run.prefix_id)

    render_api_created(pipeline_run: pipeline_run_json(pipeline_run))
  end

  # GET /api/v1/articles/:article_id/pipeline_runs/:id
  def show
    render_api_success(pipeline_run: pipeline_run_json(@pipeline_run))
  end

  # POST /api/v1/articles/:article_id/pipeline_runs/:id/cancel
  def cancel
    if @pipeline_run.finished?
      return render_api_error(
        "Pipeline run is already #{@pipeline_run.status}",
        status: :unprocessable_entity
      )
    end

    @pipeline_run.cancel!

    render_api_success(pipeline_run: pipeline_run_json(@pipeline_run))
  end

  private

  def find_article
    @article = WebsiteArticle.joins(website: :project)
                              .where(projects: { user_id: current_user.id })
                              .find_by!(prefix_id: params[:article_id])
  rescue ActiveRecord::RecordNotFound
    render_api_not_found("Article")
  end

  def find_pipeline_run
    @pipeline_run = @article.pipeline_runs.find_by!(prefix_id: params[:id])
  rescue ActiveRecord::RecordNotFound
    render_api_not_found("Pipeline run")
  end

  def pipeline_run_json(run)
    {
      id: run.prefix_id,
      article_id: @article.prefix_id,
      pipeline_name: run.pipeline_name,
      status: run.status,
      actions: run.actions,
      current_action_index: run.current_action_index,
      current_action: run.current_action,
      progress_percent: run.progress_percent,
      results: run.results,
      total_cost_usd: run.total_cost_usd.to_f,
      total_tokens: run.total_tokens,
      error_message: run.error_message,
      duration_seconds: run.duration_seconds,
      started_at: run.started_at,
      completed_at: run.completed_at,
      created_at: run.created_at
    }
  end
end
