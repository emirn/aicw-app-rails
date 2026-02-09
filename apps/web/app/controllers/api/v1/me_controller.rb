# frozen_string_literal: true

class Api::V1::MeController < Api::BaseController
  # GET /api/v1/me
  def show
    render_api_success(
      user: {
        id: current_user.prefix_id,
        email: current_user.email,
        name: current_user.name,
        full_name: current_user.full_name,
        avatar_url: current_user.avatar_url,
        is_admin: current_account_user&.admin? || false,
        created_at: current_user.created_at,
        subscription: subscription_data
      },
      current_account: current_account_data,
      accounts: accounts_list
    )
  end

  private

  def subscription_data
    subscription = current_account&.subscription
    return nil unless subscription

    {
      id: subscription.prefix_id,
      status: subscription.status,
      trial_ends_at: subscription.trial_ends_at,
      days_remaining: subscription.days_remaining,
      plan: {
        id: subscription.plan.prefix_id,
        name: subscription.plan.name,
        max_projects: subscription.plan.max_projects,
        max_views_per_month: subscription.plan.max_views_per_month
      }
    }
  end

  def current_account_data
    return nil unless current_account

    {
      id: current_account.prefix_id,
      name: current_account.name,
      role: current_account_user&.admin? ? "admin" : "member",
      is_owner: current_account.owner?(current_user)
    }
  end

  def accounts_list
    current_user.accounts.includes(:owner, :account_users).map do |account|
      # Use find to search in-memory (avoids N+1 since account_users are preloaded)
      account_user = account.account_users.find { |au| au.user_id == current_user.id }
      {
        id: account.prefix_id,
        name: account.name,
        role: account_user&.admin? ? "admin" : "member",
        is_owner: account.owner?(current_user)
      }
    end
  end
end
