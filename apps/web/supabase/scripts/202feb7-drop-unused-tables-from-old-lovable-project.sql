-- ============================================================================
-- DROP UNUSED SUPABASE TABLES
-- ============================================================================
-- Run this script in the Supabase SQL Editor to remove legacy tables.
--
-- After migrating to Rails 8 (SQLite as source of truth), most Supabase
-- tables are no longer used. Only 2 tables remain active:
--   - projects_new  (edge function project validation, synced from Rails)
--   - system_config  (daily rotating salt for session hashing)
--
-- The "view" edge function is the only active Supabase function.
-- Bot detection uses static JSON files (bot-sources.json).
-- Geo-detection uses a bundled MMDB file (dbip-country-lite.mmdb).
-- ============================================================================

BEGIN;

-- ========================================
-- 1. Drop VIEWS first (depend on tables)
-- ========================================
DROP VIEW IF EXISTS public.public_projects CASCADE;
DROP VIEW IF EXISTS public.visibility_checks_latest CASCADE;
DROP VIEW IF EXISTS public.visibility_checks_recent CASCADE;

-- ========================================
-- 2. Drop database FUNCTIONS
-- ========================================
DROP FUNCTION IF EXISTS public.get_bot_by_ip(text);
DROP FUNCTION IF EXISTS public.find_country_by_ip(text);

-- ========================================
-- 3. Drop unused TABLES
-- ========================================

-- Legacy tables from pre-Rails era (no code references)
DROP TABLE IF EXISTS public.aicw_brand_rankings CASCADE;
DROP TABLE IF EXISTS public.aicw_categories CASCADE;
DROP TABLE IF EXISTS public.aicw_domain_rankings CASCADE;
DROP TABLE IF EXISTS public.analytics_cache CASCADE;
DROP TABLE IF EXISTS public.project_todos CASCADE;

-- Tables replaced by Rails SQLite (Rails is source of truth)
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.subscription_plans CASCADE;
DROP TABLE IF EXISTS public.project_websites CASCADE;
DROP TABLE IF EXISTS public.project_ranking_configs CASCADE;
DROP TABLE IF EXISTS public.visibility_checks CASCADE;
DROP TABLE IF EXISTS public.website_deployments CASCADE;

-- Tables replaced by static files / bundled data
DROP TABLE IF EXISTS public.ip_to_bot CASCADE;
DROP TABLE IF EXISTS public.ip_to_country_ranges CASCADE;

-- Unused billing table (code is commented out in view function)
DROP TABLE IF EXISTS public.monthly_view_usage CASCADE;

COMMIT;

-- ========================================
-- Verify: only these should remain
-- ========================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
-- ORDER BY table_name;
--
-- Expected result:
--   projects_new
--   system_config
