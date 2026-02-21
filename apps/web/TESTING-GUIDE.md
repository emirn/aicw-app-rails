# Testing Guide - Production Readiness Features

This guide walks through testing all production features locally before deploying.

## Prerequisites

1. **Install dependencies**:
   ```bash
   cd /Users/mine/projects/websites/aicw-app-rails/apps/web
   bundle install
   npm install
   ```

2. **Run migrations**:
   ```bash
   bin/rails db:migrate
   ```

3. **Start development server**:
   ```bash
   # From repo root
   cd /Users/mine/projects/websites/aicw-app-rails
   bin/dev
   ```

---

## 1. Testing TOTP Two-Factor Authentication

### Setup 2FA

1. **Sign in to the dashboard**:
   - Navigate to http://localhost:3000/dashboard
   - Sign in with your account (email OTP or Google OAuth)

2. **Access settings page** (you'll need to add 2FA settings to your UI):
   - For testing via API:
   ```bash
   # Get your session token (from browser dev tools cookies)
   export TOKEN="your_session_token"

   # Check 2FA status
   curl -H "Cookie: your_cookie" http://localhost:3000/api/v1/two_factor/status
   ```

3. **Enable 2FA via API**:
   ```bash
   # Start 2FA setup
   curl -X POST -H "Cookie: your_cookie" \
     http://localhost:3000/api/v1/two_factor/enable \
     -H "Content-Type: application/json"

   # Response will include:
   # - qr_code_uri: Base64 PNG of QR code
   # - secret: Manual entry code
   # - backup_codes: Array of 16 backup codes
   ```

4. **Scan QR code**:
   - Save the `qr_code_uri` to an HTML file:
   ```html
   <img src="data:image/png;base64,..." />
   ```
   - Scan with Google Authenticator or Authy
   - Or enter the `secret` manually

5. **Confirm 2FA setup**:
   ```bash
   # Get code from your authenticator app
   curl -X POST -H "Cookie: your_cookie" \
     http://localhost:3000/api/v1/two_factor/confirm \
     -H "Content-Type: application/json" \
     -d '{"code": "123456"}'
   ```

### Test 2FA Login Flow

1. **Sign out**: http://localhost:3000/users/sign_out

2. **Sign in with email OTP**:
   - Go to http://localhost:3000/users/sign_in
   - Enter your email
   - Check email for OTP code
   - Enter OTP code
   - **You should be redirected to TOTP verification page**

3. **Enter TOTP code**:
   - Open Google Authenticator
   - Enter the 6-digit code
   - Click "Verify"
   - **You should be signed in successfully**

4. **Test with backup code**:
   - Sign out and sign in again
   - At TOTP prompt, enter one of your backup codes
   - **Should sign in successfully**
   - **Backup code should be consumed (can't use again)**

5. **Test rate limiting**:
   - Sign in and get to TOTP prompt
   - Enter 10 invalid codes rapidly
   - **11th attempt should show rate limit error**

### Test 2FA with Google OAuth

1. **Sign out**
2. **Click "Continue with Google"**
3. **Complete Google OAuth flow**
4. **Should be redirected to TOTP verification**
5. **Enter TOTP code to complete sign-in**

### Test Disable 2FA

```bash
curl -X DELETE -H "Cookie: your_cookie" \
  http://localhost:3000/api/v1/two_factor/disable
```

**Expected**: 2FA disabled, next sign-in skips TOTP prompt

### Test Regenerate Backup Codes

```bash
curl -X POST -H "Cookie: your_cookie" \
  http://localhost:3000/api/v1/two_factor/regenerate_backup_codes
```

**Expected**: New set of 16 backup codes, old codes invalidated

---

## 2. Testing Cloudflare Turnstile

### Setup (Optional - can test without actual keys)

1. **Get Turnstile keys**:
   - Sign up at https://dash.cloudflare.com/
   - Go to Turnstile section
   - Create a new site
   - Copy Site Key and Secret Key

2. **Add to .env**:
   ```bash
   TURNSTILE_SITE_KEY=your_site_key
   TURNSTILE_SECRET_KEY=your_secret_key
   ```

3. **Restart server**: `bin/dev`

### Testing with Turnstile Enabled

1. **Visit sign-in page**: http://localhost:3000/users/sign_in

2. **Verify Turnstile widget appears**:
   - Should see Cloudflare checkbox/widget below email field
   - If keys are valid, widget loads

3. **Test form submission**:
   - Try submitting without solving captcha
   - **Should be blocked or show error**

4. **Solve captcha and submit**:
   - Complete the Turnstile challenge
   - Submit form
   - **Should send OTP email successfully**

### Testing without Turnstile (Development)

- If `TURNSTILE_SECRET_KEY` is not set, Turnstile is skipped
- Form works normally without captcha
- This is fine for local testing

---

## 3. Testing Sentry Error Tracking

### Setup

1. **Sign up at Sentry**:
   - Go to https://sentry.io/signup/
   - Create a new project (Rails)
   - Copy DSN

2. **Add to .env**:
   ```bash
   SENTRY_DSN=https://your-key@sentry.io/project-id
   SENTRY_ENABLED=true  # Enable in development
   ```

3. **Restart server**

### Test Error Capture

1. **Trigger a test error via Rails console**:
   ```bash
   bin/rails console
   ```
   ```ruby
   # In console
   Sentry.capture_message("Test error from development")

   # Or trigger an actual exception
   raise "Test exception for Sentry"
   ```

2. **Via API request**:
   Create a temporary test endpoint in `routes.rb`:
   ```ruby
   # For testing only
   get "test_sentry_error", to: proc { raise "Test Sentry error" } if Rails.env.development?
   ```

   Then visit: http://localhost:3000/test_sentry_error

3. **Check Sentry dashboard**:
   - Go to your Sentry project
   - Navigate to Issues
   - **Should see your test error appear within seconds**
   - Click on it to see:
     - Stack trace
     - Request context
     - Environment details

4. **Verify PII filtering**:
   - Errors should NOT contain passwords or tokens
   - Sensitive params should be filtered

### Disable Sentry in Development

Remove or comment out in `.env`:
```bash
# SENTRY_ENABLED=true
```

---

## 4. Testing Rate Limiting on Public Analytics

### Setup Test Data

1. **Create a public project**:
   ```bash
   bin/rails console
   ```
   ```ruby
   # Find or create a project with enable_public_page=true
   project = Project.first
   project.update(enable_public_page: true, domain: "test-domain.com")
   ```

### Test Rate Limit

1. **Make requests to public endpoint**:
   ```bash
   # Install httpie for easier testing (optional)
   # brew install httpie

   # Make 100 requests (should succeed)
   for i in {1..100}; do
     curl -X POST http://localhost:3000/api/v1/analytics/public \
       -H "Content-Type: application/json" \
       -d '{"domain":"test-domain.com","pipe":"lookup_project"}' \
       -s -o /dev/null -w "%{http_code}\n"
   done

   # 101st request should return 429
   curl -X POST http://localhost:3000/api/v1/analytics/public \
     -H "Content-Type: application/json" \
     -d '{"domain":"test-domain.com","pipe":"lookup_project"}' \
     -i
   ```

2. **Expected results**:
   - First 100 requests: `200 OK`
   - 101st request: `429 Too Many Requests`
   - Response body: `{"error":"Rate limit exceeded. Please try again later."}`

3. **Wait 5 minutes and test again**:
   - Rate limit should reset
   - New requests should succeed

---

## 5. Testing Content Security Policy

### Check CSP Headers

1. **Visit any page**: http://localhost:3000/dashboard

2. **Open browser DevTools** > Network tab

3. **Check response headers**:
   - Look for `Content-Security-Policy` header (not `Content-Security-Policy-Report-Only`)
   - Should see policy directives

4. **Test CSP enforcement**:
   ```bash
   # Check if CSP is enforced (not report-only)
   curl -I http://localhost:3000/dashboard | grep -i "content-security-policy"
   ```

   **Should NOT see**: `Content-Security-Policy-Report-Only`
   **Should see**: `Content-Security-Policy: default-src 'self'...`

### Test CSP Violations

1. **Try to inject inline script** (should be blocked):
   - In browser console, try:
   ```javascript
   eval("console.log('test')");
   ```
   - **Should see CSP error in console**

2. **Check for CSP violations**:
   - Browser console should show: `Refused to execute inline script because it violates CSP`

### Rollback if Needed

If CSP breaks functionality:

1. Edit `config/initializers/content_security_policy.rb`
2. Change `config.content_security_policy_report_only = false` to `true`
3. Restart server

---

## 6. Testing File Upload Validation

### Test Valid Uploads

1. **Create an article with valid images**:
   ```bash
   # Via Rails console
   bin/rails console
   ```
   ```ruby
   website = ProjectWebsite.first
   article = website.articles.create!(
     title: "Test Article",
     slug: "test-article",
     content: "Test content"
   )

   # Attach a valid image (< 10MB, JPEG/PNG/WEBP)
   article.assets.attach(
     io: File.open('/path/to/test-image.jpg'),
     filename: 'test-image.jpg',
     content_type: 'image/jpeg'
   )

   article.valid?  # Should be true
   ```

### Test Invalid Uploads

1. **Test file size limit**:
   ```ruby
   # Try to attach file > 10MB
   # Should fail validation
   article.assets.attach(
     io: File.open('/path/to/large-file.jpg'),  # > 10MB
     filename: 'large.jpg',
     content_type: 'image/jpeg'
   )

   article.valid?  # Should be false
   article.errors.full_messages  # Should mention file size
   ```

2. **Test content type restriction**:
   ```ruby
   # Try to attach .exe file
   article.assets.attach(
     io: File.open('/path/to/file.exe'),
     filename: 'malware.exe',
     content_type: 'application/x-msdownload'
   )

   article.valid?  # Should be false
   article.errors.full_messages  # Should mention content type
   ```

3. **Test quantity limit**:
   ```ruby
   # Try to attach 21 files
   21.times do |i|
     article.assets.attach(
       io: File.open('/path/to/image.jpg'),
       filename: "image#{i}.jpg",
       content_type: 'image/jpeg'
     )
   end

   article.valid?  # Should be false
   article.errors.full_messages  # Should mention file limit
   ```

### Test via API

```bash
# Test file upload via API endpoint
curl -X POST http://localhost:3000/api/v1/websites/:website_id/articles \
  -H "Cookie: your_cookie" \
  -F "title=Test Article" \
  -F "content=Test content" \
  -F "assets[]=@/path/to/valid-image.jpg" \
  -F "assets[]=@/path/to/malware.exe"  # Should fail
```

---

## 7. Testing Graceful Shutdown

This is tested during deployment, but you can simulate locally:

1. **Start the server**: `bin/dev`

2. **Make a long-running request** (simulate):
   ```ruby
   # Add temporary endpoint in routes.rb (for testing)
   get "slow_endpoint", to: proc {
     sleep 10
     [200, {}, ["Done"]]
   } if Rails.env.development?
   ```

3. **In another terminal, make request**:
   ```bash
   curl http://localhost:3000/slow_endpoint &
   ```

4. **While request is running, send SIGTERM**:
   ```bash
   pkill -TERM puma
   ```

5. **Expected behavior**:
   - Server waits up to 30 seconds for request to complete
   - Request should finish successfully
   - Server then shuts down

**Note**: This is primarily tested during actual deployments with Kamal.

---

## 8. Testing Litestream Backups

**Note**: Litestream requires S3 credentials and is primarily for production. Local testing is limited.

### Local Testing (Optional)

1. **Setup local S3 (MinIO)**:
   ```bash
   # Install MinIO (optional)
   brew install minio/stable/minio

   # Start MinIO
   minio server /tmp/minio-data
   ```

2. **Configure Litestream for local testing**:
   - Update `deployment/full-stack/litestream.yml`
   - Point to local MinIO endpoint
   - This is advanced and optional

### Production Testing

After deploying:

```bash
# Check Litestream logs
kamal accessory logs litestream

# Verify replication is working
kamal accessory logs litestream --tail 50

# Should see continuous replication activity every 10 seconds
```

See `SERVER-OPS.md` for full restore testing procedures.

---

## Quick Test Checklist

Before deploying to production, verify:

- [ ] TOTP 2FA signup flow works end-to-end
- [ ] TOTP backup codes work
- [ ] Turnstile appears on sign-in (if configured)
- [ ] Sentry captures errors (if configured)
- [ ] Public analytics rate limiting works (429 on 101st request)
- [ ] CSP header is enforced (not report-only)
- [ ] File upload validation rejects invalid files
- [ ] No console errors on dashboard pages
- [ ] React TwoFactorSettings component renders (when integrated)

---

## Troubleshooting

### TOTP codes not working

- **Check server time**: TOTP is time-based
  ```bash
  date -u  # Should match UTC time
  ```
- **Check drift**: Codes are valid for 15 seconds before/after
- **Verify secret**: Make sure you scanned the correct QR code

### Turnstile not appearing

- Check `TURNSTILE_SITE_KEY` is set
- Check browser console for errors
- Verify Turnstile script loaded: https://challenges.cloudflare.com/turnstile/v0/api.js

### Sentry not receiving errors

- Check `SENTRY_DSN` is correct
- Ensure `SENTRY_ENABLED=true` in development
- Check logs for Sentry initialization message
- Verify network request to sentry.io in DevTools

### Rate limiting not working

- Check Rails 8 rate limiting is configured
- Verify request IP is consistent
- Check Rails logs for rate limit messages

---

## Next Steps

After local testing:

1. **Commit any fixes**
2. **Push to GitHub**
3. **Setup production credentials** (see DEPLOYMENT-CHECKLIST.md)
4. **Deploy to staging/production**
5. **Test in production environment**

See `PRODUCTION-READINESS.md` for full deployment guide.
