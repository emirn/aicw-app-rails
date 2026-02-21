# frozen_string_literal: true

Rails.application.routes.draw do
  # Health check for load balancers
  get "up" => "rails/health#show", as: :rails_health_check

  # Email preview in development
  mount LetterOpenerWeb::Engine, at: "/letter_opener" if Rails.env.development?

  # Devise — OmniAuth only (password auth replaced by OTP)
  devise_for :users, skip: [:sessions, :registrations, :passwords], controllers: {
    omniauth_callbacks: "users/omniauth_callbacks"
  }

  # Custom OTP auth routes
  devise_scope :user do
    get    "users/sign_in",   to: "users/otp_sessions#new",       as: :new_user_session
    delete "users/sign_out",  to: "users/otp_sessions#destroy",   as: :destroy_user_session
    post   "users/otp/send",  to: "users/otp_sessions#send_code", as: :send_otp_code
    get    "users/otp/verify", to: "users/otp_sessions#verify",   as: :verify_otp_code
    post   "users/otp/verify", to: "users/otp_sessions#confirm",  as: :confirm_otp_code

    # TOTP 2FA routes
    get    "users/totp/verify", to: "users/totp_sessions#new",    as: :verify_totp
    post   "users/totp/verify", to: "users/totp_sessions#create", as: :confirm_totp
  end

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

      # Two-Factor Authentication (TOTP)
      get  "two_factor/status", to: "two_factor#status"
      post "two_factor/enable", to: "two_factor#enable"
      post "two_factor/confirm", to: "two_factor#confirm"
      delete "two_factor/disable", to: "two_factor#disable"
      post "two_factor/regenerate_backup_codes", to: "two_factor#regenerate_backup_codes"

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

  # Root route — redirect to dashboard (Devise handles auth redirect)
  root to: redirect("/dashboard")
end
