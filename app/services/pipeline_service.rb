# frozen_string_literal: true

class PipelineService
  class PipelineError < StandardError; end

  def initialize(pipeline_run)
    @pipeline_run = pipeline_run
    @article = pipeline_run.article
    @sgen = SgenClient.new
  end

  def execute
    @pipeline_run.start!

    actions = @pipeline_run.actions
    if actions.blank?
      @pipeline_run.fail!("No actions defined for pipeline")
      return { success: false, error: "No actions defined" }
    end

    actions.each_with_index do |action_name, index|
      break if @pipeline_run.reload.cancelled?

      begin
        result = execute_action(action_name)

        @pipeline_run.advance_action!(action_name, {
          success: true,
          cost_usd: result["cost_usd"] || 0,
          tokens: result["tokens"] || 0,
          completed_at: Time.current.iso8601
        })

        # Update article with action results
        update_article_from_result(action_name, result)
      rescue SgenClient::SgenError => e
        @pipeline_run.advance_action!(action_name, {
          success: false,
          error: e.message,
          completed_at: Time.current.iso8601
        })
        @pipeline_run.fail!("Action '#{action_name}' failed: #{e.message}")
        return { success: false, error: e.message }
      end
    end

    return { success: false, error: "Cancelled" } if @pipeline_run.reload.cancelled?

    @pipeline_run.complete!

    # Update article pipeline tracking
    @article.update!(
      last_pipeline: @pipeline_run.pipeline_name,
      applied_actions: (@article.applied_actions + actions).uniq
    )

    { success: true }
  rescue StandardError => e
    @pipeline_run.fail!(e.message) unless @pipeline_run.finished?
    { success: false, error: e.message }
  end

  private

  def execute_action(action_name)
    article_data = serialize_article

    @sgen.run_action(
      action_name: action_name,
      article_data: article_data,
      context: {
        pipeline_name: @pipeline_run.pipeline_name,
        website_id: @article.website.prefix_id
      }
    )
  end

  def update_article_from_result(action_name, result)
    article_updates = result["article"] || {}
    return if article_updates.blank?

    permitted = article_updates.slice(
      "title", "description", "content", "keywords",
      "image_hero", "image_og", "faq", "jsonld",
      "internal_links", "published_at"
    )

    @article.update!(permitted) if permitted.present?
  end

  def serialize_article
    {
      title: @article.title,
      slug: @article.slug,
      description: @article.description,
      content: @article.content,
      keywords: @article.keywords,
      image_hero: @article.image_hero,
      image_og: @article.image_og,
      faq: @article.faq,
      jsonld: @article.jsonld,
      internal_links: @article.internal_links,
      published_at: @article.published_at&.iso8601,
      last_pipeline: @article.last_pipeline,
      applied_actions: @article.applied_actions
    }
  end
end
