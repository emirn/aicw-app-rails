# frozen_string_literal: true

class PagesController < ApplicationController
  def home
    if user_signed_in?
      redirect_to dashboard_path
    end
    # Otherwise render home page
  end
end
