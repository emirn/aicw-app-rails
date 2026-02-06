import React from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@/hooks/useUser'

function Dashboard() {
  const { user } = useUser()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">
          Welcome, {user?.name || 'User'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Manage your projects and track AI visibility
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link
          to="/dashboard/projects"
          className="block p-6 bg-card rounded-lg border border-border shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-card-foreground mb-2">Projects</h2>
          <p className="text-muted-foreground">View and manage your projects</p>
        </Link>

        <Link
          to="/dashboard/settings"
          className="block p-6 bg-card rounded-lg border border-border shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-card-foreground mb-2">Settings</h2>
          <p className="text-muted-foreground">Manage API tokens</p>
        </Link>

        {user?.subscription && (
          <div className="p-6 bg-card rounded-lg border border-border shadow-sm">
            <h2 className="text-xl font-semibold text-card-foreground mb-2">Subscription</h2>
            <p className="text-muted-foreground">
              Plan: {user.subscription.plan.name}
            </p>
            {user.subscription.days_remaining !== null && (
              <p className="text-sm text-muted-foreground/70 mt-1">
                {user.subscription.days_remaining} days remaining
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
