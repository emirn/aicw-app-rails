# frozen_string_literal: true

module Account::Transfer
  extend ActiveSupport::Concern

  def transfer_ownership(new_owner)
    unless users.include?(new_owner)
      errors.add(:base, "New owner must be an existing account member")
      return false
    end

    if owner_id == new_owner.id
      errors.add(:base, "User is already the owner")
      return false
    end

    transaction do
      # Ensure new owner has admin role
      new_owner_membership = account_users.find_by!(user: new_owner)
      new_owner_membership.update!(roles: new_owner_membership.roles.merge("admin" => true))

      update!(owner: new_owner)
    end

    true
  rescue ActiveRecord::RecordInvalid => e
    errors.add(:base, e.message)
    false
  end
end
