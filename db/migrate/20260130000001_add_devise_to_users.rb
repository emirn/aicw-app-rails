# frozen_string_literal: true

# Add Devise columns to existing Supabase users table
# Note: The users table already exists with id, email, full_name, avatar_url, etc.
# This migration only adds Devise-specific columns for Rails authentication
class AddDeviseToUsers < ActiveRecord::Migration[8.0]
  def change
    change_table :users do |t|
      # Devise :database_authenticatable
      t.string :encrypted_password, null: false, default: "" unless column_exists?(:users, :encrypted_password)

      # Devise :recoverable
      unless column_exists?(:users, :reset_password_token)
        t.string :reset_password_token
        t.datetime :reset_password_sent_at
      end

      # Devise :rememberable
      t.datetime :remember_created_at unless column_exists?(:users, :remember_created_at)
    end

    add_index :users, :reset_password_token, unique: true unless index_exists?(:users, :reset_password_token)
  end
end
