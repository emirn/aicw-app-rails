# Production Readiness Implementation

This document summarizes the production features implemented to prepare aicw-app-rails for public launch.

## Completed Features

### 1. ✅ TOTP Two-Factor Authentication (2FA)

**Status**: Fully implemented and integrated

**What Was Added**:
- Database migration with 4 new columns for TOTP (otp_required_for_login, otp_secret, last_otp_timestep, otp_backup_codes)
- `User::TwoFactorAuthentication` concern with full TOTP logic
- TOTP verification controller (`Users::TotpSessionsController`)
- API endpoints for 2FA settings management
- React component for 2FA setup UI (`TwoFactorSettings.tsx`)
- Integration with both email OTP and Google OAuth flows
- QR code generation for authenticator apps
- 16 backup codes for emergency access
- Rate limiting (10 attempts/min)
- Replay protection via timestep tracking

**Files Modified**:
- `apps/web/db/migrate/20260221112806_add_totp_to_users.rb` (NEW)
- `apps/web/app/models/user/two_factor_authentication.rb` (NEW)
- `apps/web/app/controllers/users/totp_sessions_controller.rb` (NEW)
- `apps/web/app/controllers/api/v1/two_factor_controller.rb` (NEW)
- `apps/web/app/frontend/src/components/TwoFactorSettings.tsx` (NEW)
- `apps/web/app/views/users/totp_sessions/new.html.erb` (NEW)
- `apps/web/app/models/user.rb` (MODIFIED - include TwoFactorAuthentication)
- `apps/web/app/controllers/users/otp_sessions_controller.rb` (MODIFIED - redirect to TOTP)
- `apps/web/app/controllers/users/omniauth_callbacks_controller.rb` (MODIFIED - redirect to TOTP)
- `apps/web/config/routes.rb` (MODIFIED - added TOTP routes)
- `apps/web/Gemfile` (MODIFIED - added rotp, rqrcode gems)

**How It Works**:
1. User signs in with email OTP or Google OAuth
2. If user has 2FA enabled → redirected to TOTP verification
3. User enters 6-digit code from Google Authenticator/Authy OR backup code
4. Sign-in completed after successful TOTP verification

**API Endpoints**:
- `GET /api/v1/two_factor/status` - Check if 2FA enabled
- `POST /api/v1/two_factor/enable` - Start 2FA setup (returns QR code + backup codes)
- `POST /api/v1/two_factor/confirm` - Verify and enable 2FA
- `DELETE /api/v1/two_factor/disable` - Disable 2FA
- `POST /api/v1/two_factor/regenerate_backup_codes` - Generate new backup codes

---

### 2. ✅ Cloudflare Turnstile Captcha

**Status**: Implemented for sign-in form

**What Was Added**:
- Turnstile widget on email OTP sign-in form
- Server-side verification before sending OTP codes
- Environment variable configuration

**Files Modified**:
- `apps/web/app/views/users/otp_sessions/new.html.erb` (MODIFIED - added Turnstile widget)
- `apps/web/app/controllers/users/otp_sessions_controller.rb` (MODIFIED - added verify_turnstile method)
- `apps/web/.env.example` (MODIFIED - added TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY)

**Configuration Required**:
```bash
TURNSTILE_SITE_KEY=your_site_key
TURNSTILE_SECRET_KEY=your_secret_key
```

**How It Works**:
- Turnstile widget appears on sign-in form
- User must solve captcha before submitting email
- Server verifies token via Cloudflare API before sending OTP
- Prevents bot abuse and spam signups

---

### 3. ✅ Sentry Error Tracking

**Status**: Configured for production monitoring

**What Was Added**:
- Sentry Ruby + Rails integration
- Production-only error tracking (10% performance sampling)
- PII filtering for sensitive data
- Release tracking via APP_VERSION

**Files Modified**:
- `apps/web/config/initializers/sentry.rb` (NEW)
- `apps/web/Gemfile` (MODIFIED - added sentry-ruby, sentry-rails)
- `apps/web/.env.example` (MODIFIED - added SENTRY_DSN)

