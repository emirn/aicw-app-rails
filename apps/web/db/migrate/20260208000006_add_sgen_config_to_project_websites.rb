# frozen_string_literal: true

class AddSgenConfigToProjectWebsites < ActiveRecord::Migration[8.1]
  def change
    add_column :project_websites, :sgen_config, :json, default: {}
  end
end
