import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'

export interface User {
  id: string
  email: string
  name: string
  full_name: string | null
  avatar_url: string | null
  is_admin: boolean
  created_at: string
  subscription: {
    id: string
    status: string
    trial_ends_at: string | null
    days_remaining: number | null
    plan: {
      id: string
      name: string
      max_projects: number
      max_views_per_month: number
    }
  } | null
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await apiClient.get<{ user: User }>('/api/v1/me')
        setUser(data.user)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch user')
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  return { user, loading, error }
}
