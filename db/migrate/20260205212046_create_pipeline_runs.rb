# frozen_string_literal: true

class CreatePipelineRuns < ActiveRecord::Migration[8.0]
  def change
    create_table :pipeline_runs do |t|
      t.references :article, null: false, foreign_key: { to_table: :website_articles }
      t.string :pipeline_name, null: false
      t.string :status, null: false, default: "pending"
      t.json :actions, default: []
      t.integer :current_action_index, default: 0
      t.json :results, default: {}
      t.decimal :total_cost_usd, precision: 10, scale: 6, default: 0
      t.integer :total_tokens, default: 0
      t.text :error_message
      t.datetime :started_at
      t.datetime :completed_at

      t.timestamps
    end

    add_index :pipeline_runs, :status
    add_index :pipeline_runs, [:article_id, :status]
  end
end
