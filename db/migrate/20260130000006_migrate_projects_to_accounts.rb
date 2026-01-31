# frozen_string_literal: true

class MigrateProjectsToAccounts < ActiveRecord::Migration[8.0]
  def up
    # Create default accounts for users with projects
    execute <<~SQL
      INSERT INTO accounts (id, owner_id, name, created_at, updated_at)
      SELECT gen_random_uuid(), u.id, COALESCE(u.full_name, split_part(u.email, '@', 1)) || '''s Account', NOW(), NOW()
      FROM users u
      WHERE EXISTS (SELECT 1 FROM projects p WHERE p.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.owner_id = u.id)
    SQL

    # Create account_users entries (owner is admin)
    execute <<~SQL
      INSERT INTO account_users (id, account_id, user_id, roles, created_at, updated_at)
      SELECT gen_random_uuid(), a.id, a.owner_id, '{"admin": true, "member": true}'::jsonb, NOW(), NOW()
      FROM accounts a
      WHERE NOT EXISTS (SELECT 1 FROM account_users au WHERE au.account_id = a.id AND au.user_id = a.owner_id)
    SQL

    # Update projects to reference accounts
    execute <<~SQL
      UPDATE projects p
      SET account_id = a.id
      FROM accounts a
      WHERE a.owner_id = p.user_id
      AND p.account_id IS NULL
    SQL
  end

  def down
    # Projects still have user_id, so just clear account references
    execute "UPDATE projects SET account_id = NULL"

    # Remove account_users
    execute "DELETE FROM account_users"

    # Remove accounts
    execute "DELETE FROM accounts"
  end
end
