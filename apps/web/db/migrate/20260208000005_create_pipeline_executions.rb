# frozen_string_literal: true

class CreatePipelineExecutions < ActiveRecord::Migration[8.1]
  def change
    create_table :pipeline_executions do |t|
      t.references :website, null: false, foreign_key: { to_table: :project_websites }
      t.references :article, null: true, foreign_key: { to_table: :website_articles }
      t.string :pipeline_name, null: false
      t.string :status, null: false, default: "pending"
      t.string :current_action
      t.json :completed_actions, default: []
      t.integer :total_actions
      t.integer :actions_completed, default: 0
      t.integer :tokens_used, default: 0
      t.decimal :cost_usd, precision: 10, scale: 6, default: 0
      t.integer :duration_ms
      t.datetime :completed_at
      t.text :error_message
      t.string :failed_action
      t.string :trigger_reason
      t.timestamps
    end

    add_index :pipeline_executions, :status
    add_index :pipeline_executions, [:website_id, :created_at]
    add_index :pipeline_executions, [:article_id, :created_at]
  end
end
