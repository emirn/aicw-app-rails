# frozen_string_literal: true

# Create api_tokens table for Rails API authentication
# This table is NEW (not existing in Supabase) and handles frontend session tokens
class CreateApiTokens < ActiveRecord::Migration[8.0]
  def change
    create_table :api_tokens, id: :uuid, default: "gen_random_uuid()" do |t|
      t.uuid :user_id, null: false
      t.string :name, null: false
      t.string :token, null: false
      t.jsonb :metadata, default: {}
      t.datetime :last_used_at
      t.datetime :expires_at

      t.timestamps
    end

    add_index :api_tokens, :token, unique: true
    add_index :api_tokens, :user_id
    add_index :api_tokens, [:user_id, :expires_at]

    # Foreign key to existing users table
    add_foreign_key :api_tokens, :users, column: :user_id, on_delete: :cascade
  end
end
