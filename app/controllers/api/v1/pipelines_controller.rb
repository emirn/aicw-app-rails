# frozen_string_literal: true

class Api::V1::PipelinesController < Api::BaseController
  # GET /api/v1/pipelines
  def index
    sgen = SgenClient.new
    pipelines = sgen.get_pipelines

    render_api_success(pipelines: pipelines)
  rescue SgenClient::ConnectionError => e
    render_api_error(
      "Cannot connect to sgen service: #{e.message}",
      status: :service_unavailable,
      code: "SGEN_UNAVAILABLE"
    )
  rescue SgenClient::SgenError => e
    render_api_error("Sgen error: #{e.message}", status: :bad_gateway)
  end

  # GET /api/v1/pipelines/actions
  def actions
    sgen = SgenClient.new
    actions = sgen.get_actions

    render_api_success(actions: actions)
  rescue SgenClient::ConnectionError => e
    render_api_error(
      "Cannot connect to sgen service: #{e.message}",
      status: :service_unavailable,
      code: "SGEN_UNAVAILABLE"
    )
  rescue SgenClient::SgenError => e
    render_api_error("Sgen error: #{e.message}", status: :bad_gateway)
  end
end
