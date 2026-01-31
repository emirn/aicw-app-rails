# frozen_string_literal: true

class AccountPolicy < ApplicationPolicy
  def index?
    true
  end

  def show?
    member?
  end

  def create?
    # Any authenticated user can create accounts
    true
  end

  def update?
    admin? || owner?
  end

  def destroy?
    owner?
  end

  def switch?
    member?
  end

  # Member management policies
  def invite_member?
    admin? || owner?
  end

  def remove_member?
    admin? || owner?
  end

  def update_member_role?
    owner?
  end

  private

  def member?
    record.account_users.exists?(user: user)
  end

  def admin?
    account_user&.admin?
  end

  def owner?
    record.owner?(user)
  end

  def account_user
    @account_user ||= record.account_users.find_by(user: user)
  end

  class Scope < Scope
    def resolve
      # Return all accounts where the user is a member
      scope.joins(:account_users).where(account_users: { user_id: user.id })
    end
  end
end
