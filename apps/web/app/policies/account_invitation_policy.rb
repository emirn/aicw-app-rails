# frozen_string_literal: true

class AccountInvitationPolicy < ApplicationPolicy
  def index?
    account_member?
  end

  def show?
    account_member?
  end

  def create?
    account_admin?
  end

  def destroy?
    account_admin?
  end
end
