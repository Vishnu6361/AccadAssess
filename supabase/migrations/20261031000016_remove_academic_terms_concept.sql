-- ==============================================================================
-- Migration: 20261031000016_remove_academic_terms_concept.sql
-- Description: Complete removal of Academic Terms & Semesters concept from AcadAssess schema.
--              Academic organization is now governed directly by Programmes,
--              Specializations, and Semesters (e.g. MCA Semester 1-4).
-- Safety: Preserves all existing classes, subjects, enrollments, assessments,
--         submissions, and evaluations. Reversible.
-- ==============================================================================

BEGIN;

-- 1. Make term_id nullable on public.classes to eliminate term dependency
ALTER TABLE public.classes ALTER COLUMN term_id DROP NOT NULL;

-- 2. Drop unique constraint or index on public.classes that required term_id
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS uq_class_batch;
DROP INDEX IF EXISTS public.uq_class_batch_idx;

-- 3. Create unique index for class batches based on programme, semester, and section (supporting null sections)
DROP INDEX IF EXISTS public.uq_class_batch_no_term;
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_batch_no_term 
  ON public.classes (programme, semester, COALESCE(section, ''));

-- 4. Drop term-dependent indexes if any exist
DROP INDEX IF EXISTS public.idx_classes_department;
CREATE INDEX IF NOT EXISTS idx_classes_prog_sem ON public.classes(programme, semester);

COMMIT;
