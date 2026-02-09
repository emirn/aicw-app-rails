# frozen_string_literal: true

class CreateAccountInvitations < ActiveRecord::Migration[8.1]
  def change
    create_table :account_invitations do |t|
      t.references :account, null: false, foreign_key: true
      t.references :invited_by, null: false, foreign_key: { to_table: :users }
      t.string :email, null: false
      t.string :name
      t.string :token, null: false
      t.json :roles, default: { "admin" => false, "member" => true }
      t.timestamps
    end

    add_index :account_invitations, [:account_id, :email], unique: true
    add_index :account_invitations, :token, unique: true
  end
end
