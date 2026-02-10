# frozen_string_literal: true

class OtpMailer < ApplicationMailer
  def sign_in_code(email:, otp_code:)
    @otp_code = otp_code
    mail(to: email, subject: "Your AI Chat Watch sign-in code")
  end
end
