# frozen_string_literal: true

class AccountMailer < ApplicationMailer
  def invitation(invitation)
    @invitation = invitation
    @account = invitation.account
    @invited_by = invitation.invited_by

    mail(
      to: invitation.email,
      subject: "You've been invited to join #{@account.name}"
    )
  end
end
