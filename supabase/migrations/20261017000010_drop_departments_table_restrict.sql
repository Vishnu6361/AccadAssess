-- ==============================================================================
-- Migration: 20261017000010_drop_departments_table_restrict.sql
-- Description: Drop public.departments using RESTRICT (explicit dependency removal).
-- Safety: Fails safe if any dependent objects still reference public.departments.
-- ==============================================================================

-- 1. Explicitly ensure dependent policies are dropped
drop policy if exists "Active users can view departments" on public.departments;
drop policy if exists "HOD can manage departments" on public.departments;

-- 2. Explicitly ensure foreign key constraints on referencing tables are dropped
alter table if exists public.classes drop constraint if exists classes_department_id_fkey;
alter table if exists public.subjects drop constraint if exists subjects_department_id_fkey;
alter table if exists public.programmes drop constraint if exists programmes_department_id_fkey;

-- 3. Safely drop departments table with RESTRICT (never broad CASCADE)
-- RESTRICT guarantees PostgreSQL will abort if any unhandled dependent object exists.
drop table if exists public.departments restrict;
