# frozen_string_literal: true

class Project < ApplicationRecord
  # Connect to existing Supabase projects table
  self.table_name = "projects"
  self.primary_key = "id"

  has_prefix_id :project

  # Multi-tenancy: automatically scope queries to current account
  acts_as_tenant :account

  # Associations
  belongs_to :account
  belongs_to :user  # Keep for backwards compatibility during transition
  has_one :ranking_config, class_name: "ProjectRankingConfig", dependent: :destroy
  has_many :visibility_checks, dependent: :destroy
  has_one :website, class_name: "ProjectWebsite", dependent: :destroy

  # Validations
  validates :name, presence: true
  validates :domain, presence: true, uniqueness: true
  validates :tracking_id, presence: true, uniqueness: true

  # Scopes
  scope :public_enabled, -> { where(enable_public_page: true) }

  # The tracking_id is used for analytics tracking (was called api_key in early migrations)
  # It's automatically generated in Supabase via default
  before_validation :generate_tracking_id, on: :create

  private

  def generate_tracking_id
    self.tracking_id ||= SecureRandom.uuid
  end
end
