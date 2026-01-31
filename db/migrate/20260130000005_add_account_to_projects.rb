# frozen_string_literal: true

class AddAccountToProjects < ActiveRecord::Migration[8.0]
  def change
    # Add account_id as nullable first (will be required after data migration)
    add_reference :projects, :account, null: true, type: :uuid, foreign_key: true
  end
end
