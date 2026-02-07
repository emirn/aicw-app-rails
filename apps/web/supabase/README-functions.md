 Deploy Fix Summary For Deploying View Function (2026 Feb 7)

  Root causes (there were 3 issues):

  1. assert { type: 'json' } syntax in constants-visitor-sources.ts — deprecated/unsupported by the bundler
  2. npm: import specifiers — not properly handled by server-side bundling (--use-api)
  3. --use-api flag — the real killer. Server-side bundling on Supabase's infrastructure couldn't handle the combination of esm.sh redirects, JSON imports, and npm
  specifiers. The "Failed to retrieve function bundle" error you saw in the dashboard confirmed the bundle was corrupted from failed deploy attempts.

  Fixes applied across 4 files:
  ┌──────────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────┐
  │             File             │                                          Change                                          │
  ├──────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┤
  │ constants-visitor-sources.ts │ Replaced import ... assert/with { type: 'json' } with Deno.readTextFileSync + JSON.parse │
  ├──────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┤
  │ ip-to-location.ts            │ Changed npm:mmdb-lib and npm:buffer to esm.sh URL imports; moved Buffer to static import │
  ├──────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┤
  │ view/index.ts                │ Changed npm:ua-parser-js@2 to https://esm.sh/ua-parser-js@2                              │
  ├──────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┤
  │ scripts/deploy/functions.sh  │ Removed --use-api flag; deploy now uses Docker for local bundling                        │
  └──────────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────┘
  Result: Function deployed successfully as version 198 (ACTIVE). Bundle size: 3.254MB.

  Sources:
  - https://supabase.com/docs/guides/troubleshooting/edge-function-fails-deploy
  - https://github.com/supabase/cli/issues/2837
  - https://github.com/orgs/supabase/discussions/36109