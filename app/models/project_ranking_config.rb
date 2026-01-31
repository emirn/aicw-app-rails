# frozen_string_literal: true

class ProjectRankingConfig < ApplicationRecord
  # Connect to existing Supabase project_ranking_config table
  self.table_name = "project_ranking_config"
  self.primary_key = "id"

  has_prefix_id :ranking_config

  # Associations
  belongs_to :project

  # Validations
  validates :project_id, uniqueness: true

  # Serialize array columns (PostgreSQL text[])
  # These are used to match brand/domain names in ranking reports
  attribute :brand_synonyms, :string, array: true, default: []
  attribute :domain_synonyms, :string, array: true, default: []

  # Helper to check if a brand name matches this project
  def matches_brand?(brand_name)
    return false if brand_synonyms.blank?

    brand_name_lower = brand_name.to_s.downcase
    brand_synonyms.any? { |synonym| synonym.downcase == brand_name_lower }
  end

  # Helper to check if a domain matches this project
  def matches_domain?(domain)
    return false if domain_synonyms.blank?

    domain_lower = domain.to_s.downcase
    domain_synonyms.any? { |synonym| synonym.downcase == domain_lower }
  end
end
