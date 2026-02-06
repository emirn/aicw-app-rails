# frozen_string_literal: true

# Subscription Plans
# Create the default subscription plans

puts "Seeding subscription plans..."

# Free Trial Plan
SubscriptionPlan.find_or_create_by!(name: "Free Trial") do |plan|
  plan.price_cents = 0
  plan.max_projects = 1
  plan.max_views_per_month = 10_000
  plan.is_trial = true
  plan.features = "1 project, 10k views/month, Basic analytics"
end

# Starter Plan
SubscriptionPlan.find_or_create_by!(name: "Starter") do |plan|
  plan.price_cents = 1900  # $19/month
  plan.max_projects = 3
  plan.max_views_per_month = 50_000
  plan.is_trial = false
  plan.features = "3 projects, 50k views/month, Full analytics, Email support"
end

# Professional Plan
SubscriptionPlan.find_or_create_by!(name: "Professional") do |plan|
  plan.price_cents = 4900  # $49/month
  plan.max_projects = 10
  plan.max_views_per_month = 250_000
  plan.is_trial = false
  plan.features = "10 projects, 250k views/month, Full analytics, Priority support, Website builder"
end

# Enterprise Plan
SubscriptionPlan.find_or_create_by!(name: "Enterprise") do |plan|
  plan.price_cents = 14900  # $149/month
  plan.max_projects = 100
  plan.max_views_per_month = 1_000_000
  plan.is_trial = false
  plan.features = "Unlimited projects, 1M views/month, Full analytics, Dedicated support, Website builder, Custom domain"
end

puts "Created #{SubscriptionPlan.count} subscription plans"
