# frozen_string_literal: true

class WebsiteArticle < ApplicationRecord
  # Connect to existing Supabase website_articles table
  self.table_name = "website_articles"
  self.primary_key = "id"

  has_prefix_id :article

  # Associations
  belongs_to :website, class_name: "ProjectWebsite"

  # Status enum (matches Supabase CHECK constraint)
  enum :status, { draft: "draft", scheduled: "scheduled", published: "published", archived: "archived" }

  # Validations
  validates :title, presence: true
  validates :slug, presence: true, format: { with: /\A[a-z0-9-]+\z/, message: "only allows lowercase letters, numbers, and hyphens" }
  validates :website_id, presence: true
  validates :slug, uniqueness: { scope: :website_id, message: "must be unique per website" }

  # Array attributes (PostgreSQL text[])
  attribute :keywords, :string, array: true, default: []
  attribute :categories, :string, array: true, default: []
  attribute :tags, :string, array: true, default: []

  # Scopes
  scope :published, -> { where(status: :published) }
  scope :scheduled, -> { where(status: :scheduled) }
  scope :drafts, -> { where(status: :draft) }
  scope :ordered, -> { order(:sort_order, :created_at) }
  scope :recent, -> { order(created_at: :desc) }

  # Callbacks
  before_validation :generate_slug, on: :create

  # Calculate reading time based on word count
  # Assumes average reading speed of 200 words per minute
  def calculate_reading_time
    return 1 if content_markdown.blank?

    words = content_markdown.split.size
    minutes = (words / 200.0).ceil
    [minutes, 1].max
  end

  # Auto-update reading time before save
  before_save :update_reading_time

  # Get effective OG title (fallback to title)
  def effective_og_title
    og_title.presence || title
  end

  # Get effective OG description (fallback chain)
  def effective_og_description
    og_description.presence || meta_description.presence || excerpt
  end

  # Get effective social image (fallback chain)
  def effective_social_image
    image_social.presence || og_image_url.presence || featured_image_url
  end

  # Full URL path for this article
  def path
    "/blog/#{slug}"
  end

  private

  def generate_slug
    return if slug.present?
    return if title.blank?

    self.slug = title.parameterize
  end

  def update_reading_time
    self.reading_time = calculate_reading_time if content_markdown_changed?
  end
end
