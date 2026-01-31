# frozen_string_literal: true

class MakeAccountRequiredOnProjects < ActiveRecord::Migration[8.0]
  def change
    change_column_null :projects, :account_id, false
  end
end
