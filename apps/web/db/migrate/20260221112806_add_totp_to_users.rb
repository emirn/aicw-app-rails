class AddTotpToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :otp_required_for_login, :boolean, default: false, null: false
    add_column :users, :otp_secret, :string
    add_column :users, :last_otp_timestep, :integer
    add_column :users, :otp_backup_codes, :text

    add_index :users, :otp_required_for_login
  end
end
