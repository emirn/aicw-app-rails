# frozen_string_literal: true

class SgenClient
  class SgenError < StandardError; end
  class ConnectionError < SgenError; end

  def initialize
    @base_url = ENV.fetch("SGEN_SERVICE_URL", "http://localhost:3001")
    @timeout = ENV.fetch("SGEN_REQUEST_TIMEOUT", "120").to_i
  end

  # GET /api/pipelines - List available pipelines
  def get_pipelines
    response = connection.get("/api/pipelines")
    handle_response(response)
  end

  # GET /api/actions - List available actions
  def get_actions
    response = connection.get("/api/actions")
    handle_response(response)
  end

  # POST /api/generate - Generate article from description
  def generate_article(description:, website_info: {})
    response = connection.post("/api/generate") do |req|
      req.headers["Content-Type"] = "application/json"
      req.body = {
        description: description,
        website: website_info
      }.to_json
    end
    handle_response(response)
  end

  # POST /api/actions/:action_name/run - Run a single action on an article
  def run_action(action_name:, article_data:, context: {})
    response = connection.post("/api/actions/#{action_name}/run") do |req|
      req.headers["Content-Type"] = "application/json"
      req.body = {
        article: article_data,
        context: context
      }.to_json
    end
    handle_response(response)
  end

  # Check if sgen service is reachable
  def health_check
    response = connection.get("/api/health")
    response.success?
  rescue Faraday::Error
    false
  end

  private

  def connection
    @connection ||= Faraday.new(url: @base_url) do |faraday|
      faraday.request :url_encoded
      faraday.adapter Faraday.default_adapter
      faraday.options.timeout = @timeout
      faraday.options.open_timeout = 10
    end
  end

  def handle_response(response)
    case response.status
    when 200..299
      JSON.parse(response.body)
    when 404
      raise SgenError, "Sgen endpoint not found"
    when 422
      error_body = JSON.parse(response.body) rescue {}
      raise SgenError, error_body["error"] || "Validation error"
    when 500..599
      raise SgenError, "Sgen service error (#{response.status})"
    else
      raise SgenError, "Unexpected response from sgen: #{response.status}"
    end
  rescue Faraday::ConnectionFailed, Faraday::TimeoutError => e
    raise ConnectionError, "Cannot connect to sgen service at #{@base_url}: #{e.message}"
  end
end
