import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useUser } from '@/hooks/useUser'
import { getAppConfig } from '@/config/api'
import Dashboard from '@/components/Dashboard'
import Projects from '@/components/Projects'
import ProjectDetails from '@/components/ProjectDetails'
import Analytics from '@/components/Analytics'
import WebsiteBuilder from '@/components/WebsiteBuilder'
import Loading from '@/components/Loading'

function App() {
  const { user, loading } = useUser()
  const [appVersion, setAppVersion] = useState<string>('')
  const [appRevision, setAppRevision] = useState<string>('')

  useEffect(() => {
    getAppConfig().then(config => {
      setAppVersion(config.appVersion || '')
      setAppRevision(config.appRevision || '')
    }).catch(() => {})
  }, [])

  if (loading) {
    return <Loading />
  }

  if (!user) {
    // Redirect to login if not authenticated
    window.location.href = '/users/sign_in'
    return <Loading />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/projects" element={<Projects />} />
        <Route path="/dashboard/projects/:projectId" element={<ProjectDetails />} />
        <Route path="/dashboard/projects/:projectId/analytics" element={<Analytics />} />
        <Route path="/dashboard/projects/:projectId/website" element={<WebsiteBuilder />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>

      {/* Version Footer */}
      {appVersion && (
        <footer className="fixed bottom-4 left-4 z-40">
          <span className="text-xs text-gray-400">
            v{appVersion}{appRevision && `.${appRevision}`}
          </span>
        </footer>
      )}
    </div>
  )
}

export default App
