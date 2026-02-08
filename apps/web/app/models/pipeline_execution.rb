# frozen_string_literal: true

class PipelineExecution < ApplicationRecord
  include Auditable

  has_prefix_id :pipeline

  # Associations
  belongs_to :website, class_name: "ProjectWebsite"
  belongs_to :article, class_name: "WebsiteArticle", optional: true

  # Status enum
  enum :status, {
    pending: "pending",
    running: "running",
    completed: "completed",
    failed: "failed"
  }

  # Pipeline definitions (mirrors apps/sgen/config/pipelines.json)
  VALID_PIPELINES = %w[generate enhance enhance-image-hero enhance-image-og enhance-interlink-articles].freeze

  PIPELINE_PREREQUISITES = {
    "generate" => nil,
    "enhance" => "generate",
    "enhance-image-hero" => "enhance",
    "enhance-image-og" => "enhance-image-hero",
    "enhance-interlink-articles" => "enhance"
  }.freeze

  PIPELINE_ACTIONS = {
    "generate" => %w[write_draft],
    "enhance" => %w[
      fact_check humanize_text humanize_text_random improve_seo condense_text
      add_external_links add_diagrams render_diagrams add_faq add_toc
      create_meta add_content_jsonld add_faq_jsonld
    ],
    "enhance-image-hero" => %w[generate_image_hero],
    "enhance-image-og" => %w[generate_image_social],
    "enhance-interlink-articles" => %w[add_internal_links]
  }.freeze

  # Validations
  validates :pipeline_name, presence: true, inclusion: { in: VALID_PIPELINES }
  validates :article, presence: true, unless: -> { pipeline_name == "generate" }
  validate :article_meets_prerequisite, on: :create

  # Scopes
  scope :recent, -> { order(created_at: :desc) }
  scope :in_progress, -> { where(status: [:pending, :running]) }

  # State machine methods
  def start!
    actions = PIPELINE_ACTIONS[pipeline_name] || []
    update!(
      status: :running,
      total_actions: actions.size,
      actions_completed: 0,
      completed_actions: []
    )
  end

  def set_current_action!(action_name)
    update!(current_action: action_name)
  end

  def advance!(action_name, tokens: 0, cost: 0)
    new_completed = (completed_actions || []) + [action_name]
    update!(
      completed_actions: new_completed,
      actions_completed: new_completed.size,
      current_action: nil,
      tokens_used: (tokens_used || 0) + tokens.to_i,
      cost_usd: (cost_usd || 0) + cost.to_f
    )
  end

  def complete!(duration_ms: nil)
    update!(
      status: :completed,
      current_action: nil,
      duration_ms: duration_ms,
      completed_at: Time.current
    )
  end

  def fail!(error, action: nil, duration_ms: nil)
    update!(
      status: :failed,
      error_message: error,
      failed_action: action || current_action,
      current_action: nil,
      duration_ms: duration_ms,
      completed_at: Time.current
    )
  end

  def finished?
    completed? || failed?
  end

  def progress_percent
    return 0 if total_actions.nil? || total_actions.zero?
    ((actions_completed.to_f / total_actions) * 100).round
  end

  private

  def article_meets_prerequisite
    return if pipeline_name == "generate"
    return if article.blank?

    required = PIPELINE_PREREQUISITES[pipeline_name]
    return if required.nil?

    unless article.last_pipeline == required
      errors.add(:article, "must have completed '#{required}' pipeline (current: #{article.last_pipeline || 'none'})")
    end
  end
end
