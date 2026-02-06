# frozen_string_literal: true

class UpdateWebsiteArticlesToIarticle < ActiveRecord::Migration[8.0]
  def change
    # Drop old website_articles table
    drop_table :website_articles, if_exists: true

    # Create new website_articles table matching IArticle interface from blogpostgen
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
  end
end
