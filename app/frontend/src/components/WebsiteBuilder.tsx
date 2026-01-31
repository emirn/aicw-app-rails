import React from 'react'
import { useParams, Link } from 'react-router-dom'

function WebsiteBuilder() {
  const { projectId } = useParams<{ projectId: string }>()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Website Builder</h1>
        <Link
          to={`/dashboard/projects/${projectId}`}
          className="text-blue-600 hover:text-blue-800"
        >
          Back to Project
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <p className="text-gray-600">
          Website builder coming soon. This will allow you to:
        </p>
        <ul className="mt-4 list-disc list-inside text-gray-600 space-y-2">
          <li>Create and manage blog articles</li>
          <li>Customize website theme and branding</li>
          <li>Set up custom domains</li>
          <li>Deploy to Cloudflare Pages</li>
          <li>Track deployment history</li>
        </ul>
      </div>
    </div>
  )
}

export default WebsiteBuilder
