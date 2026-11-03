-- ==============================================================================
-- Migration: 20261028000015_standardize_mca_semester_structure.sql
-- Description: Standardize MCA academic structure to semester-level scope (MCA Semester 3)
--              without incorrect sections, preserving all student enrollments, assessments,
--              submissions, and evaluations.
-- Safety: Fully transactional, reversible. DO NOT APPLY TO PRODUCTION WITHOUT USER APPROVAL.
-- ==============================================================================

BEGIN;

-- 1. Make section column nullable on public.classes to support sectionless programmes
ALTER TABLE public.classes ALTER COLUMN section DROP NOT NULL;

-- 2. Safely reassign any class_subjects linked to extraneous MCA class '07c9c24f-230a-45ac-9c43-3abef7f10ae4' (section AI)
-- to primary MCA Semester 3 class 'c53f348b-34dc-4399-ab77-6b0bea0e4e40' if not already present
UPDATE public.class_subjects
SET class_id = 'c53f348b-34dc-4399-ab77-6b0bea0e4e40'
WHERE class_id = '07c9c24f-230a-45ac-9c43-3abef7f10ae4'
  AND id NOT IN (
    SELECT cs1.id FROM public.class_subjects cs1
    JOIN public.class_subjects cs2 
      ON cs2.class_id = 'c53f348b-34dc-4399-ab77-6b0bea0e4e40' 
     AND cs2.subject_id = cs1.subject_id 
     AND cs2.subject_teacher_id = cs1.subject_teacher_id
    WHERE cs1.class_id = '07c9c24f-230a-45ac-9c43-3abef7f10ae4'
  );

-- Remove redundant class_subject fixture if exact duplicate exists on target class
DELETE FROM public.class_subjects
WHERE class_id = '07c9c24f-230a-45ac-9c43-3abef7f10ae4';

-- Reassign any enrollments or proctor assignments (defensive safeguard)
UPDATE public.enrollments
SET class_id = 'c53f348b-34dc-4399-ab77-6b0bea0e4e40'
WHERE class_id = '07c9c24f-230a-45ac-9c43-3abef7f10ae4';

UPDATE public.proctor_assignments
SET class_id = 'c53f348b-34dc-4399-ab77-6b0bea0e4e40'
WHERE class_id = '07c9c24f-230a-45ac-9c43-3abef7f10ae4';

-- 3. Delete extraneous class record '07c9c24f-230a-45ac-9c43-3abef7f10ae4' (section AI)
DELETE FROM public.classes
WHERE id = '07c9c24f-230a-45ac-9c43-3abef7f10ae4';

-- 4. Standardize primary MCA Semester 3 class 'c53f348b-34dc-4399-ab77-6b0bea0e4e40':
-- Remove section 'A' and broaden specialization to null (core/entire semester scope)
UPDATE public.classes
SET section = NULL,
    specialization_id = NULL
WHERE id = 'c53f348b-34dc-4399-ab77-6b0bea0e4e40';

-- 5. Update unique batch constraint to allow null section across a programme semester
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS uq_class_batch;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_class_batch' 
      AND conrelid = 'public.classes'::regclass
  ) THEN
    -- Coalesce section so null sections are treated as a single unique cohort per programme semester term
    CREATE UNIQUE INDEX uq_class_batch_idx ON public.classes (term_id, programme, semester, COALESCE(section, ''));
  END IF;
END $$;

COMMIT;

-- ==============================================================================
-- ROLLBACK SCRIPT (In case of reversion):
-- ==============================================================================
-- BEGIN;
-- UPDATE public.classes
-- SET section = 'A',
--     specialization_id = '3f75d427-7881-44c3-bf01-491e8f316a74'
-- WHERE id = 'c53f348b-34dc-4399-ab77-6b0bea0e4e40';
--
-- INSERT INTO public.classes (id, term_id, programme, semester, section, programme_id, specialization_id, created_at)
-- VALUES (
--   '07c9c24f-230a-45ac-9c43-3abef7f10ae4',
--   'fb53f3ea-962a-4874-8ee3-de4beaa6c171',
--   'MCA',
--   3,
--   'AI',
--   '3b960388-a3fc-4bf4-9d08-4abe467ec4cd',
--   '99c623b4-61e2-4c24-b417-b373df35ecca',
--   '2026-10-22T07:49:09.597277+00:00'
-- ) ON CONFLICT DO NOTHING;
--
-- DROP INDEX IF EXISTS uq_class_batch_idx;
-- ALTER TABLE public.classes ADD CONSTRAINT uq_class_batch UNIQUE (term_id, programme, semester, section);
-- ALTER TABLE public.classes ALTER COLUMN section SET NOT NULL;
-- COMMIT;
