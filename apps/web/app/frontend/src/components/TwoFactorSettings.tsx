import { useState, useEffect } from 'react'
import { apiClient } from '../lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Alert, AlertDescription } from './ui/alert'
import { toast } from 'sonner'
import { Shield, ShieldCheck, ShieldOff, KeyRound, RefreshCw } from 'lucide-react'

interface TwoFactorStatus {
  enabled: boolean
  has_backup_codes: boolean
}

interface EnableResponse {
  qr_code_uri: string
  secret: string
  backup_codes: string[]
}

export function TwoFactorSettings() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [setupMode, setSetupMode] = useState(false)
  const [setupData, setSetupData] = useState<EnableResponse | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    try {
      const data = await apiClient.get<TwoFactorStatus>('/api/v1/two_factor/status')
      setStatus(data)
    } catch (error) {
      toast.error('Failed to load 2FA status')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const startSetup = async () => {
    try {
      setLoading(true)
      const data = await apiClient.post<EnableResponse>('/api/v1/two_factor/enable', {})
      setSetupData(data)
      setSetupMode(true)
      toast.success('Scan the QR code with your authenticator app')
    } catch (error: any) {
      toast.error(error.message || 'Failed to start 2FA setup')
    } finally {
      setLoading(false)
    }
  }

  const confirmSetup = async () => {
    if (!verificationCode.trim()) {
      toast.error('Please enter the verification code')
      return
    }

    try {
      setVerifying(true)
      await apiClient.post('/api/v1/two_factor/confirm', { code: verificationCode })
      toast.success('Two-factor authentication enabled!')
      setSetupMode(false)
      setSetupData(null)
      setVerificationCode('')
      await loadStatus()
    } catch (error: any) {
      toast.error(error.message || 'Invalid verification code')
    } finally {
      setVerifying(false)
    }
  }

  const disable2FA = async () => {
    if (!confirm('Are you sure you want to disable two-factor authentication? This will make your account less secure.')) {
      return
    }

    try {
      setLoading(true)
      await apiClient.delete('/api/v1/two_factor/disable')
      toast.success('Two-factor authentication disabled')
      await loadStatus()
    } catch (error: any) {
      toast.error(error.message || 'Failed to disable 2FA')
    } finally {
      setLoading(false)
    }
  }

  const regenerateBackupCodes = async () => {
    if (!confirm('This will invalidate your existing backup codes. Continue?')) {
      return
    }

    try {
      setLoading(true)
      const data = await apiClient.post<{ backup_codes: string[] }>('/api/v1/two_factor/regenerate_backup_codes', {})

      // Show backup codes in a modal or download
      const codesText = data.backup_codes.join('\n')
      const blob = new Blob([codesText], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'backup-codes.txt'
      a.click()
      URL.revokeObjectURL(url)

      toast.success('New backup codes generated and downloaded')
      await loadStatus()
    } catch (error: any) {
      toast.error(error.message || 'Failed to regenerate backup codes')
    } finally {
      setLoading(false)
    }
  }

  const downloadBackupCodes = () => {
    if (!setupData?.backup_codes) return

    const codesText = setupData.backup_codes.join('\n')
    const blob = new Blob([codesText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Backup codes downloaded')
  }

  if (loading && !status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {status?.enabled ? (
              <ShieldCheck className="h-5 w-5 text-green-600" />
            ) : (
              <ShieldOff className="h-5 w-5 text-gray-400" />
            )}
            <CardTitle>Two-Factor Authentication</CardTitle>
          </div>
          <CardDescription>
            {status?.enabled
              ? 'Your account is protected with two-factor authentication'
              : 'Add an extra layer of security to your account'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!setupMode && !status?.enabled && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Two-factor authentication (2FA) adds an extra layer of security by requiring a code from your phone in addition to your password.
              </p>
              <Button onClick={startSetup} disabled={loading}>
                <Shield className="mr-2 h-4 w-4" />
                Enable Two-Factor Authentication
              </Button>
            </div>
          )}

          {!setupMode && status?.enabled && (
            <div className="space-y-4">
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertDescription>
                  Two-factor authentication is enabled. You'll be asked for a code from your authenticator app when signing in.
                </AlertDescription>
              </Alert>

              <div className="flex gap-2">
                <Button variant="outline" onClick={regenerateBackupCodes} disabled={loading}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate Backup Codes
                </Button>
                <Button variant="destructive" onClick={disable2FA} disabled={loading}>
                  Disable 2FA
                </Button>
              </div>
            </div>
          )}

          {setupMode && setupData && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium mb-3">Step 1: Scan QR Code</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Scan this QR code with Google Authenticator, Authy, or any TOTP-compatible app.
                </p>
                <div className="flex justify-center p-4 bg-white rounded-lg border">
                  <img src={setupData.qr_code_uri} alt="2FA QR Code" className="w-64 h-64" />
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Or enter this code manually: <code className="font-mono bg-muted px-2 py-1 rounded">{setupData.secret}</code>
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-3">Step 2: Save Backup Codes</h3>
                <Alert className="mb-3">
                  <KeyRound className="h-4 w-4" />
                  <AlertDescription>
                    Save these backup codes in a secure location. You can use them to access your account if you lose your authenticator device.
                  </AlertDescription>
                </Alert>
                <div className="bg-muted p-4 rounded-lg font-mono text-sm space-y-1">
                  {setupData.backup_codes.map((code, idx) => (
                    <div key={idx}>{code}</div>
                  ))}
                </div>
                <Button variant="outline" onClick={downloadBackupCodes} className="mt-2 w-full">
                  Download Backup Codes
                </Button>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-3">Step 3: Verify Setup</h3>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="verify-code">Enter the 6-digit code from your authenticator app</Label>
                    <Input
                      id="verify-code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="000000"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      className="text-center text-lg tracking-[0.3em] font-mono"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={confirmSetup} disabled={verifying || !verificationCode.trim()} className="flex-1">
                      {verifying ? 'Verifying...' : 'Complete Setup'}
                    </Button>
                    <Button variant="outline" onClick={() => { setSetupMode(false); setSetupData(null); setVerificationCode(''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
