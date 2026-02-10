# frozen_string_literal: true

class AddOtpFieldsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :otp_digest, :string
    add_column :users, :otp_sent_at, :datetime
    add_column :users, :otp_attempts, :integer, default: 0

    # OTP-only users have no password
    change_column_null :users, :encrypted_password, true
    change_column_default :users, :encrypted_password, from: "", to: nil

    # Password reset columns are no longer needed
    remove_index :users, :reset_password_token
    remove_column :users, :reset_password_token, :string
    remove_column :users, :reset_password_sent_at, :datetime
  end
end
