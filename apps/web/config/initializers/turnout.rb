Turnout.configure do |config|
  config.named_maintenance_file_paths = { default: Rails.root.join("storage", "maintenance.yml") }
  config.default_maintenance_page = Turnout::MaintenancePage::HTML
  config.default_reason = "We are performing scheduled maintenance. Please check back soon."
end
