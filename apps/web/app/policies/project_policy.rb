# frozen_string_literal: true

class ProjectPolicy < ApplicationPolicy
  def index?
    account_member?
  end

  def show?
    account_member?
  end

  def create?
    account_admin?
  end

  def update?
    account_admin?
  end

  def destroy?
    account_admin?
  end

  class Scope < Scope
    def resolve
      # ActsAsTenant automatically scopes to current account
      scope.all
    end
  end
end
