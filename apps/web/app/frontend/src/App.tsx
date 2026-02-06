import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useUser } from '@/hooks/useUser'
import { getAppConfig } from '@/config/api'
import { ThemeProvider } from '@/context/ThemeContext'
import { ThemeToggle } from '@/components/ThemeToggle'
import Dashboard from '@/components/Dashboard'
import ApiTokenSettings from '@/components/ApiTokenSettings'
import Projects from '@/components/Projects'
import ProjectDetails from '@/components/ProjectDetails'
import Analytics from '@/components/Analytics'
import WebsiteBuilder from '@/components/WebsiteBuilder'
import PublicAnalytics from '@/components/PublicAnalytics'
import Loading from '@/components/Loading'

function AppContent() {
  const location = useLocation()
  const isPublicRoute = location.pathname.startsWith('/public/')
  const { user, loading } = useUser(isPublicRoute)
  const [appVersion, setAppVersion] = useState<string>('')
  const [appRevision, setAppRevision] = useState<string>('')

  useEffect(() => {
    getAppConfig().then(config => {
      setAppVersion(config.appVersion || '')
      setAppRevision(config.appRevision || '')
    }).catch(() => {})
  }, [])

  // Public routes don't need auth
  if (isPublicRoute) {
    return (
      <Routes>
        <Route path="/public/:domain" element={<PublicAnalytics />} />
      </Routes>
    )
  }

  if (loading) {
    return <Loading />
  }

  if (!user) {
    window.location.href = '/users/sign_in'
    return <Loading />
  }

  return (
    <div className="min-h-screen bg-background">
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/projects" element={<Projects />} />
        <Route path="/dashboard/projects/:projectId" element={<ProjectDetails />} />
        <Route path="/dashboard/projects/:projectId/analytics" element={<Analytics />} />
        <Route path="/dashboard/projects/:projectId/website" element={<WebsiteBuilder />} />
        <Route path="/dashboard/settings" element={<ApiTokenSettings />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>

      {/* Theme Toggle and Version in Footer */}
      <footer className="fixed bottom-4 left-4 z-40 flex items-center gap-3">
        <ThemeToggle />
        {appVersion && (
          <span className="text-xs text-muted-foreground/50">
            v{appVersion}{appRevision && `.${appRevision}`}
          </span>
        )}
      </footer>
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}

export default App
