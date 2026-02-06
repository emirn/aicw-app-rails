# frozen_string_literal: true

class TinybirdClient
  BASE_URL = ENV.fetch("TINYBIRD_API_URL", "https://api.tinybird.co")

  # Mock response when Tinybird is disabled
  MOCK_RESPONSE = {
    "data" => [],
    "meta" => [],
    "statistics" => { "elapsed" => 0, "rows_read" => 0, "bytes_read" => 0 }
  }.freeze

  class TinybirdError < StandardError; end
  class AuthenticationError < TinybirdError; end
  class RateLimitError < TinybirdError; end

  class << self
    def enabled?
      ENV.fetch("TINYBIRD_ENABLED", "true").downcase == "true"
    end

    def query(pipe:, params: {})
      return MOCK_RESPONSE unless enabled?
      response = connection.get("/v0/pipes/#{pipe}.json") do |req|
        req.params = params
      end

      handle_response(response)
    end

    def query_sql(sql)
      return MOCK_RESPONSE unless enabled?

      response = connection.get("/v0/sql") do |req|
        req.params = { q: sql }
      end

      handle_response(response)
    end

    private

    def connection
      @connection ||= Faraday.new(url: BASE_URL) do |faraday|
        faraday.request :url_encoded
        faraday.response :json
        faraday.adapter Faraday.default_adapter
        faraday.headers["Authorization"] = "Bearer #{api_key}"
        faraday.options.timeout = 30
        faraday.options.open_timeout = 10
      end
    end

    def api_key
      ENV.fetch("TINYBIRD_API_KEY") do
        raise AuthenticationError, "TINYBIRD_API_KEY environment variable is not set"
      end
    end

    def handle_response(response)
      case response.status
      when 200
        response.body
      when 401
        raise AuthenticationError, "Invalid Tinybird API key"
      when 429
        raise RateLimitError, "Tinybird rate limit exceeded"
      else
        error_message = response.body.dig("error") || "Unknown error"
        raise TinybirdError, "Tinybird API error (#{response.status}): #{error_message}"
      end
    end
  end
end
