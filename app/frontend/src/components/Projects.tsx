import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '@/lib/api-client'
import Loading from './Loading'

interface Project {
  id: string
  name: string
  domain: string
  tracking_id: string
  enable_public_page: boolean
  created_at: string
}

function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await apiClient.get<{ projects: Project[] }>('/api/v1/projects')
        setProjects(data.projects)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects')
      } finally {
        setLoading(false)
      }
    }

    fetchProjects()
  }, [])

  if (loading) return <Loading />

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
        <Link
          to="/dashboard"
          className="text-blue-600 hover:text-blue-800"
        >
          Back to Dashboard
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <Link
            key={project.id}
            to={`/dashboard/projects/${project.id}`}
            className="block p-6 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {project.name}
            </h2>
            <p className="text-gray-600 text-sm mb-2">{project.domain}</p>
            <div className="flex items-center text-xs text-gray-500">
              <span className={`w-2 h-2 rounded-full mr-2 ${project.enable_public_page ? 'bg-green-500' : 'bg-gray-400'}`}></span>
              {project.enable_public_page ? 'Public' : 'Private'}
            </div>
          </Link>
        ))}

        {projects.length === 0 && !error && (
          <div className="col-span-full text-center py-12 text-gray-500">
            No projects yet. Create your first project to get started.
          </div>
        )}
      </div>
    </div>
  )
}

export default Projects
