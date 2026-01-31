# frozen_string_literal: true

class Api::V1::WebsiteArticlesController < Api::BaseController
  before_action :find_website
  before_action :find_article, only: [:show, :update, :destroy]

  # GET /api/v1/websites/:website_id/articles
  def index
    articles = @website.articles.ordered

    # Optional status filter
    if params[:status].present?
      articles = articles.where(status: params[:status])
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
      :content_markdown,
      :excerpt,
      :featured_image_url,
      :meta_description,
      :og_title,
      :og_description,
      :og_image_url,
      :twitter_title,
      :twitter_description,
      :image_social,
      :breadcrumbs,
      :author_name,
      :author_avatar_url,
      :status,
      :published_at,
      :sort_order,
      keywords: [],
      categories: [],
      tags: []
    )
  end

  def article_json(article, include_content: false)
    data = {
      id: article.prefix_id,
      website_id: @website.prefix_id,
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      featured_image_url: article.featured_image_url,
      status: article.status,
      published_at: article.published_at,
      sort_order: article.sort_order,
      reading_time: article.reading_time,
      categories: article.categories,
      tags: article.tags,
      author_name: article.author_name,
      created_at: article.created_at,
      updated_at: article.updated_at,
      path: article.path
    }

    if include_content
      data.merge!(
        content_markdown: article.content_markdown,
        meta_description: article.meta_description,
        keywords: article.keywords,
        og_title: article.og_title,
        og_description: article.og_description,
        og_image_url: article.og_image_url,
        twitter_title: article.twitter_title,
        twitter_description: article.twitter_description,
        image_social: article.image_social,
        breadcrumbs: article.breadcrumbs,
        author_avatar_url: article.author_avatar_url
      )
    end

    data
  end
end
