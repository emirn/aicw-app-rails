# frozen_string_literal: true

class ApiToken < ApplicationRecord
  # This is a NEW table (not in Supabase) for Rails API authentication
  self.table_name = "api_tokens"
  self.primary_key = "id"

  has_prefix_id :token

  # Associations
  belongs_to :user

  # Secure token generation
  has_secure_token :token

  # Validations
  validates :name, presence: true

  # Scopes
  scope :active, -> { where("expires_at IS NULL OR expires_at > ?", Time.current) }
  scope :expired, -> { where("expires_at IS NOT NULL AND expires_at <= ?", Time.current) }

  # Check if token is expired
  def expired?
    expires_at.present? && expires_at <= Time.current
  end

  # Touch last_used_at without triggering callbacks
  def touch_last_used_at
    update_column(:last_used_at, Time.current)
  end

  # Create a frontend session token (short-lived)
  def self.create_frontend_token(user)
    create!(
      user: user,
      name: "Frontend Session",
      expires_at: 24.hours.from_now
    )
  end
end
