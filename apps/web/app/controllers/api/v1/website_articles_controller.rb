# frozen_string_literal: true

class Api::V1::WebsiteArticlesController < Api::BaseController
  before_action :find_website
  before_action :find_article, only: [:show, :update, :destroy]

  # GET /api/v1/websites/:website_id/articles
  def index
    articles = @website.articles.ordered

    # Optional filter by published status
    if params[:published] == "true"
      articles = articles.published
    elsif params[:published] == "false"
      articles = articles.drafts
    end

    render_api_success(
      articles: articles.map { |a| article_json(a) },
      meta: {
        total: articles.count,
        published: @website.articles.published.count,
        drafts: @website.articles.drafts.count
      }
    )
  end

  # GET /api/v1/websites/:website_id/articles/:id
  def show
    render_api_success(article: article_json(@article, include_content: true))
  end

  # POST /api/v1/websites/:website_id/articles
  def create
    article = @website.articles.build(article_params)

    if article.save
      render_api_created(article: article_json(article, include_content: true))
    else
      render_api_validation_error(article)
    end
  end

  # POST /api/v1/websites/:website_id/articles/import
  # Import or update an article with assets (matching IArticle interface from blogpostgen)
  # If article_id is provided, updates existing article; otherwise creates new
  def import
    result = ArticleImportService.call(
      website: @website,
      article_data: import_article_params,
      assets: import_params[:assets],
      article_id: params[:article_id]
    )

    if result.success?
      status = result.article.previously_new_record? ? :created : :ok
      render_api_success(article: article_json(result.article, include_content: true, include_assets: true), status: status)
    else
      render json: { errors: result.errors }, status: :unprocessable_entity
    end
  end

  # PATCH /api/v1/websites/:website_id/articles/:id
  def update
    if @article.update(article_params)
      render_api_success(article: article_json(@article, include_content: true))
    else
      render_api_validation_error(@article)
    end
  end

  # DELETE /api/v1/websites/:website_id/articles/:id
  def destroy
    @article.destroy
    render_api_no_content
  end

  # POST /api/v1/websites/:website_id/articles/import_plan
  # Import multiple articles from simple text plan format
  def import_plan
    parse_result = PlanParserService.call(params[:plan] || '')

    if parse_result.items.empty? && parse_result.warnings.any?
      return render json: {
        error: "No valid articles found",
        warnings: parse_result.warnings
      }, status: :unprocessable_entity
    end

    if parse_result.items.empty?
      return render json: {
        error: "No articles found in plan",
        warnings: []
      }, status: :unprocessable_entity
    end

    results = []
    parse_result.items.each do |item|
      result = ArticleImportService.call(
        website: @website,
        article_data: {
          title: item.title,
          slug: item.slug,
          description: item.description,
          keywords: item.keywords,
          published_at: item.published_at
        },
        assets: []
      )

      results << {
        title: item.title,
        slug: item.slug,
        success: result.success?,
        article_id: result.success? ? result.article.prefix_id : nil,
        errors: result.errors
      }
    end

    render json: {
      parsed: parse_result.parsed,
      skipped: parse_result.skipped,
      warnings: parse_result.warnings,
      results: results,
      created: results.count { |r| r[:success] },
      failed: results.count { |r| !r[:success] }
    }, status: :ok
  end

  private

  def find_website
    @website = ProjectWebsite.joins(:project)
                             .where(projects: { user_id: current_user.id })
                             .find_by!(prefix_id: params[:website_id])
  rescue ActiveRecord::RecordNotFound
    render_api_not_found("Website")
  end

  def find_article
    @article = @website.articles.find_by!(prefix_id: params[:id])
  rescue ActiveRecord::RecordNotFound
    render_api_not_found("Article")
  end

  def article_params
    params.require(:article).permit(
      :title,
      :slug,
      :description,
      :content,
      :image_hero,
      :image_og,
      :faq,
      :jsonld,
      :last_pipeline,
      :published_at,
      keywords: [],
      applied_actions: [],
      internal_links: [:slug, :anchor]
    )
  end

  def import_article_params
    params.require(:article).permit(
      :title,
      :slug,
      :description,
      :content,
      :image_hero,
      :image_og,
      :faq,
      :jsonld,
      :last_pipeline,
      :published_at,
      keywords: [],
      applied_actions: [],
      internal_links: [:slug, :anchor]
    )
  end

  def import_params
    params.permit(assets: [:path, :base64])
  end

  def article_json(article, include_content: false, include_assets: false)
    data = {
      id: article.prefix_id,
      website_id: @website.prefix_id,
      title: article.title,
      slug: article.slug,
      description: article.description,
      keywords: article.keywords,
      image_hero: article.image_hero,
      image_og: article.image_og,
      last_pipeline: article.last_pipeline,
      applied_actions: article.applied_actions,
      published_at: article.published_at,
      created_at: article.created_at,
      updated_at: article.updated_at,
      path: article.path
    }

    if include_content
      data.merge!(
        content: article.content,
        faq: article.faq,
        jsonld: article.jsonld,
        internal_links: article.internal_links
      )
    end

    if include_assets && article.assets.attached?
      data[:assets] = article.assets.map do |asset|
        {
          path: asset.filename.to_s,
          url: Rails.application.routes.url_helpers.rails_blob_url(asset, only_path: true)
        }
      end
    end

    data
  end
end
