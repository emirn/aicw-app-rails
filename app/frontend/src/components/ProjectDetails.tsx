import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiClient } from '@/lib/api-client'
import Loading from './Loading'

interface Project {
  id: string
  name: string
  domain: string
  tracking_id: string
  enable_public_page: boolean
  created_at: string
  visibility_check?: {
    id: string
    score_percent: number
    created_at: string
  } | null
  website?: {
    id: string
    name: string
    slug: string
    status: string
    public_url: string | null
  } | null
}

function ProjectDetails() {
  const { projectId } = useParams<{ projectId: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const data = await apiClient.get<{ project: Project }>(`/api/v1/projects/${projectId}`)
        setProject(data.project)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project')
      } finally {
        setLoading(false)
      }
    }

    fetchProject()
  }, [projectId])

  if (loading) return <Loading />

  if (error || !project) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error || 'Project not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
          <p className="mt-1 text-gray-600">{project.domain}</p>
        </div>
        <Link
          to="/dashboard/projects"
          className="text-blue-600 hover:text-blue-800"
        >
          Back to Projects
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link
          to={`/dashboard/projects/${projectId}/analytics`}
          className="block p-6 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Analytics</h2>
          <p className="text-gray-600">View traffic and AI visibility data</p>
        </Link>

        <Link
          to={`/dashboard/projects/${projectId}/website`}
          className="block p-6 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Website Builder</h2>
          <p className="text-gray-600">
            {project.website ? `Status: ${project.website.status}` : 'Create a blog website'}
          </p>
        </Link>

        <div className="p-6 bg-white rounded-lg border border-gray-200 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Tracking</h2>
          <p className="text-gray-600 text-sm font-mono break-all">
            {project.tracking_id}
          </p>
        </div>

        {project.visibility_check && (
          <div className="p-6 bg-white rounded-lg border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">AI Visibility</h2>
            <p className="text-3xl font-bold text-blue-600">
              {project.visibility_check.score_percent}%
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ProjectDetails
