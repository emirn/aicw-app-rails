# frozen_string_literal: true

module AccountUser::Roles
  extend ActiveSupport::Concern

  ROLES = [:admin, :member].freeze

  included do
    scope :admins, -> { where("json_extract(roles, '$.admin') = ?", true) }
    scope :members, -> { where("json_extract(roles, '$.member') = ?", true) }
  end

  # Dynamic role methods: admin?, member?
  ROLES.each do |role|
    define_method("#{role}?") do
      roles&.dig(role.to_s) == true
    end
  end

  def active_roles
    ROLES.select { |role| send("#{role}?") }
  end

  def can_manage_members?
    admin?
  end

  def can_manage_projects?
    admin?
  end

  def removable?
    !account.owner?(user)
  end
end
