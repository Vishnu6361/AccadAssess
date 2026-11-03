-- ==============================================================================
-- Migration: 20261012000006_function_permissions_hardening.sql
-- Project: AcadAssess — Academic Assessment Creation, Submission, Evaluation & Marks Management Portal
-- Description: Revoke default PUBLIC and anon execution privileges on sensitive 
--              SECURITY DEFINER functions to eliminate unauthorized PostgREST RPC exposure.
-- Specification: 05_Backend_Schema_Supabase_Formative_Assessment.pdf (Section 10)
-- ==============================================================================

-- 1. Helper Security Functions (Used in RLS Policies)
-- Must be executable by authenticated users for RLS policy evaluation,
-- but strictly forbidden for unauthenticated anon callers.
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

revoke execute on function public.is_hod(uuid) from public, anon;
grant execute on function public.is_hod(uuid) to authenticated, service_role;

revoke execute on function public.is_active_user(uuid) from public, anon;
grant execute on function public.is_active_user(uuid) to authenticated, service_role;

-- 2. Assessment Publication Action
-- Guarded internally by teacher/HOD authorization check.
-- Unauthenticated anon execution revoked completely.
revoke execute on function public.publish_assessment(uuid) from public, anon;
grant execute on function public.publish_assessment(uuid) to authenticated, service_role;

-- 3. Submission Finalization Action
-- Guarded internally by active student enrollment check and deadline check.
-- Unauthenticated anon execution revoked completely.
revoke execute on function public.finalize_submission(uuid, uuid, text, text, text, integer, text) from public, anon;
grant execute on function public.finalize_submission(uuid, uuid, text, text, text, integer, text) to authenticated, service_role;

-- 4. Platform Event Trigger Hardening
-- Revoke execution from API consumers if rls_auto_enable exists in public schema.
do $$ begin
  if exists (
    select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
