# frozen_string_literal: true

class WebsitePolicy < ApplicationPolicy
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

  def deploy?
    account_admin?
  end
end
