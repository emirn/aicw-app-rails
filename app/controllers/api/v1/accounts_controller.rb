# frozen_string_literal: true

class Api::V1::AccountsController < Api::BaseController
  skip_before_action :set_current_account, only: [:index]

  # GET /api/v1/accounts
  # List all accounts the user is a member of
  def index
    accounts = current_user.accounts.includes(:owner)

    render_api_success(
      accounts: accounts.map { |account| account_json(account) }
    )
  end

  # GET /api/v1/accounts/:id
  # Show account details
  def show
    account = current_user.accounts.find_by!(prefix_id: params[:id])
    authorize account

    render_api_success(
      account: account_json(account, include_members: true)
    )
  end

  # POST /api/v1/accounts
  # Create a new account
  def create
    account = current_user.owned_accounts.build(account_params)
    authorize account

    if account.save
      # Add creator as admin member
      account.account_users.create!(user: current_user, roles: { admin: true, member: true })

      render_api_created(
        account: account_json(account)
      )
    else
      render_api_validation_error(account)
    end
  end

  # PATCH /api/v1/accounts/:id
  # Update account details
  def update
    account = current_user.accounts.find_by!(prefix_id: params[:id])
    authorize account

    if account.update(account_params)
      render_api_success(
        account: account_json(account)
      )
    else
      render_api_validation_error(account)
    end
  end

  # DELETE /api/v1/accounts/:id
  # Delete an account (cannot delete your only account)
  def destroy
    account = current_user.accounts.find_by!(prefix_id: params[:id])
    authorize account

    if current_user.accounts.count <= 1
      render_api_error("Cannot delete your only account", status: :unprocessable_entity)
      return
    end

    account.destroy!
    render_api_no_content
  end

  # POST /api/v1/accounts/:id/switch
  # Switch to a different account context
  def switch
    account = current_user.accounts.find_by!(prefix_id: params[:id])
    authorize account

    # Update API token metadata to remember the selected account
    @api_token.update!(metadata: @api_token.metadata.merge("account_id" => account.prefix_id))

    render_api_success(
      account: account_json(account),
      message: "Switched to #{account.name}"
    )
  end

  private

  def account_params
    params.require(:account).permit(:name)
  end

  def account_json(account, include_members: false)
    data = {
      id: account.prefix_id,
      name: account.name,
      owner: {
        id: account.owner.prefix_id,
        name: account.owner.name,
        email: account.owner.email
      },
      created_at: account.created_at,
      projects_count: account.projects.count
    }

    if include_members
      data[:members] = account.account_users.includes(:user).map do |account_user|
        {
          id: account_user.user.prefix_id,
          name: account_user.user.name,
          email: account_user.user.email,
          avatar_url: account_user.user.avatar_url,
          roles: account_user.roles,
          is_owner: account.owner?(account_user.user),
          joined_at: account_user.created_at
        }
      end
    end

    data
  end
end
