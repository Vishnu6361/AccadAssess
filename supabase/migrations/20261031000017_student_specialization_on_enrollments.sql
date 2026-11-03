-- ==============================================================================
-- Migration: 20261031000017_student_specialization_on_enrollments.sql
-- Description: Decouple student specialization from class cohorts.
--              Stores specialization_id directly on public.enrollments so that
--              students in a common cohort (e.g. MCA Semester 3) retain their
--              specialization independently of classes.specialization_id.
-- ==============================================================================

BEGIN;

-- 1. Add specialization_id column to public.enrollments
ALTER TABLE public.enrollments 
  ADD COLUMN IF NOT EXISTS specialization_id uuid NULL REFERENCES public.specializations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_enrollments_student_spec 
  ON public.enrollments(student_id, specialization_id);

CREATE INDEX IF NOT EXISTS idx_enrollments_spec_class 
  ON public.enrollments(class_id, specialization_id);

-- 2. Authoritatively preserve VISHNU C N's original Security specialization
UPDATE public.enrollments
SET specialization_id = '3f75d427-7881-44c3-bf01-491e8f316a74'
WHERE student_id = '3acf60f9-3f03-406d-8f1e-6ac01ae36f14'
  AND class_id = 'c53f348b-34dc-4399-ab77-6b0bea0e4e40';

-- 3. Record migration
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261031000017', 'student_specialization_on_enrollments')
ON CONFLICT (version) DO NOTHING;

COMMIT;

