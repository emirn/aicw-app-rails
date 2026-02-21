# Production Deployment Checklist

Follow this checklist to deploy the production readiness features.

## Phase 1: External Services Setup

### 1.1 Cloudflare Turnstile (Required)

- [ ] Sign up at https://dash.cloudflare.com/
- [ ] Navigate to Turnstile section
- [ ] Click "Add Site"
- [ ] Configure site:
  - **Site name**: AICW Dashboard
  - **Domains**: `app.aicw.io` (your production domain)
  - **Widget mode**: Managed (recommended)
- [ ] Copy **Site Key** and **Secret Key**
- [ ] Test in development first (optional):
  ```bash
  # Add to apps/web/.env
  TURNSTILE_SITE_KEY=your_site_key_here
  TURNSTILE_SECRET_KEY=your_secret_key_here
  ```

**Cost**: Free

---

### 1.2 Sentry Error Tracking (Required)

- [ ] Sign up at https://sentry.io/signup/
- [ ] Create a new project:
  - **Platform**: Ruby on Rails
  - **Project name**: aicw-app-rails
  - **Team**: Your team name
- [ ] Copy the **DSN** (starts with `https://...@sentry.io/...`)
- [ ] Configure alert rules (optional):
  - Go to Alerts > Create Alert
  - Setup email notifications for errors
- [ ] Test in development (optional):
  ```bash
  # Add to apps/web/.env
  SENTRY_DSN=https://your-key@sentry.io/project-id
  SENTRY_ENABLED=true
  ```

**Cost**: Free tier (5,000 events/month) or Team plan ($26/month)

---

### 1.3 AWS S3 for Litestream Backups (Required)

#### Create S3 Bucket

- [ ] Sign in to AWS Console
- [ ] Navigate to S3
- [ ] Create bucket:
  - **Bucket name**: `aicw-db-backups`
  - **Region**: `us-east-1` (or your preferred region)
  - **Block public access**: Enable (keep bucket private)
  - **Versioning**: Disabled (Litestream handles versions)
  - **Encryption**: Enable (AES-256 or KMS)

#### Create IAM User for Litestream

- [ ] Navigate to IAM > Users
- [ ] Create user:
  - **User name**: `litestream-backup`
  - **Access type**: Programmatic access (Access Key)
- [ ] Attach permissions:
  - Create inline policy with this JSON:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ],
        "Resource": [
          "arn:aws:s3:::aicw-db-backups",
          "arn:aws:s3:::aicw-db-backups/*"
        ]
      }
    ]
  }
  ```
- [ ] Copy **Access Key ID** and **Secret Access Key**
- [ ] Save credentials securely (you won't see the secret again)

#### Alternative: Cloudflare R2 (Optional)

If you prefer Cloudflare R2 instead of S3:

- [ ] Navigate to Cloudflare Dashboard > R2
- [ ] Create bucket: `aicw-db-backups`
- [ ] Create API token with R2 write permissions
- [ ] Update `deployment/full-stack/litestream.yml`:
  ```yaml
  endpoint: https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
  ```

**Cost**: S3 ~$5-10/month for database backups

---

## Phase 2: GitHub Secrets Configuration

Add all secrets to GitHub repository:

1. **Navigate to**: https://github.com/YOUR_ORG/aicw-app-rails/settings/secrets/actions

2. **Click**: "New repository secret"

3. **Add each secret**:

### Existing Secrets (Verify These Exist)

- [ ] `SECRET_KEY_BASE` - Rails secret (run `bin/rails secret` to generate)
- [ ] `RAILS_MASTER_KEY` - Content of `apps/web/config/master.key`
- [ ] `GOOGLE_CLIENT_ID` - Google OAuth client ID
- [ ] `GOOGLE_CLIENT_SECRET` - Google OAuth secret
- [ ] `TINYBIRD_API_KEY` - Tinybird API key
- [ ] `WEBSITE_BUILDER_API_KEY` - API key for website builder
- [ ] `SUPABASE_URL` - Supabase project URL
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- [ ] `SMTP_USERNAME` - SMTP username (AWS SES)
- [ ] `SMTP_PASSWORD` - SMTP password
- [ ] `AICW_RAILS_DEPLOY_SSH_PRIVATE_KEY` - SSH private key for deployment
- [ ] `KAMAL_REGISTRY_PASSWORD` - GitHub token for GHCR (usually `GITHUB_TOKEN`)
- [ ] `OPENROUTER_API_KEY` - OpenRouter API key (for sgen)
- [ ] `AICW_WEBSITE_BUILD_API_KEY` - Website builder API key
- [ ] `CLOUDFLARE_API_TOKEN` - Cloudflare API token
- [ ] `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID
- [ ] `CLOUDFLARE_AICW_ZONE_ID` - Cloudflare zone ID

