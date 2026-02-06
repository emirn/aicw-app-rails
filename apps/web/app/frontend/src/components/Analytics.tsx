import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiClient } from '@/lib/api-client'
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard'
import { useUrlFilters } from '@/hooks/use-url-filters'
import { DateRange } from 'react-day-picker'
import { subDays } from 'date-fns'
import Loading from './Loading'

interface Project {
  id: string
  name: string
  domain: string
  tracking_id: string
  enable_public_page: boolean
}

function Analytics() {
  const { projectId } = useParams<{ projectId: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Date range state (default: Last 7 days)
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 6),
    to: new Date(),
  })

  // URL-synced filters
  const { channelFilter, pageFilter, countryFilter, setChannelFilter, toggleChannel, setPageFilter, setCountryFilter, clearAllFilters } = useUrlFilters()

  // Active tab state
  const [activeTab, setActiveTab] = useState("traffic")

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
        <div className="text-center">
          <p className="text-destructive">{error || 'Project not found'}</p>
          <Link to="/dashboard" className="text-primary hover:text-primary/80 mt-4 inline-block">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground truncate">
          {project.name} Analytics
        </h1>
        <Link
          to={`/dashboard/projects/${projectId}`}
          className="text-primary hover:text-primary/80 text-sm"
        >
          Back to Project
        </Link>
      </div>

      <AnalyticsDashboard
        projectId={project.id}
        projectName={project.name}
        domain={project.domain}
        isPublic={false}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        pageFilter={pageFilter}
        onPageFilterChange={setPageFilter}
        channelFilter={channelFilter}
        onChannelFilterChange={setChannelFilter}
        onToggleChannel={toggleChannel}
        countryFilter={countryFilter}
        onCountryFilterChange={setCountryFilter}
        onClearAllFilters={clearAllFilters}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        showSettingsTab={false}
        showGettingStarted={false}
      />
    </div>
  )
}

export default Analytics
