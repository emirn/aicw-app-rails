# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_02_05_130000) do
  create_table "account_users", force: :cascade do |t|
    t.integer "account_id", null: false
    t.datetime "created_at", null: false
    t.json "roles", default: {"admin" => false, "member" => true}
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["account_id", "user_id"], name: "index_account_users_on_account_id_and_user_id", unique: true
    t.index ["account_id"], name: "index_account_users_on_account_id"
    t.index ["user_id"], name: "index_account_users_on_user_id"
  end

  create_table "accounts", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.integer "owner_id", null: false
    t.datetime "updated_at", null: false
    t.index ["owner_id"], name: "index_accounts_on_owner_id"
  end

  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "api_tokens", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "expires_at"
    t.datetime "last_used_at"
    t.json "metadata", default: {}
    t.string "name", null: false
    t.string "token", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["token"], name: "index_api_tokens_on_token", unique: true
    t.index ["user_id", "expires_at"], name: "index_api_tokens_on_user_id_and_expires_at"
    t.index ["user_id"], name: "index_api_tokens_on_user_id"
  end

  create_table "project_ranking_configs", force: :cascade do |t|
    t.json "brand_synonyms", default: []
    t.datetime "created_at", null: false
    t.json "domain_synonyms", default: []
    t.integer "project_id", null: false
    t.datetime "updated_at", null: false
    t.index ["project_id"], name: "index_project_ranking_configs_on_project_id", unique: true
  end

  create_table "project_websites", force: :cascade do |t|
    t.string "cloudflare_project_name"
    t.datetime "created_at", null: false
    t.string "custom_domain"
    t.text "description"
    t.string "name", null: false
    t.integer "project_id", null: false
    t.string "slug", null: false
    t.string "status", default: "draft", null: false
    t.json "theme_config"
    t.datetime "updated_at", null: false
    t.index ["project_id"], name: "index_project_websites_on_project_id", unique: true
    t.index ["slug"], name: "index_project_websites_on_slug", unique: true
    t.index ["status"], name: "index_project_websites_on_status"
  end

  create_table "projects", force: :cascade do |t|
    t.integer "account_id", null: false
    t.datetime "created_at", null: false
    t.string "domain", null: false
    t.boolean "enable_public_page", default: false
    t.string "name", null: false
    t.string "tracking_id", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["account_id"], name: "index_projects_on_account_id"
    t.index ["domain"], name: "index_projects_on_domain", unique: true
    t.index ["tracking_id"], name: "index_projects_on_tracking_id", unique: true
    t.index ["user_id"], name: "index_projects_on_user_id"
  end

  create_table "subscription_plans", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "features"
    t.boolean "is_trial", default: false
    t.integer "max_projects", default: 1, null: false
    t.integer "max_views_per_month", default: 10000, null: false
    t.string "name", null: false
    t.integer "price_cents"
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_subscription_plans_on_name", unique: true
  end

  create_table "subscriptions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "current_period_end"
    t.datetime "current_period_start"
    t.integer "plan_id", null: false
    t.string "status", default: "active", null: false
    t.string "stripe_customer_id"
    t.string "stripe_subscription_id"
    t.datetime "trial_ends_at"
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["plan_id"], name: "index_subscriptions_on_plan_id"
    t.index ["status"], name: "index_subscriptions_on_status"
    t.index ["user_id"], name: "index_subscriptions_on_user_id", unique: true
  end

  create_table "users", force: :cascade do |t|
    t.string "avatar_url"
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.string "encrypted_password", default: "", null: false
    t.string "full_name"
    t.datetime "remember_created_at"
    t.datetime "reset_password_sent_at"
    t.string "reset_password_token"
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true
  end

  create_table "visibility_checks", force: :cascade do |t|
    t.json "check_data", null: false
    t.datetime "created_at", null: false
    t.integer "project_id", null: false
    t.integer "score_percent", null: false
    t.datetime "updated_at", null: false
    t.index ["project_id", "created_at"], name: "index_visibility_checks_on_project_id_and_created_at"
    t.index ["project_id"], name: "index_visibility_checks_on_project_id"
  end

  create_table "website_articles", force: :cascade do |t|
    t.json "applied_actions", default: []
    t.text "content"
    t.datetime "created_at", null: false
    t.text "description"
    t.text "faq"
    t.string "image_hero"
    t.string "image_og"
    t.json "internal_links", default: []
    t.text "jsonld"
    t.json "keywords", default: []
    t.string "last_pipeline"
    t.datetime "published_at"
    t.string "slug", null: false
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.integer "website_id", null: false
    t.index ["website_id", "slug"], name: "index_website_articles_on_website_id_and_slug", unique: true
    t.index ["website_id"], name: "index_website_articles_on_website_id"
  end

  create_table "website_deployments", force: :cascade do |t|
    t.integer "build_duration_ms"
    t.json "build_log"
    t.datetime "completed_at"
    t.datetime "created_at", null: false
    t.string "deployment_url"
    t.text "error_message"
    t.string "status", default: "pending", null: false
    t.datetime "updated_at", null: false
    t.integer "website_id", null: false
    t.index ["status"], name: "index_website_deployments_on_status"
    t.index ["website_id"], name: "index_website_deployments_on_website_id"
  end

  add_foreign_key "account_users", "accounts"
  add_foreign_key "account_users", "users"
  add_foreign_key "accounts", "users", column: "owner_id"
  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "api_tokens", "users"
  add_foreign_key "project_ranking_configs", "projects"
  add_foreign_key "project_websites", "projects"
  add_foreign_key "projects", "accounts"
  add_foreign_key "projects", "users"
  add_foreign_key "subscriptions", "subscription_plans", column: "plan_id"
  add_foreign_key "subscriptions", "users"
  add_foreign_key "visibility_checks", "projects"
  add_foreign_key "website_articles", "project_websites", column: "website_id"
  add_foreign_key "website_deployments", "project_websites", column: "website_id"
end
