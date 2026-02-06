# frozen_string_literal: true

class CreateProjects < ActiveRecord::Migration[8.0]
  def change
    create_table :projects do |t|
      t.references :account, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :name, null: false
      t.string :domain, null: false
      t.string :tracking_id, null: false
      t.boolean :enable_public_page, default: false

      t.timestamps
    end

    add_index :projects, :domain, unique: true
    add_index :projects, :tracking_id, unique: true
  end
end
