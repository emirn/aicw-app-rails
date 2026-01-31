# frozen_string_literal: true

class WebsiteDeploymentService
  class DeploymentError < StandardError; end

  def initialize(deployment)
    @deployment = deployment
    @website = deployment.website
  end

  def execute
    start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)

    begin
      @deployment.start_building!

      # Gather website data
      site_data = build_site_data

      @deployment.start_deploying!

      # Call the website builder API
      response = deploy_to_cloudflare(site_data)

      # Calculate duration
      duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round

      # Update deployment status
      @deployment.complete!(
        url: response[:url],
        duration_ms: duration_ms
      )

      # Update website last_deployed_at
      @website.update!(last_deployed_at: Time.current)

      { success: true, url: response[:url] }
    rescue StandardError => e
      @deployment.fail!(e.message)
      { success: false, error: e.message }
    end
  end

  private

  def build_site_data
    {
      site_id: @website.slug,
      name: @website.name,
      config: @website.theme_config,
      custom_domain: @website.custom_domain,
      articles: format_articles
    }
  end

  def format_articles
    @website.published_articles.map do |article|
      {
        slug: article.slug,
        title: article.title,
        content_markdown: article.content_markdown,
        excerpt: article.excerpt,
        featured_image_url: article.featured_image_url,
        meta_description: article.meta_description,
        keywords: article.keywords,
        og_title: article.effective_og_title,
        og_description: article.effective_og_description,
        og_image_url: article.effective_social_image,
        categories: article.categories,
        tags: article.tags,
        author_name: article.author_name,
        author_avatar_url: article.author_avatar_url,
        reading_time: article.reading_time,
        published_at: article.published_at&.iso8601,
        sort_order: article.sort_order
      }
    end
  end

  def deploy_to_cloudflare(site_data)
    response = website_builder_connection.post("/api/deploy") do |req|
      req.headers["Content-Type"] = "application/json"
      req.body = site_data.to_json
    end

    unless response.success?
      error_body = JSON.parse(response.body) rescue { "error" => "Unknown error" }
      raise DeploymentError, "Website builder API error: #{error_body['error']}"
    end

    result = JSON.parse(response.body)
    {
      url: result["url"] || result["deployment_url"],
      project_name: result["project_name"]
    }
  end

  def website_builder_connection
    @connection ||= Faraday.new(url: website_builder_url) do |faraday|
      faraday.request :url_encoded
      faraday.adapter Faraday.default_adapter
      faraday.headers["Authorization"] = "Bearer #{website_builder_api_key}"
      faraday.options.timeout = 300  # 5 minutes for deployment
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
