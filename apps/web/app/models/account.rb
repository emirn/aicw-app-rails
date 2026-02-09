# frozen_string_literal: true

class Account < ApplicationRecord
  include Membership
  include Subscription
  include Transfer

  has_prefix_id :acct

  has_many :projects, dependent: :destroy

  validates :name, presence: true, length: { maximum: 100 }
end
