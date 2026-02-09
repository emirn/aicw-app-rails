# frozen_string_literal: true

class Api::V1::AccountMembersController < Api::BaseController
  before_action :find_account
  before_action :find_member, only: [:update, :destroy]

  # GET /api/v1/accounts/:account_id/members
  def index
    authorize @account, :show?
    members = @account.account_users.includes(:user)

    render_api_success(
      members: members.map { |m| member_json(m) }
    )
  end

  # PATCH /api/v1/accounts/:account_id/members/:id
  def update
    authorize @account, :update_member_role?

    if @account.owner?(@member.user)
      render_api_error("Cannot change the owner's roles", code: "CANNOT_MODIFY_OWNER")
      return
    end

    if @member.update(member_params)
      render_api_success(member: member_json(@member))
    else
      render_api_validation_error(@member)
    end
  end

  # DELETE /api/v1/accounts/:account_id/members/:id
  def destroy
    authorize @account, :remove_member?

    unless @member.removable?
      render_api_error("Cannot remove the account owner", code: "CANNOT_REMOVE_OWNER")
      return
    end

    @member.destroy!
    render_api_no_content
  end

  private

  def find_account
    @account = current_user.accounts.find_by_prefix_id!(params[:account_id])
  rescue ActiveRecord::RecordNotFound
    render_api_not_found("Account")
  end

  def find_member
    @member = @account.account_users.find(params[:id])
  rescue ActiveRecord::RecordNotFound
    render_api_not_found("Member")
  end

  def member_params
    params.require(:member).permit(roles: {})
  end

  def member_json(account_user)
    {
      id: account_user.id,
      user: {
        id: account_user.user.prefix_id,
        name: account_user.user.name,
        email: account_user.user.email,
        avatar_url: account_user.user.avatar_url
      },
      roles: account_user.roles,
      active_roles: account_user.active_roles,
      is_owner: @account.owner?(account_user.user),
      removable: account_user.removable?,
      joined_at: account_user.created_at
    }
  end
end
