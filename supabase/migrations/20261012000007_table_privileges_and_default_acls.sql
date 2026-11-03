-- ==============================================================================
-- Migration: 20261012000007_table_privileges_and_default_acls.sql
-- Description: Least-privilege table and sequence access for service_role and
--              authenticated users, with explicit default ACLs for role postgres.
--              Preserves function hardening from migration 6.
-- Reference: PostgreSQL 42501 (permission denied for table profiles)
-- ==============================================================================

-- 1. Ensure schema usage for authenticated and service_role
grant usage on schema public to authenticated, service_role;

-- 2. Revoke table and sequence data privileges from anon (Defense-in-depth)
revoke select, insert, update, delete, truncate, references, trigger 
  on all tables in schema public 
  from anon;

revoke usage, select, update 
  on all sequences in schema public 
  from anon;

-- 3. Grant application table and sequence privileges to service_role (Trusted backend API)
-- service_role has BYPASSRLS in Supabase, but requires standard table privileges in PostgreSQL.
grant all privileges 
  on all tables in schema public 
  to service_role;

grant all privileges 
  on all sequences in schema public 
  to service_role;

-- 4. Grant least-privilege table access to authenticated users
-- All operations below remain strictly governed and filtered by Row-Level Security (RLS) policies.

-- 4a. Academic Structure, Curriculum, Authoring & Roles (Managed by HOD & Subject Teachers)
grant select, insert, update, delete 
  on public.departments,
     public.user_roles,
     public.academic_terms,
     public.classes,
     public.subjects,
     public.class_subjects,
     public.enrollments,
     public.proctor_assignments,
     public.assessments,
     public.questions,
     public.rubric_templates,
     public.rubric_versions,
     public.rubric_criteria,
     public.rubric_levels
  to authenticated;

-- 4b. User Profiles: Read and update only (Profiles created via server/auth triggers; deletion disallowed)
grant select, update 
  on public.profiles 
  to authenticated;

-- 4c. Submissions & Submission Versions: Read and submit only (Direct client update and deletion disallowed)
grant select, insert 
  on public.submissions,
     public.submission_versions
  to authenticated;

-- 4d. Audit Trail: Strictly append-only
grant select, insert 
  on public.audit_events 
  to authenticated;

revoke update, delete, truncate 
  on public.audit_events 
  from authenticated, anon;

-- 5. Grant sequence usage to authenticated for any future serial/identity sequences
grant usage, select 
  on all sequences in schema public 
  to authenticated;

-- 6. Configure Default Privileges for role 'postgres' (the migration author role)
-- Ensures that future tables and sequences created by migrations inherit correct grants.
alter default privileges for role postgres in schema public 
  grant all on tables to service_role;

alter default privileges for role postgres in schema public 
  grant usage, select on sequences to service_role, authenticated;
