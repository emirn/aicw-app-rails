# frozen_string_literal: true

module User::Authenticatable
  extend ActiveSupport::Concern

  included do
    devise :database_authenticatable, :registerable,
           :recoverable, :rememberable, :validatable,
           :omniauthable, omniauth_providers: [:google_oauth2]

    has_many :api_tokens, dependent: :destroy
  end

  class_methods do
    def from_omniauth(auth)
      user = find_by(email: auth.info.email)

      if user
        user
      else
        create!(
          email: auth.info.email,
          password: Devise.friendly_token[0, 20],
          full_name: auth.info.name || auth.info.email.split("@").first
        )
      end
    end
  end

  def name
    full_name.presence || email.split("@").first
  end
end
