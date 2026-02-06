# frozen_string_literal: true

class AddLastDeployedAtToProjectWebsites < ActiveRecord::Migration[8.0]
  def change
    add_column :project_websites, :last_deployed_at, :datetime
  end
end
