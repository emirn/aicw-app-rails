# frozen_string_literal: true

class ApiToken < ApplicationRecord
  has_prefix_id :token

  # Constants
  TOKEN_TYPES = %w[session api].freeze

  # Associations
  belongs_to :user

  # Secure token generation
  has_secure_token :token

  # Validations
  validates :name, presence: true
  validates :token_type, presence: true, inclusion: { in: TOKEN_TYPES }

  # Scopes
  scope :active, -> { where("expires_at IS NULL OR expires_at > ?", Time.current) }
  scope :expired, -> { where("expires_at IS NOT NULL AND expires_at <= ?", Time.current) }
  scope :session_tokens, -> { where(token_type: "session") }
  scope :api_tokens, -> { where(token_type: "api") }

  # Predicates
  def session_token?
    token_type == "session"
  end

  def api_token?
    token_type == "api"
  end

  # Check if token is expired
  def expired?
    expires_at.present? && expires_at <= Time.current
  end

  # Touch last_used_at without triggering callbacks
  def touch_last_used_at
    update_column(:last_used_at, Time.current)
  end

  # Create a long-lived session token (900 days, like the Devise remember cookie)
  def self.create_session_token(user)
    create!(
      user: user,
      name: "Frontend Session",
      token_type: "session",
      expires_at: 900.days.from_now
    )
  end

  # Create a long-lived API token for programmatic access
  def self.create_api_token(user, name:, expires_at: nil)
    create!(
      user: user,
      name: name,
      token_type: "api",
      expires_at: expires_at
    )
  end
end
