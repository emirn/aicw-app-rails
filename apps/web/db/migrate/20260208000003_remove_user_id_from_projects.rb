# frozen_string_literal: true

class RemoveUserIdFromProjects < ActiveRecord::Migration[8.1]
  def up
    remove_foreign_key :projects, :users
    remove_index :projects, :user_id
    remove_column :projects, :user_id
  end

  def down
    add_column :projects, :user_id, :integer

    # Backfill: set user_id to account owner
    execute <<~SQL
      UPDATE projects
      SET user_id = (
        SELECT accounts.owner_id
        FROM accounts
        WHERE accounts.id = projects.account_id
      )
    SQL

    change_column_null :projects, :user_id, false
    add_index :projects, :user_id
    add_foreign_key :projects, :users
  end
end
