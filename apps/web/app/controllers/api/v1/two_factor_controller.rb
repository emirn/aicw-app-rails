# frozen_string_literal: true

module Api
  module V1
    class TwoFactorController < BaseController
      before_action :authenticate_user!

      # GET /api/v1/two_factor/status
      def status
        render_api_success({
          enabled: current_user.otp_required_for_login?,
          has_backup_codes: current_user.otp_backup_codes&.any? || false
        })
      end

      # POST /api/v1/two_factor/enable
      def enable
        if current_user.otp_required_for_login?
          render_api_error("Two-factor authentication is already enabled", status: :unprocessable_entity)
          return
        end

        current_user.set_otp_secret!
        backup_codes = current_user.generate_otp_backup_codes!
        qr_code_uri = current_user.two_factor_qr_code_data_uri

        render_api_success({
          qr_code_uri: qr_code_uri,
          secret: current_user.otp_app_code,
          backup_codes: backup_codes
        })
      end

      # POST /api/v1/two_factor/confirm
      def confirm
        code = params[:code].to_s.strip

        if code.blank?
          render_api_error("Verification code is required", status: :unprocessable_entity)
          return
        end

        unless current_user.otp_secret?
          render_api_error("Two-factor setup not initiated", status: :unprocessable_entity)
          return
        end

        if current_user.verify_and_consume_otp!(code)
          current_user.enable_two_factor!
          render_api_success({ message: "Two-factor authentication enabled successfully" })
        else
          render_api_error("Invalid verification code", status: :unprocessable_entity)
        end
      end

      # DELETE /api/v1/two_factor/disable
      def disable
        unless current_user.otp_required_for_login?
          render_api_error("Two-factor authentication is not enabled", status: :unprocessable_entity)
          return
        end

        current_user.disable_two_factor!
        render_api_success({ message: "Two-factor authentication disabled" })
      end

      # POST /api/v1/two_factor/regenerate_backup_codes
      def regenerate_backup_codes
        unless current_user.otp_required_for_login?
          render_api_error("Two-factor authentication is not enabled", status: :unprocessable_entity)
          return
        end

        backup_codes = current_user.generate_otp_backup_codes!
        render_api_success({ backup_codes: backup_codes })
      end
    end
  end
end
