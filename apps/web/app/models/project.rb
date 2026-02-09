# frozen_string_literal: true

class Project < ApplicationRecord
  include Auditable

  has_prefix_id :project

  # Multi-tenancy: automatically scope queries to current account
  acts_as_tenant :account

  # Associations
  belongs_to :account
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

  # Sync to Supabase after create/update for edge function validation
  after_commit :schedule_supabase_sync, on: [ :create, :update ]

  private

  def generate_tracking_id
    self.tracking_id ||= SecureRandom.uuid
  end

  def schedule_supabase_sync
    # Only sync if relevant fields changed or it's a new record
    return unless saved_change_to_domain? || saved_change_to_tracking_id? || previously_new_record?

    SupabaseSyncJob.perform_later(id) if SupabaseProjectSync.configured?
  end
end
