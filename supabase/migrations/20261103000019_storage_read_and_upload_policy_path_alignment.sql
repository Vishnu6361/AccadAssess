-- ==============================================================================
-- Migration: 20261103000019_storage_read_and_upload_policy_path_alignment.sql
-- Description: Forward migration to align storage.objects read policies for both
--              flat and nested assessment paths (assessments/{id}/questions/{qid}/students/{sid}/...).
-- ==============================================================================

-- 1. Storage RLS: SELECT (download/read PDF)
-- Ensures students, assigned teachers, and HODs can read private submission PDFs
-- regardless of folder depth hierarchy.
drop policy if exists "Authorized users can read private submission PDFs" on storage.objects;
create policy "Authorized users can read private submission PDFs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'submissions-private'
    and (
      -- Student owner: matches student UUID in scoped path hierarchy
      -- Nested path: assessments/{assId}/questions/{qId}/students/{studentId}/... (index 6)
      -- Flat path:   {assId}/{qId}/{studentId}/... (index 3 or 4)
      (storage.foldername(name))[6] = auth.uid()::text
      or (storage.foldername(name))[4] = auth.uid()::text
      or (storage.foldername(name))[3] = auth.uid()::text
      -- Or assigned subject teacher for assessment
      or exists (
        select 1 from public.assessments a
        inner join public.class_subjects cs on cs.id = a.class_subject_id
        where (
          a.id::text = (storage.foldername(name))[2]
          or a.id::text = (storage.foldername(name))[1]
        )
          and cs.subject_teacher_id = auth.uid()
          and cs.active = true
      )
      -- Or HOD
      or public.is_hod(auth.uid())
    )
  );

