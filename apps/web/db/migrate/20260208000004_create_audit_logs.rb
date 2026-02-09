# frozen_string_literal: true

class CreateAuditLogs < ActiveRecord::Migration[8.1]
  def change
    create_table :audit_logs do |t|
      t.references :account, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :action, null: false
      t.string :auditable_type
      t.integer :auditable_id
      t.json :metadata, default: {}
      t.string :request_id
      t.string :ip_address
      t.timestamps
    end

    add_index :audit_logs, [:auditable_type, :auditable_id]
    add_index :audit_logs, [:account_id, :action]
    add_index :audit_logs, [:account_id, :created_at]
  end
end
