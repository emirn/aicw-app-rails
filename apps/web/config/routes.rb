# frozen_string_literal: true

Rails.application.routes.draw do
  # Health check for load balancers
  get "up" => "rails/health#show", as: :rails_health_check

  # Email preview in development
  mount LetterOpenerWeb::Engine, at: "/letter_opener" if Rails.env.development?

  # Devise authentication routes
  # Skip password routes (Google OAuth only for now)
  devise_for :users, skip: [:passwords], controllers: {
    omniauth_callbacks: "users/omniauth_callbacks"
  }

  # API routes
  namespace :api do
    namespace :v1 do
      # Current user
      get "me", to: "me#show"

      # API token management
      resources :api_tokens, only: [:index, :create, :update, :destroy]

      # Accounts (multi-tenancy)
      resources :accounts, only: [:index, :show, :create, :update, :destroy] do
        post :switch, on: :member
        post :transfer, on: :member
        resources :invitations, controller: "account_invitations", only: [:index, :create, :destroy]
        resources :members, controller: "account_members", only: [:index, :update, :destroy]
      end

      # Token-based invitation endpoints (no account context needed)
      get "invitations/:token", to: "account_invitations#show_by_token", as: :invitation_by_token
      post "invitations/:token/accept", to: "account_invitations#accept", as: :accept_invitation

      # Projects
      resources :projects, only: [:index, :show, :create, :update, :destroy] do
        # Project-specific analytics
        post "analytics/query", to: "analytics#query"

        # Project website (1:1)
        resource :website, controller: "project_websites", only: [:show, :create, :update, :destroy] do
          post :deploy
        end
      end

      # Public analytics (no auth required for public projects)
      post "analytics/public", to: "analytics#public_query"

      # Websites and articles
      resources :websites, only: [] do
        resources :articles, controller: "website_articles" do
          collection do
            post :import
            post :import_plan
          end
        end
        resources :deployments, controller: "website_deployments", only: [:index, :show] do
          get :latest, on: :collection
        end
        resources :pipeline_executions, controller: "pipeline_executions", only: [:index, :show, :create]
      end

      # Subscription and plans
      resource :subscription, only: [:show]
      resources :plans, only: [:index]

      # Visibility checks
      resources :visibility_checks, only: [:index, :show]

      # Rankings (read-only)
      resources :rankings, only: [:index, :show]

      # Audit logs (admin only, read-only)
      resources :audit_logs, only: [:index]
    end
  end

  # Public analytics pages (no auth, served by React)
  # Allow dots in domain (e.g., aicw.io) by overriding the default constraint
  get "public/:domain", to: "public_pages#show", constraints: { domain: /[^\/]+/ }
  get "public/:domain/*path", to: "public_pages#show", constraints: { domain: /[^\/]+/ }

  # Dashboard (serves React frontend via Vite)
  get "dashboard", to: "dashboard#index"
  get "dashboard/manifest", to: "dashboard#manifest"
  get "dashboard/*path", to: "dashboard#index"

  # Root route
  root "pages#home"
end
