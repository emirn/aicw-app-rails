import React from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@/hooks/useUser'

function Dashboard() {
  const { user } = useUser()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome, {user?.name || 'User'}
        </h1>
        <p className="mt-2 text-gray-600">
          Manage your projects and track AI visibility
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link
          to="/dashboard/projects"
          className="block p-6 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Projects</h2>
          <p className="text-gray-600">View and manage your projects</p>
        </Link>

        {user?.subscription && (
          <div className="p-6 bg-white rounded-lg border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Subscription</h2>
            <p className="text-gray-600">
              Plan: {user.subscription.plan.name}
            </p>
            {user.subscription.days_remaining !== null && (
              <p className="text-sm text-gray-500 mt-1">
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
