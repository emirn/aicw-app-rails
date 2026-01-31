# frozen_string_literal: true

class VisibilityCheck < ApplicationRecord
  # Connect to existing Supabase visibility_checks table
  self.table_name = "visibility_checks"
  self.primary_key = "id"

  has_prefix_id :visibility

  # Associations
  belongs_to :project

  # Validations
  validates :score_percent, presence: true, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }
  validates :check_data, presence: true

  # Scopes
  scope :recent, -> { order(created_at: :desc) }
  scope :for_project, ->(project) { where(project: project) }

  # Helper to get latest check for a project
  def self.latest_for(project)
    for_project(project).recent.first
  end

  # Parse check_data JSON
  def data
    check_data.is_a?(Hash) ? check_data : JSON.parse(check_data || "{}")
  end
end