### New Secrets to Add

- [ ] `TURNSTILE_SITE_KEY` - From Cloudflare Turnstile (Phase 1.1)
- [ ] `TURNSTILE_SECRET_KEY` - From Cloudflare Turnstile (Phase 1.1)
- [ ] `SENTRY_DSN` - From Sentry (Phase 1.2)
- [ ] `AWS_ACCESS_KEY_ID` - From IAM user (Phase 1.3)
- [ ] `AWS_SECRET_ACCESS_KEY` - From IAM user (Phase 1.3)

---

## Phase 3: Update GitHub Workflow (Optional)

The workflow should already pass these secrets, but verify:

- [ ] Check `.github/workflows/deploy-full-stack.yml`
- [ ] Ensure new secrets are passed to deployment:
  ```yaml
  env:
    TURNSTILE_SITE_KEY: ${{ secrets.TURNSTILE_SITE_KEY }}
    TURNSTILE_SECRET_KEY: ${{ secrets.TURNSTILE_SECRET_KEY }}
    SENTRY_DSN: ${{ secrets.SENTRY_DSN }}
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  ```

**Note**: If the workflow file needs updates, it should already be done in the commit. Verify only.

---

## Phase 4: Local Testing

Before deploying to production, test locally:

- [ ] Run `bundle install` and `npm install`
- [ ] Run `bin/rails db:migrate`
- [ ] Start server: `bin/dev`
- [ ] Test TOTP 2FA flow (see `TESTING-GUIDE.md`)
- [ ] Test Turnstile (if configured locally)
- [ ] Test file upload validation
- [ ] Verify no console errors on dashboard

**See**: `TESTING-GUIDE.md` for detailed testing instructions

---

## Phase 5: Deployment

### 5.1 Create Deployment Tag

```bash
# Check current tags
git tag --list 'full-v*' --sort=-v:refname

# Create new tag (increment version)
git tag full-v1.1.0

# Push tag to GitHub
git push origin full-v1.1.0
```

### 5.2 Monitor GitHub Actions

- [ ] Go to https://github.com/YOUR_ORG/aicw-app-rails/actions
- [ ] Find the workflow run for your tag
- [ ] Monitor the deployment:
  - Build images (web, sgen, website-builder)
  - Push to GitHub Container Registry
  - Deploy via Kamal
  - Boot accessories (website-builder, sgen, litestream)

### 5.3 Deployment Should Complete

Expected steps:
1. ✅ Build aicw-app-rails image
2. ✅ Build sgen image
3. ✅ Build website-builder image
4. ✅ Push images to GHCR
5. ✅ Deploy to server via Kamal
6. ✅ Run database migrations
7. ✅ Boot accessories
8. ✅ Health checks pass

**Estimated time**: 10-15 minutes

---

## Phase 6: Post-Deployment Verification

### 6.1 Verify Services are Running

```bash
# SSH or use Kamal commands
ssh ubuntu@YOUR_SERVER_IP

# Or use Kamal
cd /path/to/aicw-app-rails/apps/web/deployment/full-stack
export KAMAL_REGISTRY_USERNAME=YOUR_GITHUB_USERNAME
export KAMAL_REGISTRY_PASSWORD=YOUR_GITHUB_TOKEN

# Check main app
kamal app details

# Check accessories
kamal accessory details website-builder
kamal accessory details sgen
kamal accessory details litestream
```

Expected output:
- All services should show status: "running"
- Health checks should be "healthy"

### 6.2 Verify Litestream Backups

```bash
# Check Litestream logs
kamal accessory logs litestream --tail 50

# Should see:
# - "Replicating to s3://aicw-db-backups/production/main"
# - Continuous activity every 10 seconds
# - No error messages
```

Verify in S3:
- [ ] Go to AWS Console > S3 > `aicw-db-backups`
- [ ] Should see folders: `production/main`, `production/cache`, `production/queue`
- [ ] Each folder should contain `.db` files and WAL segments

### 6.3 Test Production Features

#### Test TOTP 2FA

- [ ] Navigate to https://app.aicw.io (your production domain)
- [ ] Sign in with email OTP or Google OAuth
- [ ] Enable 2FA via dashboard settings
- [ ] Sign out and sign in again
- [ ] Verify TOTP prompt appears
- [ ] Enter code from authenticator app
- [ ] Successfully sign in

