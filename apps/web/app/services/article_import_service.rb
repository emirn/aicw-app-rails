# frozen_string_literal: true

class ArticleImportService
  Result = Struct.new(:success?, :article, :errors, keyword_init: true)

  def self.call(...)
    new(...).call
  end

  def initialize(website:, article_data:, assets: [], article_id: nil)
    @website = website
    @article_data = article_data.to_h.with_indifferent_access
    @assets = assets || []
    @article_id = article_id
  end

  def call
    @article = find_or_initialize_article

    if @article.update(permitted_attributes)
      attach_assets
      Result.new(success?: true, article: @article, errors: [])
    else
      Result.new(success?: false, article: @article, errors: @article.errors.full_messages)
    end
  end

  private

  def find_or_initialize_article
    if @article_id.present?
      @website.articles.find_by!(prefix_id: @article_id)
    else
      @website.articles.new
    end
  end

  def permitted_attributes
    @article_data.slice(
      :title, :slug, :description, :content,
      :image_hero, :image_og, :faq, :jsonld,
      :last_pipeline, :published_at,
      :keywords, :applied_actions, :internal_links
    )
  end

  def attach_assets
    @assets.each do |asset|
      next unless asset[:base64].present?

      # Remove existing asset with same filename if updating
      existing = @article.assets.find { |a| a.filename.to_s == asset[:path] }
      existing&.purge

      decoded = Base64.decode64(asset[:base64])
      @article.assets.attach(
        io: StringIO.new(decoded),
        filename: asset[:path],
        content_type: Marcel::MimeType.for(decoded)
      )
    end
  end
end
