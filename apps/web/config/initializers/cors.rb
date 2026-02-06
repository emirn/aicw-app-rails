# frozen_string_literal: true

# Be sure to restart your server when you modify this file.

# CORS is only needed in development where Vite dev server (port 3036)
# makes cross-origin requests to Rails (port 3000).
# In production, React is bundled by Vite and served by Rails (same origin).

if Rails.env.development?
  Rails.application.config.middleware.insert_before 0, Rack::Cors do
    allow do
      origins "http://localhost:3000", "http://localhost:3036", "http://127.0.0.1:3000", "http://127.0.0.1:3036"

      resource "/api/*",
        headers: :any,
        methods: [:get, :post, :put, :patch, :delete, :options, :head],
        credentials: true
    end
  end
end
