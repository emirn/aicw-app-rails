# frozen_string_literal: true

class CreateAccounts < ActiveRecord::Migration[8.0]
  def change
    create_table :accounts, id: :uuid do |t|
      t.references :owner, null: false, type: :uuid, foreign_key: { to_table: :users }
      t.string :name, null: false
      t.timestamps
    end
  end
end