#### Test Turnstile

- [ ] Sign out
- [ ] Go to sign-in page
- [ ] Verify Turnstile widget appears
- [ ] Complete captcha
- [ ] Verify OTP is sent

#### Test Sentry

- [ ] Trigger a test error (via Rails console or test endpoint)
- [ ] Check Sentry dashboard at https://sentry.io/
- [ ] Verify error appears with full context

#### Test Rate Limiting

```bash
# Test public analytics rate limit
for i in {1..101}; do
  curl -X POST https://app.aicw.io/api/v1/analytics/public \
    -H "Content-Type: application/json" \
    -d '{"domain":"your-domain.com","pipe":"lookup_project"}' \
    -s -o /dev/null -w "%{http_code}\n"
done

# 101st request should return 429
```

#### Test File Upload Validation

- [ ] Create an article with valid image (< 10MB, JPEG/PNG)
- [ ] Try to upload invalid file (e.g., .exe) → should fail
- [ ] Try to upload large file (> 10MB) → should fail

### 6.4 Monitor Application

First 24 hours after deployment:

- [ ] Monitor Sentry for errors
- [ ] Check Litestream backup logs daily
- [ ] Monitor server resources (CPU, memory, disk)
- [ ] Check application logs: `kamal app logs -f`

---

## Phase 7: Enable 2FA for Admin Users

Strongly recommended:

- [ ] All admin/owner accounts should enable TOTP 2FA
- [ ] Download and securely store backup codes
- [ ] Test 2FA login flow for each admin

---

## Rollback Plan

If issues occur after deployment:

### Quick Rollback

```bash
# Rollback to previous version
kamal rollback <previous_version>

# Or deploy previous tag
git tag full-v1.0.0  # previous version
git push origin full-v1.0.0 --force  # triggers deployment
```

### Disable Specific Features

#### Disable CSP (if breaking functionality)

```bash
# SSH to server
ssh ubuntu@YOUR_SERVER_IP

# Edit initializer
# Change content_security_policy_report_only to true

# Restart app
kamal app restart
```

#### Disable Turnstile (temporary)

```bash
# Remove TURNSTILE_SECRET_KEY from deployment
# Update deploy.yml, remove from secrets
# Redeploy
```

#### Disable Sentry (if causing issues)

```bash
# Remove SENTRY_DSN from deployment
# Update deploy.yml
# Redeploy
```

---

## Estimated Costs

| Service | Monthly Cost |
|---------|--------------|
| Cloudflare Turnstile | **Free** |
| Sentry (Free tier) | **Free** |
| Sentry (Team plan) | **$26** |
| S3 Backups | **$5-10** |
| **Total (Free tier)** | **$5-10/mo** |
| **Total (Sentry Team)** | **$31-36/mo** |

---

## Success Criteria

Deployment is successful when:

- ✅ All services running and healthy
- ✅ Litestream continuously backing up databases
- ✅ TOTP 2FA working end-to-end
- ✅ Turnstile appearing on sign-in
- ✅ Sentry receiving errors
- ✅ Rate limiting working on public analytics
- ✅ File upload validation rejecting invalid files
- ✅ No errors in Sentry dashboard (unexpected ones)
- ✅ Application accessible and functioning normally
- ✅ No 502/503 errors during deployment

---

## Support

### Documentation

- **Full feature docs**: `PRODUCTION-READINESS.md`
- **Testing guide**: `TESTING-GUIDE.md`
- **Server operations**: `deployment/full-stack/SERVER-OPS.md`
- **Kamal config**: `deployment/full-stack/config/deploy.yml`

### Troubleshooting

- **Litestream not running**: Check AWS credentials and S3 permissions
- **TOTP not working**: Verify server time is synced (NTP)
- **Turnstile failing**: Check site key matches production domain
- **Sentry not receiving**: Verify DSN and network access

### Emergency Contacts

- **Production issues**: [Your contact]
- **AWS support**: https://console.aws.amazon.com/support/
- **Sentry support**: https://sentry.io/support/
- **Cloudflare support**: https://dash.cloudflare.com/support

---

## Post-Deployment Tasks

After successful deployment:

- [ ] Update internal documentation
- [ ] Notify team of new 2FA option
- [ ] Schedule backup restore test (quarterly recommended)
- [ ] Monitor costs (AWS, Sentry)
- [ ] Review Sentry errors weekly
- [ ] Update this checklist if issues found

---

**Last Updated**: 2026-02-21
**Version**: 1.0 (First production deployment with new features)
