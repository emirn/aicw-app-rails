# frozen_string_literal: true

class WebsiteArticle < ApplicationRecord
  include Auditable

  has_prefix_id :article

  # Associations
  belongs_to :website, class_name: "ProjectWebsite"

  # ActiveStorage for assets (images, etc.)
  has_many_attached :assets

  # Validations
  validates :title, presence: true
  validates :slug, presence: true, format: { with: /\A[a-z0-9-]+\z/, message: "only allows lowercase letters, numbers, and hyphens" }
  validates :website_id, presence: true
  validates :slug, uniqueness: { scope: :website_id, message: "must be unique per website" }

  # File upload validations for security and resource management
  validates :assets,
    content_type: { in: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
                    message: 'must be an image (JPEG, PNG, WEBP) or PDF' },
    size: { less_than: 10.megabytes,
            message: 'must be less than 10MB' },
    limit: { max: 20,
             message: 'cannot exceed 20 files per article' }

  # JSON array attributes (stored as JSON in SQLite)
  def keywords
    (super || []).map(&:to_s)
  end

  def applied_actions
    (super || []).map(&:to_s)
  end

  def internal_links
    super || []
  end

  # Scopes
  scope :published, -> { where.not(published_at: nil) }
  scope :drafts, -> { where(published_at: nil) }
  scope :recent, -> { order(created_at: :desc) }
  scope :ordered, -> { order(created_at: :desc) }

  # Callbacks
  before_validation :generate_slug, on: :create

  # Full URL path for this article
  def path
    "/blog/#{slug}"
  end

  # Get asset by relative path (e.g., "assets/hero.png")
  def asset_by_path(path)
    assets.find { |a| a.filename.to_s == path }
  end

  private

  def generate_slug
    return if slug.present?
    return if title.blank?

    self.slug = title.parameterize
  end
end
