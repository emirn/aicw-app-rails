# frozen_string_literal: true

class ProjectWebsite < ApplicationRecord
  has_prefix_id :website

  # Associations
  belongs_to :project
  has_many :articles, class_name: "WebsiteArticle", foreign_key: :website_id, dependent: :destroy
  has_many :deployments, class_name: "WebsiteDeployment", foreign_key: :website_id, dependent: :destroy

  # Status enum (matches Supabase CHECK constraint)
  enum :status, { draft: "draft", active: "active", disabled: "disabled" }

  # Validations
  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true, format: { with: /\A[a-z0-9-]+\z/, message: "only allows lowercase letters, numbers, and hyphens" }
  validates :project_id, uniqueness: true  # 1:1 relationship

  # Scopes
  scope :active, -> { where(status: :active) }
  scope :with_custom_domain, -> { where.not(custom_domain: nil) }

  # Default theme config
  DEFAULT_THEME_CONFIG = {
    "primaryColor" => "#3B82F6",
    "headerText" => "",
    "footerText" => "",
    "logoUrl" => ""
  }.freeze

  # Theme config handling
  def theme_config
    super || DEFAULT_THEME_CONFIG
  end

  # Get the public URL for this website
  def public_url
    if custom_domain.present?
      "https://#{custom_domain}"
    elsif cloudflare_project_name.present?
      "https://#{cloudflare_project_name}.pages.dev"
    else
      nil
    end
  end

  # Check if website is deployable
  def deployable?
    active? && articles.where(status: :published).exists?
  end

  # Get the latest deployment
  def latest_deployment
    deployments.order(created_at: :desc).first
  end

  # Get published articles for deployment
  def published_articles
    articles.where(status: :published).order(:sort_order, :created_at)
  end
end