**Configuration Required**:
```bash
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

**Features**:
- Automatic error capture with context
- User context included (when available)
- Filtered sensitive parameters
- Performance monitoring (10% sample rate)
- Enabled only in production (unless `SENTRY_ENABLED=true`)

---

### 4. ✅ Rate Limiting on Public Analytics

**Status**: Implemented

**What Was Added**:
- Rate limit on `/api/v1/analytics/public` endpoint
- 100 requests per 5 minutes per IP
- Returns 429 Too Many Requests on exceed

**Files Modified**:
- `apps/web/app/controllers/api/v1/analytics_controller.rb` (MODIFIED)

**Why Important**:
- Prevents DoS attacks
- Prevents data scraping abuse
- Protects Tinybird API quota

---

### 5. ✅ Content Security Policy (CSP) Enforcement

**Status**: Enforced (switched from report-only mode)

**What Was Changed**:
- Changed `content_security_policy_report_only` from `true` to `false`
- CSP now actively blocks violations instead of just reporting

**Files Modified**:
- `apps/web/config/initializers/content_security_policy.rb` (MODIFIED)

**Rollback**:
If issues occur, set `config.content_security_policy_report_only = true`

**Security Benefits**:
- Prevents XSS attacks
- Blocks unauthorized script execution
- Protects against clickjacking

---

### 6. ✅ File Upload Validation

**Status**: Implemented

**What Was Added**:
- ActiveStorage validations for WebsiteArticle assets
- Content type restrictions (JPEG, PNG, WEBP, PDF only)
- File size limit (10MB per file)
- Quantity limit (max 20 files per article)

**Files Modified**:
- `apps/web/app/models/website_article.rb` (MODIFIED)
- `apps/web/Gemfile` (MODIFIED - added active_storage_validations)

**Validation Rules**:
```ruby
validates :assets,
  content_type: { in: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
  size: { less_than: 10.megabytes },
  limit: { max: 20 }
```

**Security Benefits**:
- Prevents malicious file uploads
- Prevents resource exhaustion
- Enforces business rules

---

### 7. ✅ Graceful Shutdown

**Status**: Configured in Puma

**What Was Added**:
- Worker timeout: 60 seconds
- Worker shutdown timeout: 30 seconds (matches Kamal drain_timeout)
- Graceful shutdown hook

**Files Modified**:
- `apps/web/config/puma.rb` (MODIFIED)

**How It Works**:
- During deployments, Puma waits 30s for in-flight requests to complete
- Prevents 502/503 errors during deployments
- Matches Kamal's drain_timeout configuration

---

### 8. ✅ Litestream Database Backups

**Status**: Configured (requires production deployment to activate)

**What Was Added**:
- Litestream accessory in Kamal deployment
- Configuration for S3 replication
- Continuous backups (10s interval for main DB)
- 30-day retention for production database
- 7-day retention for cache/queue databases
- SERVER-OPS.md documentation with restore procedures

**Files Created**:
- `apps/web/deployment/full-stack/litestream.yml` (NEW)
- `apps/web/deployment/full-stack/SERVER-OPS.md` (MODIFIED - added restore procedures)

**Files Modified**:
- `apps/web/deployment/full-stack/config/deploy.yml` (MODIFIED - added litestream accessory)

**Configuration Required**:
GitHub Secrets needed:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

**Backup Schedule**:
- Main DB: Replicate every 10 seconds, retain 30 days
- Cache/Queue: Replicate every 1 minute, retain 7 days
- Full snapshots: Every 24 hours

**Restore Procedures**:
See `apps/web/deployment/full-stack/SERVER-OPS.md` for complete restore documentation.

---

## Dependencies Added

### Ruby Gems
```ruby
gem "rotp", "~> 6.3"                    # TOTP for 2FA
gem "rqrcode", "~> 2.2"                 # QR codes
gem "sentry-ruby"                       # Error tracking
gem "sentry-rails"                      # Rails integration
gem "active_storage_validations", "~> 1.1"  # File validation
```

---

## Environment Variables Required

### Development
```bash
# Optional (for testing)
TURNSTILE_SITE_KEY=your_site_key
TURNSTILE_SECRET_KEY=your_secret_key
SENTRY_DSN=your_sentry_dsn
SENTRY_ENABLED=true  # To test Sentry in dev
```

### Production (GitHub Secrets)

**Already Configured**:
- SECRET_KEY_BASE
- RAILS_MASTER_KEY
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- TINYBIRD_API_KEY
- WEBSITE_BUILDER_API_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SMTP_USERNAME
- SMTP_PASSWORD

**New Secrets Needed**:
```bash
# Cloudflare Turnstile
TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY

# Sentry Error Tracking
SENTRY_DSN

# Litestream Backups
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

---

## Next Steps

### Before Deploying to Production

1. **Get Cloudflare Turnstile Keys**:
   - Sign up at https://dash.cloudflare.com/
   - Create a Turnstile site
   - Add keys to GitHub Secrets

2. **Setup Sentry**:
   - Sign up at https://sentry.io/
   - Create new project (Rails)
   - Copy DSN to GitHub Secrets

3. **Setup S3 Bucket for Litestream**:
   - Create S3 bucket: `aicw-db-backups`
   - Create IAM user with S3 permissions
   - Add credentials to GitHub Secrets

4. **Update GitHub Secrets**:
   ```bash
   # Add via GitHub UI: Settings > Secrets > Actions
   TURNSTILE_SITE_KEY
   TURNSTILE_SECRET_KEY
   SENTRY_DSN
   AWS_ACCESS_KEY_ID
   AWS_SECRET_ACCESS_KEY
   ```

5. **Update Deployment Workflow** (if needed):
   - Ensure `.github/workflows/deploy-full-stack.yml` passes all secrets
   - Verify Kamal env vars in `deploy.yml`

6. **Test in Staging** (if available):
   - Test TOTP 2FA flow
   - Test Turnstile captcha
   - Verify Sentry error capture
   - Test rate limiting
   - Verify CSP doesn't break functionality

7. **Deploy**:
   ```bash
   git tag full-v1.1.0
   git push origin full-v1.1.0
   ```

8. **Post-Deployment Verification**:
   - Verify Litestream is running: `kamal accessory logs litestream`
   - Test TOTP 2FA signup/signin
   - Trigger test error to verify Sentry
   - Test public analytics rate limiting
   - Monitor Sentry dashboard for CSP violations

---

## Testing Checklist

### TOTP 2FA
- [ ] Enable 2FA in dashboard settings
- [ ] Scan QR code with Google Authenticator
- [ ] Download backup codes
- [ ] Sign out and sign in with email OTP → TOTP prompt
- [ ] Enter valid TOTP code → successful sign-in
- [ ] Test with invalid code → error message
- [ ] Test backup code recovery
- [ ] Test rate limiting (10 attempts/min)
- [ ] Disable 2FA

### Turnstile
- [ ] Visit sign-in page → Turnstile widget appears
- [ ] Submit without solving → form blocked
- [ ] Solve captcha → form submits
- [ ] Verify OTP sent email

### Sentry
- [ ] Trigger test error in production
- [ ] Verify error appears in Sentry dashboard
- [ ] Check user context is included
- [ ] Verify sensitive params are filtered

### Rate Limiting
- [ ] Public analytics: Make 101 requests in 5 min → 101st gets 429

### File Uploads
- [ ] Upload 11MB file → rejected
- [ ] Upload .exe file → rejected
- [ ] Upload 21 files → rejected
- [ ] Upload valid image → accepted

### Database Backups
- [ ] Check Litestream logs: `kamal accessory logs litestream`
- [ ] Verify S3 bucket has snapshots
- [ ] Test restore procedure on staging

---

## Cost Estimate

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Sentry | Free tier (5k events) | $0 |
| Sentry | Team plan (optional) | $26 |
| Cloudflare Turnstile | Free | $0 |
| S3 Storage (Litestream) | ~5GB | $5-10 |
| **Total (minimum)** | | **$5-10/mo** |
| **Total (with Sentry Team)** | | **$31-36/mo** |

---

## Implementation Timeline

**Total Time**: ~2 hours of focused work

- TOTP 2FA: 1 hour
- Turnstile: 10 minutes
- Sentry: 10 minutes
- Rate limiting: 5 minutes
- CSP enforcement: 2 minutes
- File validation: 10 minutes
- Graceful shutdown: 5 minutes
- Litestream: 20 minutes

---

## Support & Documentation

- **TOTP Implementation**: Based on Inspector sample app pattern
- **Litestream Restore**: See `apps/web/deployment/full-stack/SERVER-OPS.md`
- **Kamal Deployment**: See `apps/web/deployment/full-stack/config/deploy.yml`
- **GitHub Workflow**: See `.github/workflows/deploy-full-stack.yml`

---

## Notes

- All features follow existing Rails 8 patterns in the codebase
- No over-engineering - only essential production features
- Disposable email protection already existed (ValidEmail2 gem)
- Rate limiting already existed for auth endpoints (Rails 8 built-in)
- SQLite + Litestream is production-ready for single-server deployments
- TOTP is opt-in (users enable via settings)
- CSP can be reverted to report-only if issues occur

---

**Last Updated**: 2026-02-21
**Implemented By**: Claude Sonnet 4.5
**Status**: ✅ All features implemented, ready for production deployment
