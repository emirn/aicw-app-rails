# frozen_string_literal: true

class WebsiteDeploymentJob < ApplicationJob
  queue_as :default

  # Retry up to 3 times with exponential backoff
  retry_on StandardError, wait: :polynomially_longer, attempts: 3

  def perform(deployment_prefix_id)
    deployment = WebsiteDeployment.find_by_prefix_id!(deployment_prefix_id)

    # Skip if deployment is already in a terminal state
    return if deployment.finished?

    result = WebsiteDeploymentService.new(deployment).execute

    unless result[:success]
      Rails.logger.error("Website deployment failed: #{result[:error]}")
    end
  end
end
