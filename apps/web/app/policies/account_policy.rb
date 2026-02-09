# frozen_string_literal: true

class AccountPolicy < ApplicationPolicy
  def index?
    true
  end

  def show?
    member?
  end

  def create?
    true
  end

  def update?
    target_admin? || owner?
  end

  def destroy?
    owner?
  end

  def switch?
    member?
  end

  def transfer?
    owner?
  end

  def invite_member?
    target_admin? || owner?
  end

  def remove_member?
    target_admin? || owner?
  end

  def update_member_role?
    owner?
  end

  private

  def member?
    record.account_users.exists?(user: user)
  end

  def target_admin?
    target_account_user&.admin?
  end

  def owner?
    user && record.owner?(user)
  end

  def target_account_user
    @target_account_user ||= record.account_users.find_by(user: user)
  end

  class Scope < Scope
    def resolve
      scope.joins(:account_users).where(account_users: { user_id: account_user&.user_id })
    end
  end
end
