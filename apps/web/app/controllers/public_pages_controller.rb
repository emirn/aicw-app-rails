# frozen_string_literal: true

class PublicPagesController < ApplicationController
  layout "dashboard"

  def show
    # No auth needed — React handles the domain lookup via API
    # The dashboard layout serves the React app which reads the URL
  end
end
