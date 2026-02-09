# frozen_string_literal: true

class Api::V1::AccountInvitationsController < Api::BaseController
  skip_before_action :set_current_account, only: [:show_by_token, :accept]
  skip_before_action :authenticate_api_token!, only: [:show_by_token]

  before_action :find_account, only: [:index, :create, :destroy]
  before_action :find_invitation, only: [:destroy]

  # GET /api/v1/accounts/:account_id/invitations
  def index
    authorize @account, :show?
    invitations = @account.account_invitations.order(created_at: :desc)

    render_api_success(
      invitations: invitations.map { |i| invitation_json(i) }
    )
  end

  # POST /api/v1/accounts/:account_id/invitations
  def create
    authorize @account, :invite_member?

    # Check if user is already a member
    if @account.users.exists?(email: invitation_params[:email])
      render_api_error("User is already a member of this account", code: "ALREADY_MEMBER")
      return
    end

    invitation = @account.account_invitations.build(invitation_params)
    invitation.invited_by = current_user

    if invitation.save
      AccountMailer.invitation(invitation).deliver_later
      render_api_created(invitation: invitation_json(invitation))
    else
      render_api_validation_error(invitation)
    end
  end

  # DELETE /api/v1/accounts/:account_id/invitations/:id
  def destroy
    authorize @account, :invite_member?
    @invitation.destroy!
    render_api_no_content
  end

  # GET /api/v1/invitations/:token
  # View invitation details (unauthenticated)
  def show_by_token
    invitation = AccountInvitation.find_by!(token: params[:token])

    render_api_success(
      invitation: {
        id: invitation.prefix_id,
        account_name: invitation.account.name,
        invited_by: invitation.invited_by.name,
        email: invitation.email,
        name: invitation.name,
        roles: invitation.roles
      }
    )
  rescue ActiveRecord::RecordNotFound
    render_api_not_found("Invitation")
  end

  # POST /api/v1/invitations/:token/accept
  # Authenticated user accepts invitation
  def accept
    invitation = AccountInvitation.find_by!(token: params[:token])

    if invitation.email.downcase != current_user.email.downcase
      render_api_forbidden("This invitation was sent to a different email address")
      return
    end

    if invitation.account.users.exists?(id: current_user.id)
      invitation.destroy!
      render_api_error("You are already a member of this account", code: "ALREADY_MEMBER")
      return
    end

    invitation.accept!(current_user)

    render_api_success(
      message: "Invitation accepted",
      account: {
        id: invitation.account.prefix_id,
        name: invitation.account.name
      }
    )
  rescue ActiveRecord::RecordNotFound
    render_api_not_found("Invitation")
  end

  private

  def find_account
    @account = current_user.accounts.find_by_prefix_id!(params[:account_id])
  rescue ActiveRecord::RecordNotFound
    render_api_not_found("Account")
  end

  def find_invitation
    @invitation = @account.account_invitations.find_by_prefix_id!(params[:id])
  rescue ActiveRecord::RecordNotFound
    render_api_not_found("Invitation")
  end

  def invitation_params
    params.require(:invitation).permit(:email, :name, roles: {})
  end

  def invitation_json(invitation)
    {
      id: invitation.prefix_id,
      email: invitation.email,
      name: invitation.name,
      roles: invitation.roles,
      invited_by: {
        id: invitation.invited_by.prefix_id,
        name: invitation.invited_by.name
      },
      created_at: invitation.created_at
    }
  end
end
