# frozen_string_literal: true

class CreateWebsiteTables < ActiveRecord::Migration[8.0]
  def change
    # Project websites (1:1 with projects)
    create_table :project_websites do |t|
      t.references :project, null: false, foreign_key: true, index: { unique: true }
      t.string :name, null: false
      t.string :slug, null: false
      t.string :status, null: false, default: "draft"
      t.json :theme_config
      t.string :custom_domain
      t.string :cloudflare_project_name
      t.text :description

      t.timestamps
    end

    add_index :project_websites, :slug, unique: true
    add_index :project_websites, :status

    # Website articles (matching IArticle interface from blogpostgen)
    create_table :website_articles do |t|
      t.references :website, null: false, foreign_key: { to_table: :project_websites }

      # Core IArticle fields
      t.string :title, null: false
      t.text :description                    # SEO meta description
      t.json :keywords, default: []          # string[]
      t.text :content                        # Markdown content

      # Pipeline tracking
      t.string :last_pipeline                # "generate", "enhance", etc.
      t.json :applied_actions, default: []   # string[]

      # Assets (relative paths)
      t.string :image_hero                   # "assets/hero.png"
      t.string :image_og                     # "assets/og.png"

      # Rich content sections
      t.text :faq                            # FAQ HTML
      t.text :jsonld                         # JSON-LD scripts

      # Linking
      t.json :internal_links, default: []    # [{slug, anchor}]

      # Publishing
      t.datetime :published_at

      # Routing (not in IArticle but needed for web)
      t.string :slug, null: false

      t.timestamps
    end

    add_index :website_articles, [:website_id, :slug], unique: true

    # Website deployments
    create_table :website_deployments do |t|
      t.references :website, null: false, foreign_key: { to_table: :project_websites }
      t.string :status, null: false, default: "pending"
      t.string :deployment_url
      t.integer :build_duration_ms
      t.text :error_message
      t.json :build_log
      t.datetime :completed_at

      t.timestamps
    end

    add_index :website_deployments, :status
  end
end
