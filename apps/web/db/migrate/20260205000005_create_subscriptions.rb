# frozen_string_literal: true

class CreateSubscriptions < ActiveRecord::Migration[8.0]
  def change
    create_table :subscription_plans do |t|
      t.string :name, null: false
      t.integer :price_cents
      t.integer :max_projects, null: false, default: 1
      t.integer :max_views_per_month, null: false, default: 10000
      t.boolean :is_trial, default: false
      t.text :features

      t.timestamps
    end

    add_index :subscription_plans, :name, unique: true

    create_table :subscriptions do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.references :plan, null: false, foreign_key: { to_table: :subscription_plans }
      t.string :status, null: false, default: "active"
      t.datetime :trial_ends_at
      t.datetime :current_period_start
      t.datetime :current_period_end
      t.string :stripe_subscription_id
      t.string :stripe_customer_id

      t.timestamps
    end

    add_index :subscriptions, :status
  end
end
