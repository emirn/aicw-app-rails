# frozen_string_literal: true

class CreateUsers < ActiveRecord::Migration[8.0]
  def change
    create_table :users do |t|
      # Basic info
      t.string :email, null: false
      t.string :full_name
      t.string :avatar_url

      # Devise :database_authenticatable
      t.string :encrypted_password, null: false, default: ""

      # Devise :recoverable
      t.string :reset_password_token
      t.datetime :reset_password_sent_at

      # Devise :rememberable
      t.datetime :remember_created_at

      t.timestamps
    end

    add_index :users, :email, unique: true
    add_index :users, :reset_password_token, unique: true
  end
end
