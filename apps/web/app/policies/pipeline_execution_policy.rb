# frozen_string_literal: true

class PipelineExecutionPolicy < ApplicationPolicy
  def index?
    account_member?
  end

  def show?
    account_member?
  end

  def create?
    account_admin?
  end
end
