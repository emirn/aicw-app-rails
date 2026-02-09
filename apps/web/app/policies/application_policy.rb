# frozen_string_literal: true

class ApplicationPolicy
  attr_reader :account_user, :record

  def initialize(account_user, record)
    @account_user = account_user
    @record = record
  end

  def index?
    false
  end

  def show?
    false
  end

  def create?
    false
  end

  def new?
    create?
  end

  def update?
    false
  end

  def edit?
    update?
  end

  def destroy?
    false
  end

  private

  def account_admin?
    account_user&.admin?
  end

  def account_member?
    account_user.present?
  end

  def user
    account_user&.user
  end

  def account
    account_user&.account
  end

  class Scope
    def initialize(account_user, scope)
      @account_user = account_user
      @scope = scope
    end

    def resolve
      raise NotImplementedError, "You must define #resolve in #{self.class}"
    end

    private

    attr_reader :account_user, :scope
  end
end
