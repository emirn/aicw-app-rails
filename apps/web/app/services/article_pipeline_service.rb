# frozen_string_literal: true

class ArticlePipelineService
  class PipelineError < StandardError; end

  def initialize(execution)
    @execution = execution
    @website = execution.website
    @article = execution.article
  end

  def execute
    start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)

    begin
      @execution.start!

      if @execution.pipeline_name == "generate"
        run_generate_pipeline
      else
        run_enhancement_pipeline
      end

      duration_ms = elapsed_ms(start_time)
      @execution.complete!(duration_ms: duration_ms)

      { success: true }
    rescue StandardError => e
      duration_ms = elapsed_ms(start_time)
      @execution.fail!(e.message, duration_ms: duration_ms)
      { success: false, error: e.message }
    end
  end

  private

  def run_generate_pipeline
    config = @website.sgen_config
    website_info = config["website_info"] || {}
    project_requirements = config["project_requirements"] || ""

    @execution.set_current_action!("write_draft")

    response = post_json("/api/v1/article/generate", {
      description: @execution.trigger_reason || "New article",
      website_info: website_info,
      prompt_parts: { project_requirements: project_requirements }
    })

    unless response["success"]
      raise PipelineError, "Generate failed: #{response['error'] || 'unknown error'}"
    end

    article_data = response["article"]
    usage = response["usage"] || {}
    tokens = usage["tokens_used"] || response["tokens_used"] || 0
    cost = usage["cost_usd"] || response["cost_usd"] || 0

    # Create the article
    @article = @website.articles.create!(
      title: article_data["title"],
      slug: article_data["slug"],
      description: article_data["description"],
      keywords: article_data["keywords"] || [],
      content: article_data["content"],
      last_pipeline: "generate",
      applied_actions: ["write_draft"]
    )

    # Link article to execution
    @execution.update!(article: @article)
    @execution.advance!("write_draft", tokens: tokens, cost: cost)
  end

  def run_enhancement_pipeline
    actions = PipelineExecution::PIPELINE_ACTIONS[@execution.pipeline_name] || []

    actions.each do |action_name|
      @execution.set_current_action!(action_name)

      article_payload = build_article_payload
      context = build_context_for_action(action_name)

      body = { article: article_payload, mode: action_name }
      body[:context] = context if context

      response = post_json("/api/v1/article/update", body)

      unless response["success"]
        raise PipelineError, "Action '#{action_name}' failed: #{response['error'] || 'unknown error'}"
      end

      usage = response["usage"] || {}
      tokens = usage["tokens_used"] || response["tokens_used"] || 0
      cost = usage["cost_usd"] || response["cost_usd"] || 0

      # Update article from response
      update_article_from_response(response["article"], action_name)

      @execution.advance!(action_name, tokens: tokens, cost: cost)
    end

    # All actions completed - update article pipeline state
    @article.update!(
      last_pipeline: @execution.pipeline_name,
      applied_actions: (@article.applied_actions + actions).uniq
    )
  end

  def build_article_payload
    {
      id: @article.prefix_id,
      slug: @article.slug,
      title: @article.title,
      description: @article.description,
      keywords: @article.keywords.join(", "),
      content: @article.content
    }
  end

  def build_context_for_action(action_name)
    config = @website.sgen_config

    case action_name
    when "add_internal_links"
      # Provide other articles for interlinking
      other_articles = @website.articles.where.not(id: @article.id).map do |a|
        { slug: a.slug, title: a.title, description: a.description }
      end
      { pages_published: other_articles }
    when "improve_seo", "create_meta"
      website_info = config["website_info"] || {}
      { website_info: website_info }
    end
  end

  def update_article_from_response(article_data, action_name)
    return unless article_data

    attrs = {}
    attrs[:content] = article_data["content"] if article_data["content"].present?
    attrs[:title] = article_data["title"] if article_data["title"].present?
    attrs[:description] = article_data["description"] if article_data["description"].present?
    attrs[:keywords] = article_data["keywords"] if article_data["keywords"].is_a?(Array)

    # Handle fields that are set by specific actions
    attrs[:faq] = article_data["faq"] if article_data.key?("faq")
    attrs[:jsonld] = article_data["jsonld"] if article_data.key?("jsonld")
    attrs[:image_hero] = article_data["image_hero"] if article_data.key?("image_hero")
    attrs[:image_og] = article_data["image_og"] if article_data.key?("image_og")
    attrs[:internal_links] = article_data["internal_links"] if article_data.key?("internal_links")

    @article.update!(attrs) if attrs.any?
    @article.reload
  end

  def post_json(path, body)
    response = connection.post(path) do |req|
      req.headers["Content-Type"] = "application/json"
      req.body = body.to_json
    end

    parsed = JSON.parse(response.body)

    unless response.success?
      error = parsed["error"] || parsed.to_s
      raise PipelineError, "Sgen API error (#{response.status}): #{error}"
    end

    parsed
  end

  def connection
    @connection ||= Faraday.new(url: sgen_url) do |faraday|
      faraday.adapter Faraday.default_adapter
      faraday.options.timeout = 120
      faraday.options.open_timeout = 10
    end
  end

  def sgen_url
    ENV.fetch("SGEN_URL", "http://localhost:3001")
  end

  def elapsed_ms(start_time)
    ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
  end
end
