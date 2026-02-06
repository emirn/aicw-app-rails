# frozen_string_literal: true

class CreateVisibilityChecks < ActiveRecord::Migration[8.0]
  def change
    create_table :visibility_checks do |t|
      t.references :project, null: false, foreign_key: true
      t.integer :score_percent, null: false
      t.json :check_data, null: false

      t.timestamps
    end

    add_index :visibility_checks, [:project_id, :created_at]
  end
end
