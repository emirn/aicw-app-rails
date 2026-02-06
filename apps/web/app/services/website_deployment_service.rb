# frozen_string_literal: true

class WebsiteDeploymentService
  class DeploymentError < StandardError; end

  POLL_INTERVAL = 5 # seconds
  POLL_TIMEOUT = 300 # 5 minutes

  def initialize(deployment)
    @deployment = deployment
    @website = deployment.website
  end

  def execute
    start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)

    begin
      @deployment.start_building!

      # Step 1: Create a draft job
      job_id = create_draft_job

      # Step 2: Upload each published article
      upload_articles(job_id)

      @deployment.start_deploying!

      # Step 3: Start the build
      start_build(job_id)

      # Step 4: Poll until complete
      result = poll_until_complete(job_id)

      duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round

      @deployment.complete!(
        url: result[:url],
        duration_ms: duration_ms
      )

      @website.update!(last_deployed_at: Time.current)

      { success: true, url: result[:url] }
    rescue StandardError => e
      @deployment.fail!(e.message)
      { success: false, error: e.message }
    end
  end

  private

  def create_draft_job
    response = connection.post("/jobs") do |req|
      req.headers["Content-Type"] = "application/json"
      req.body = {
        siteId: @website.slug,
        publishTarget: "cloudflare",
        cloudflareProjectName: @website.cloudflare_project_name || @website.slug,
        config: build_site_config
      }.to_json
    end

    handle_error!(response, "create job")
    result = JSON.parse(response.body)
    result["jobId"] || raise(DeploymentError, "No jobId returned from website-builder")
  end

  def upload_articles(job_id)
    @website.published_articles.find_each do |article|
      payload = format_article(article)

      response = connection.post("/jobs/#{job_id}/articles") do |req|
        req.headers["Content-Type"] = "application/json"
        req.body = payload.to_json
      end

      handle_error!(response, "upload article '#{article.slug}'")
    end
  end

  def start_build(job_id)
    response = connection.post("/jobs/#{job_id}/start")
    handle_error!(response, "start build")
  end

  def poll_until_complete(job_id)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + POLL_TIMEOUT

    loop do
      if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
        raise DeploymentError, "Deployment timed out after #{POLL_TIMEOUT}s"
      end

      sleep POLL_INTERVAL

      response = connection.get("/jobs/#{job_id}")
      handle_error!(response, "poll job status")

      status = JSON.parse(response.body)

      case status["status"]
      when "completed"
        return { url: status["url"] || status["deploymentUrl"] }
      when "failed"
        raise DeploymentError, "Build failed: #{status['error'] || 'unknown error'}"
      end
      # "queued", "running" → keep polling
    end
  end

  def format_article(article)
    {
      slug: article.slug,
      meta: {
        title: article.title,
        description: article.description,
        keywords: article.keywords,
        created_at: article.published_at&.iso8601 || article.created_at.iso8601,
        image_hero: article.image_hero,
        image_og: article.image_og
      },
      content: article.content,
      faq: article.faq,
      jsonld: article.jsonld
    }.compact
  end

  def build_site_config
    theme = @website.theme_config
    {
      siteName: @website.name,
      description: @website.description,
      primaryColor: theme["primaryColor"],
      headerText: theme["headerText"],
      footerText: theme["footerText"],
      logoUrl: theme["logoUrl"]
    }.compact
  end

  def handle_error!(response, action)
    return if response.success?

    error_body = JSON.parse(response.body) rescue { "error" => response.body }
    raise DeploymentError, "Website builder failed to #{action}: #{error_body['error'] || error_body}"
  end

  def connection
    @connection ||= Faraday.new(url: website_builder_url) do |faraday|
      faraday.adapter Faraday.default_adapter
      faraday.headers["X-API-Key"] = website_builder_api_key
      faraday.options.timeout = 30
      faraday.options.open_timeout = 10
    end
  end

  def website_builder_url
    ENV.fetch("WEBSITE_BUILDER_URL", "http://localhost:4002")
  end

  def website_builder_api_key
    ENV.fetch("WEBSITE_BUILDER_API_KEY", "")
  end
end
