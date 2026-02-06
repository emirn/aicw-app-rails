-- ============================================================================
-- Migration: Simplify Projects Table for Edge Function
-- ============================================================================
-- This migration creates a new minimal projects table that:
-- 1. Is used ONLY by the edge function for project validation
-- 2. Is synced from Rails (source of truth) via background jobs
-- 3. Has NO RLS (edge function uses service role key)
-- 4. Contains only the fields needed for analytics validation
--
-- After this migration is verified working, old tables can be dropped.
-- ============================================================================

-- Create new simplified projects table (alongside existing)
CREATE TABLE IF NOT EXISTS public.projects_new (
  tracking_id UUID PRIMARY KEY,
  domain TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  rails_project_id TEXT,  -- Reference to Rails project ID (for debugging)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for domain lookups (used in domain validation)
CREATE INDEX IF NOT EXISTS idx_projects_new_domain ON public.projects_new(domain);

-- Index for active status filtering
CREATE INDEX IF NOT EXISTS idx_projects_new_is_active ON public.projects_new(is_active);

-- NO RLS - edge function uses service role key
-- This is a simple lookup table, not user-facing

-- Add comment to document the table purpose
COMMENT ON TABLE public.projects_new IS 'Minimal projects table for edge function validation. Synced from Rails.';
COMMENT ON COLUMN public.projects_new.tracking_id IS 'UUID used in tracking script (data_key parameter)';
COMMENT ON COLUMN public.projects_new.domain IS 'Allowed domain for this project';
COMMENT ON COLUMN public.projects_new.is_active IS 'Whether analytics tracking is enabled (based on subscription status in Rails)';
COMMENT ON COLUMN public.projects_new.rails_project_id IS 'Reference to Rails project ID for debugging';

-- Create trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_projects_new_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_new_updated_at
  BEFORE UPDATE ON public.projects_new
  FOR EACH ROW
  EXECUTE FUNCTION public.update_projects_new_updated_at();

-- ============================================================================
-- Data Migration: Copy existing projects to new table
-- ============================================================================
-- This migrates existing data so the new edge function can work immediately.
-- Rails will sync going forward.
-- ============================================================================

INSERT INTO public.projects_new (tracking_id, domain, is_active, rails_project_id, created_at, updated_at)
SELECT
  tracking_id::uuid,
  domain,
  true,  -- Default to active for existing projects
  id::text,  -- Store old project ID for reference
  created_at,
  updated_at
FROM public.projects
ON CONFLICT (tracking_id) DO NOTHING;
