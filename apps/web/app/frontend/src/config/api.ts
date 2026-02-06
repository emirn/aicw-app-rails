export interface AppConfig {
  appVersion: string
  appRevision: string
}

let cachedConfig: AppConfig | null = null

export async function getAppConfig(): Promise<AppConfig> {
  if (cachedConfig) return cachedConfig

  try {
    const response = await fetch('/dashboard/manifest', {
      credentials: 'include'
    })
    if (response.ok) {
      cachedConfig = await response.json()
      return cachedConfig!
    }
  } catch (e) {
    console.warn('Failed to fetch app config:', e)
  }

  return { appVersion: '', appRevision: '' }
}
