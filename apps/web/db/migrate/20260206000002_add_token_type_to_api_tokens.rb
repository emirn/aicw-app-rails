# frozen_string_literal: true

class AddTokenTypeToApiTokens < ActiveRecord::Migration[8.0]
  def change
    add_column :api_tokens, :token_type, :string, null: false, default: "session"
    add_index :api_tokens, [:user_id, :token_type, :expires_at], name: "index_api_tokens_on_user_token_type_expires"
  end
end
