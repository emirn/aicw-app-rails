# AI Chat Watch - Rails Dashboard

Rails 8 application for the AI Chat Watch dashboard. Features Analytics and Website Builder.

## Requirements

- Ruby 3.4+
- Rails 8.0+
- Node.js 18+
- PostgreSQL (via Supabase)

## Quick Start

```bash
# Install dependencies
bundle install
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Run migrations
bin/rails db:migrate

# Start development server
bin/dev
```

Access the app at http://localhost:3000

## Features

- **Analytics Dashboard**: View traffic data from Tinybird, including AI bot traffic breakdown
- **Website Builder**: Create and deploy blog websites to Cloudflare Pages
- **Google OAuth**: Sign in with Google

## Creating Users Manually

Users sign up via Google OAuth at `/users/auth/google_oauth2`. To create a user manually for testing:

### Rails Console

```bash
bin/rails console
```

```ruby
# Create a new user
user = User.create!(
  email: "test@example.com",
  full_name: "Test User",
  password: Devise.friendly_token[0, 20]  # Random password (OAuth users don't need it)
)

# User automatically gets a default account
puts user.default_account.name  # => "Test User's Account"

# Check user details
puts user.prefix_id  # => "user_abc123..."
```

### Notes

- Users created manually can sign in via Google OAuth (if email matches their Google account)
- A default account is automatically created on signup
- Password is required by Devise but unused for Google OAuth users
- This creates a user in `public.users` only (not in Supabase `auth.users`)

## Development Settings

### Tinybird Analytics

By default, the app connects to the real Tinybird API. For local development without Tinybird access, you can disable it:

```bash
# In .env - disable Tinybird (returns empty data)
TINYBIRD_ENABLED=false

# Enable Tinybird (default)
TINYBIRD_ENABLED=true
```

When disabled, analytics queries return empty data arrays without errors.

## Documentation

See [CLAUDE.md](CLAUDE.md) for detailed documentation on architecture, API endpoints, and development guidelines.

## Tech Stack

- **Backend**: Rails 8, PostgreSQL (Supabase)
- **Frontend**: React 19, Vite Ruby
- **Auth**: Devise, OmniAuth
- **Jobs**: Solid Queue
- **Analytics**: Tinybird
