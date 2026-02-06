import React from 'react'
import { useParams, Link } from 'react-router-dom'

function Analytics() {
  const { projectId } = useParams<{ projectId: string }>()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
        <Link
          to={`/dashboard/projects/${projectId}`}
          className="text-primary hover:text-primary/80"
        >
          Back to Project
        </Link>
      </div>

      <div className="bg-card rounded-lg border border-border shadow-sm p-6">
        <p className="text-muted-foreground">
          Analytics dashboard coming soon. This will display traffic data from Tinybird including:
        </p>
        <ul className="mt-4 list-disc list-inside text-muted-foreground space-y-2">
          <li>Page views and unique visitors</li>
          <li>AI bot traffic breakdown</li>
          <li>Search engine traffic</li>
          <li>Geographic distribution</li>
          <li>Top pages by channel</li>
        </ul>
      </div>
    </div>
  )
}

export default Analytics
