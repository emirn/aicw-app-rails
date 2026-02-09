# frozen_string_literal: true

class DeploymentPolicy < ApplicationPolicy
  def index?
    account_member?
  end

  def show?
    account_member?
  end

  def latest?
    account_member?
  end

  def create?
    account_admin?
  end
end
