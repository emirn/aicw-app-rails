# frozen_string_literal: true

class User < ApplicationRecord
  # Connect to existing Supabase public.users table
  # Note: Supabase uses auth.users for authentication, but we have
  # a public.users table that syncs via triggers
  self.table_name = "users"
  self.primary_key = "id"

  # Devise modules
  # Note: :database_authenticatable requires encrypted_password column
  # which will be added via migration for Rails-based auth
  devise :database_authenticatable, :registerable,
         :recoverable, :rememberable, :validatable,
         :omniauthable, omniauth_providers: [:google_oauth2]

  has_prefix_id :user

  # Associations
  has_many :account_users, dependent: :destroy
  has_many :accounts, through: :account_users
  has_many :owned_accounts, class_name: "Account", foreign_key: :owner_id, inverse_of: :owner, dependent: :destroy

  # Default account is the first owned account (created on signup)
  def default_account
    owned_accounts.order(:created_at).first
  end

  # Legacy association - projects now belong to accounts
  # Keep for backwards compatibility during transition
  has_many :projects, dependent: :destroy
  has_one :subscription, dependent: :destroy
  has_many :api_tokens, dependent: :destroy

  # Validations
  validates :email, presence: true, uniqueness: true

  # Callbacks
  after_create :create_default_account

  # Map Supabase field names to Rails conventions
  def name
    full_name.presence || email.split("@").first
  end

  # OAuth support
  def self.from_omniauth(auth)
    user = find_by(email: auth.info.email)

    if user
      # Existing user - just return them
      user
    else
      # Create new user
      create!(
        email: auth.info.email,
        password: Devise.friendly_token[0, 20],
        full_name: auth.info.name || auth.info.email.split("@").first
      )
    end
  end

  # Check if user has an active subscription
  def subscribed?
    subscription&.active?
  end

  # Get subscription plan limits
  def max_projects
    subscription&.plan&.max_projects || 1
  end

  def max_views_per_month
    subscription&.plan&.max_views_per_month || 10_000
  end

  private

  # Create a default account for the user on signup
  def create_default_account
    return if owned_accounts.exists?

    transaction do
      account = owned_accounts.create!(name: "#{name}'s Account")
      account_users.create!(account: account, roles: { admin: true, member: true })
    end
  end
end
