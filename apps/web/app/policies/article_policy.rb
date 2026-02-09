# frozen_string_literal: true

class ArticlePolicy < ApplicationPolicy
  def index?
    account_member?
  end

  def show?
    account_member?
  end

  def create?
    account_member?
  end

  def update?
    account_member?
  end

  def destroy?
    account_member?
  end

  def import?
    account_admin?
  end

  def import_plan?
    account_admin?
  end
end
