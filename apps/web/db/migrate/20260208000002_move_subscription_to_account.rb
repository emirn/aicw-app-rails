# frozen_string_literal: true

class MoveSubscriptionToAccount < ActiveRecord::Migration[8.1]
  def up
    add_column :subscriptions, :account_id, :integer
    add_index :subscriptions, :account_id

    # Backfill: assign each subscription to the user's default (first owned) account
    execute <<~SQL
      UPDATE subscriptions
      SET account_id = (
        SELECT accounts.id
        FROM accounts
        WHERE accounts.owner_id = subscriptions.user_id
        ORDER BY accounts.created_at ASC
        LIMIT 1
      )
    SQL

    # Make user_id optional (keep for backwards compatibility)
    change_column_null :subscriptions, :user_id, true

    add_foreign_key :subscriptions, :accounts
  end

  def down
    remove_foreign_key :subscriptions, :accounts

    # Backfill user_id from account owner
    execute <<~SQL
      UPDATE subscriptions
      SET user_id = (
        SELECT accounts.owner_id
        FROM accounts
        WHERE accounts.id = subscriptions.account_id
      )
      WHERE subscriptions.user_id IS NULL
    SQL

    change_column_null :subscriptions, :user_id, false

    remove_index :subscriptions, :account_id
    remove_column :subscriptions, :account_id
  end
end
