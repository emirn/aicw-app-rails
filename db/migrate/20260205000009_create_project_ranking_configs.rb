# frozen_string_literal: true

class CreateProjectRankingConfigs < ActiveRecord::Migration[8.0]
  def change
    create_table :project_ranking_configs do |t|
      t.references :project, null: false, foreign_key: true, index: { unique: true }
      t.json :brand_synonyms, default: []
      t.json :domain_synonyms, default: []

      t.timestamps
    end
  end
end
