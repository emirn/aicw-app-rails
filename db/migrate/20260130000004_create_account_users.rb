# frozen_string_literal: true

class CreateAccountUsers < ActiveRecord::Migration[8.0]
  def change
    create_table :account_users, id: :uuid do |t|
      t.references :account, null: false, type: :uuid, foreign_key: true
      t.references :user, null: false, type: :uuid, foreign_key: true
      t.jsonb :roles, default: { "admin" => false, "member" => true }
      t.timestamps
    end

    # One membership per user per account
    add_index :account_users, [:account_id, :user_id], unique: true
  end
end
