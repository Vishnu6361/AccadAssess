-- ==============================================================================
-- Migration: 20261022000012_evaluations_rls_and_storage_policies.sql
-- Description: Least-privilege RLS policies, table grants, and updated storage
--              policies for evaluations, result publications, and late submissions.
-- ==============================================================================

-- 1. Table Grants for authenticated and service_role
grant select, insert, update on public.evaluations to authenticated, service_role;
grant select, insert, update on public.evaluation_criterion_scores to authenticated, service_role;
grant select, insert on public.result_publications to authenticated, service_role;

-- 2. Enable RLS explicitly (defense-in-depth)
alter table if exists public.evaluations enable row level security;
alter table if exists public.evaluation_criterion_scores enable row level security;
alter table if exists public.result_publications enable row level security;

-- 3. Evaluations RLS Policies
drop policy if exists "HOD can view all evaluations" on public.evaluations;
create policy "HOD can view all evaluations"
  on public.evaluations for select
  to authenticated
  using (public.is_hod(auth.uid()));

drop policy if exists "Subject teachers can view evaluations for their assessments" on public.evaluations;
create policy "Subject teachers can view evaluations for their assessments"
  on public.evaluations for select
  to authenticated
  using (
    exists (
      select 1 from public.submissions s
      inner join public.assessments a on a.id = s.assessment_id
      inner join public.class_subjects cs on cs.id = a.class_subject_id
      where s.id = evaluations.submission_id
        and cs.subject_teacher_id = auth.uid()
        and cs.active = true
    )
  );

drop policy if exists "Subject teachers can insert or update evaluations for their assessments" on public.evaluations;
create policy "Subject teachers can insert or update evaluations for their assessments"
  on public.evaluations for all
  to authenticated
  using (
    public.is_hod(auth.uid())
    or exists (
      select 1 from public.submissions s
      inner join public.assessments a on a.id = s.assessment_id
      inner join public.class_subjects cs on cs.id = a.class_subject_id
      where s.id = evaluations.submission_id
        and cs.subject_teacher_id = auth.uid()
        and cs.active = true
    )
  );

drop policy if exists "Students can view published evaluations for their submissions" on public.evaluations;
create policy "Students can view published evaluations for their submissions"
  on public.evaluations for select
  to authenticated
  using (
    evaluations.status = 'published'
    and exists (
      select 1 from public.submissions s
      where s.id = evaluations.submission_id
        and s.student_id = auth.uid()
    )
  );

-- 4. Evaluation Criterion Scores RLS Policies
drop policy if exists "Evaluation criterion scores follow evaluation view access" on public.evaluation_criterion_scores;
create policy "Evaluation criterion scores follow evaluation view access"
  on public.evaluation_criterion_scores for select
  to authenticated
  using (
    exists (
      select 1 from public.evaluations e
      where e.id = evaluation_criterion_scores.evaluation_id
    )
  );

drop policy if exists "Teachers and HOD can manage evaluation criterion scores" on public.evaluation_criterion_scores;
create policy "Teachers and HOD can manage evaluation criterion scores"
  on public.evaluation_criterion_scores for all
  to authenticated
  using (
    public.is_hod(auth.uid())
    or exists (
      select 1 from public.evaluations e
      inner join public.submissions s on s.id = e.submission_id
      inner join public.assessments a on a.id = s.assessment_id
      inner join public.class_subjects cs on cs.id = a.class_subject_id
      where e.id = evaluation_criterion_scores.evaluation_id
        and cs.subject_teacher_id = auth.uid()
        and cs.active = true
    )
  );

-- 5. Result Publications RLS Policies
drop policy if exists "Authenticated users can view result publications" on public.result_publications;
create policy "Authenticated users can view result publications"
  on public.result_publications for select
  to authenticated
  using (true);

drop policy if exists "Subject teachers and HOD can publish results" on public.result_publications;
create policy "Subject teachers and HOD can publish results"
  on public.result_publications for insert
  to authenticated
  with check (
    public.is_hod(auth.uid())
    or exists (
      select 1 from public.assessments a
      inner join public.class_subjects cs on cs.id = a.class_subject_id
      where a.id = result_publications.assessment_id
        and cs.subject_teacher_id = auth.uid()
        and cs.active = true
    )
  );

-- 6. Updated Storage Policies for PDF Assignments and Late Multi-File Submissions
drop policy if exists "Teachers can upload assignment document PDFs" on storage.objects;
create policy "Teachers can upload assignment document PDFs"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'submissions-private'
    and (storage.foldername(name))[1] = 'assessments'
    and (storage.foldername(name))[3] = 'documents'
    and (
      public.is_hod(auth.uid())
      or exists (
        select 1 from public.assessments a
        inner join public.class_subjects cs on cs.id = a.class_subject_id
        where a.id::text = (storage.foldername(name))[2]
          and cs.subject_teacher_id = auth.uid()
          and cs.active = true
      )
    )
  );

drop policy if exists "Enrolled students can upload submission answers before deadline" on storage.objects;
create policy "Enrolled students can upload submission answers before deadline"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'submissions-private'
    and (
      (storage.foldername(name))[6] = auth.uid()::text
      or (storage.foldername(name))[4] = auth.uid()::text
      or (storage.foldername(name))[3] = auth.uid()::text
    )
    and exists (
      select 1 from public.assessments a
      inner join public.class_subjects cs on cs.id = a.class_subject_id
      inner join public.enrollments e on e.class_id = cs.class_id
      where (
        a.id::text = (storage.foldername(name))[2]
        or a.id::text = (storage.foldername(name))[1]
      )
        and a.status = 'published'
        and (
          a.deadline_at > now()
          or (coalesce(a.allow_late, false) = true and a.extension_deadline_at > now())
        )
        and e.student_id = auth.uid()
        and e.status = 'active'
    )
  );
