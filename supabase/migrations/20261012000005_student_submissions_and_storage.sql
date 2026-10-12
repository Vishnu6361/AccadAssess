-- ==============================================================================
-- Migration: 20261012000005_student_submissions_and_storage.sql
-- Description: Submissions, Submission Versions, Storage Bucket, and RLS Policies.
-- Specification: 05_Backend_Schema_Supabase_Formative_Assessment.pdf (Section 5, 8, 9, 10)
-- ==============================================================================

-- 1. Submissions Table (Question-level student submission header)
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  active_version_id uuid null,
  status submission_status not null default 'uploaded',
  first_submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_submissions_question_student unique (question_id, student_id)
);

create index if not exists idx_submissions_assessment_status 
  on public.submissions(assessment_id, status);
create index if not exists idx_submissions_student 
  on public.submissions(student_id);
create index if not exists idx_submissions_question 
  on public.submissions(question_id);

-- 2. Submission Versions Table (Immutable historical submission versions & PDF metadata)
create table if not exists public.submission_versions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type = 'application/pdf'),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880), -- 5 MB max
  sha256 char(64) not null,
  uploaded_at timestamptz not null default now(),
  superseded_at timestamptz null,
  constraint uq_submission_version unique (submission_id, version)
);

create index if not exists idx_submission_versions_sub 
  on public.submission_versions(submission_id, version desc);
create index if not exists idx_submission_versions_storage 
  on public.submission_versions(storage_path);

-- Foreign Key: Submissions.active_version_id references Submission_versions.id
alter table public.submissions
  add constraint fk_submissions_active_version
  foreign key (active_version_id)
  references public.submission_versions(id)
  on delete set null;

-- ------------------------------------------------------------------------------
-- Enable Row-Level Security
-- ------------------------------------------------------------------------------
alter table public.submissions enable row level security;
alter table public.submission_versions enable row level security;

-- ------------------------------------------------------------------------------
-- RLS Policies: submissions
-- ------------------------------------------------------------------------------

-- Students can read own submissions
create policy "Students can view own submissions"
  on public.submissions for select
  to authenticated
  using (student_id = auth.uid());

-- Students can insert submissions if enrolled in class, assessment is published, and deadline has not passed
create policy "Students can insert own submissions before deadline"
  on public.submissions for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.assessments a
      inner join public.class_subjects cs on cs.id = a.class_subject_id
      inner join public.enrollments e on e.class_id = cs.class_id
      where a.id = public.submissions.assessment_id
        and a.status = 'published'
        and a.deadline_at > now()
        and e.student_id = auth.uid()
        and e.status = 'active'
    )
    and exists (
      select 1 from public.questions q
      where q.id = public.submissions.question_id
        and q.assessment_id = public.submissions.assessment_id
    )
  );

-- Teachers can view submissions for their assigned subjects
create policy "Teachers can view assigned subject submissions"
  on public.submissions for select
  to authenticated
  using (
    exists (
      select 1 from public.assessments a
      inner join public.class_subjects cs on cs.id = a.class_subject_id
      where a.id = public.submissions.assessment_id
        and cs.subject_teacher_id = auth.uid()
        and cs.active = true
    )
  );

-- HOD can view all department submissions
create policy "HOD can view all department submissions"
  on public.submissions for select
  to authenticated
  using (public.is_hod(auth.uid()));

-- ------------------------------------------------------------------------------
-- RLS Policies: submission_versions
-- ------------------------------------------------------------------------------

-- Students can read versions of own submissions
create policy "Students can view own submission versions"
  on public.submission_versions for select
  to authenticated
  using (
    exists (
      select 1 from public.submissions s
      where s.id = public.submission_versions.submission_id
        and s.student_id = auth.uid()
    )
  );

-- Teachers can read submission versions for their assigned subjects
create policy "Teachers can view assigned submission versions"
  on public.submission_versions for select
  to authenticated
  using (
    exists (
      select 1 from public.submissions s
      inner join public.assessments a on a.id = s.assessment_id
      inner join public.class_subjects cs on cs.id = a.class_subject_id
      where s.id = public.submission_versions.submission_id
        and cs.subject_teacher_id = auth.uid()
        and cs.active = true
    )
  );

-- HOD can view all submission versions
create policy "HOD can view all submission versions"
  on public.submission_versions for select
  to authenticated
  using (public.is_hod(auth.uid()));

-- Prevent client update / delete on submission_versions (immutable history!)
-- No UPDATE or DELETE policies granted to normal authenticated users.

-- ------------------------------------------------------------------------------
-- Supabase Storage: submissions-private Bucket
-- Specification 05, Section 9: Storage Policies
-- ------------------------------------------------------------------------------

-- Create private bucket if not exists
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submissions-private', 
  'submissions-private', 
  false, 
  5242880, 
  array['application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf'];

-- Storage RLS: SELECT (download/read PDF)
-- Owner student, assigned teacher, or HOD can select objects
create policy "Authorized users can read private submission PDFs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'submissions-private'
    and (
      -- Student owner: object path contains their user UUID
      (storage.foldername(name))[4] = auth.uid()::text
      -- Or assigned subject teacher for assessment
      or exists (
        select 1 from public.assessments a
        inner join public.class_subjects cs on cs.id = a.class_subject_id
        where a.id::text = (storage.foldername(name))[1]
          and cs.subject_teacher_id = auth.uid()
          and cs.active = true
      )
      -- Or HOD
      or public.is_hod(auth.uid())
    )
  );

-- Storage RLS: INSERT (upload PDF)
create policy "Enrolled students can upload submission PDFs before deadline"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'submissions-private'
    and (storage.foldername(name))[4] = auth.uid()::text
    and exists (
      select 1 from public.assessments a
      inner join public.class_subjects cs on cs.id = a.class_subject_id
      inner join public.enrollments e on e.class_id = cs.class_id
      where a.id::text = (storage.foldername(name))[1]
        and a.status = 'published'
        and a.deadline_at > now()
        and e.student_id = auth.uid()
        and e.status = 'active'
    )
  );

-- Storage RLS: Disallow UPDATE and DELETE for students
-- Deletions are exclusively managed by administrative retention jobs.

-- ------------------------------------------------------------------------------
-- Transactional Submission Finalization Function
-- Specification 05, Section 10: Trusted Operations
-- ------------------------------------------------------------------------------
create or replace function public.finalize_submission(
  p_assessment_id uuid,
  p_question_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes integer,
  p_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assessment public.assessments%rowtype;
  v_question public.questions%rowtype;
  v_submission public.submissions%rowtype;
  v_new_version_id uuid := gen_random_uuid();
  v_version_number integer := 1;
  v_now timestamptz := now();
  v_is_resubmission boolean := false;
begin
  -- 1. Validate assessment exists and is published
  select * into v_assessment
  from public.assessments
  where id = p_assessment_id;

  if not found then
    raise exception 'Assessment not found';
  end if;

  if v_assessment.status <> 'published' then
    raise exception 'ASSESSMENT_NOT_OPEN: Submissions are only allowed for published assessments (status: %)', v_assessment.status;
  end if;

  -- 2. Validate deadline has not passed
  if v_assessment.deadline_at <= v_now then
    raise exception 'DEADLINE_PASSED: Submissions for this assessment closed at %', v_assessment.deadline_at;
  end if;

  -- 3. Validate question exists and belongs to assessment
  select * into v_question
  from public.questions
  where id = p_question_id and assessment_id = p_assessment_id;

  if not found then
    raise exception 'INVALID_QUESTION: Question % does not belong to assessment %', p_question_id, p_assessment_id;
  end if;

  -- 4. Validate caller active enrollment
  if not exists (
    select 1 from public.class_subjects cs
    inner join public.enrollments e on e.class_id = cs.class_id
    where cs.id = v_assessment.class_subject_id
      and e.student_id = auth.uid()
      and e.status = 'active'
  ) then
    raise exception 'NOT_ENROLLED: Student is not actively enrolled in the class for this assessment';
  end if;

  -- 5. Validate file constraints
  if p_mime_type <> 'application/pdf' then
    raise exception 'INVALID_FILE_TYPE: Only application/pdf files are accepted';
  end if;

  if p_size_bytes <= 0 or p_size_bytes > 5242880 then
    raise exception 'FILE_SIZE_EXCEEDED: PDF file size must be between 1 byte and 5 MB (5,242,880 bytes)';
  end if;

  if length(p_sha256) <> 64 then
    raise exception 'INVALID_HASH: SHA-256 hash must be exactly 64 hexadecimal characters';
  end if;

  -- 6. Check existing submission for (question_id, student_id)
  select * into v_submission
  from public.submissions
  where question_id = p_question_id and student_id = auth.uid()
  for update;

  if found then
    v_is_resubmission := true;
    -- Determine next version number
    select coalesce(max(version), 0) + 1 into v_version_number
    from public.submission_versions
    where submission_id = v_submission.id;

    -- Mark previous active version as superseded
    update public.submission_versions
    set superseded_at = v_now
    where submission_id = v_submission.id and superseded_at is null;
  else
    -- Create new submission header
    insert into public.submissions (
      assessment_id,
      question_id,
      student_id,
      status,
      first_submitted_at,
      updated_at
    ) values (
      p_assessment_id,
      p_question_id,
      auth.uid(),
      'uploaded',
      v_now,
      v_now
    )
    returning * into v_submission;
  end if;

  -- 7. Insert new submission_version record
  insert into public.submission_versions (
    id,
    submission_id,
    version,
    storage_path,
    original_name,
    mime_type,
    size_bytes,
    sha256,
    uploaded_at,
    superseded_at
  ) values (
    v_new_version_id,
    v_submission.id,
    v_version_number,
    p_storage_path,
    p_original_name,
    p_mime_type,
    p_size_bytes,
    p_sha256,
    v_now,
    null
  );

  -- 8. Update submission active version pointer and status
  update public.submissions
  set active_version_id = v_new_version_id,
      status = 'uploaded',
      updated_at = v_now
  where id = v_submission.id;

  -- 9. Insert audit log event
  insert into public.audit_events (
    actor_id,
    action,
    resource_type,
    resource_id,
    after
  ) values (
    auth.uid(),
    case when v_is_resubmission then 'RESUBMIT_ANSWER' else 'SUBMIT_ANSWER' end,
    'submissions',
    v_submission.id,
    jsonb_build_object(
      'assessment_id', p_assessment_id,
      'question_id', p_question_id,
      'version', v_version_number,
      'sha256', p_sha256,
      'size_bytes', p_size_bytes,
      'storage_path', p_storage_path
    )
  );

  -- Return submission receipt
  return jsonb_build_object(
    'submission_id', v_submission.id,
    'version_id', v_new_version_id,
    'version', v_version_number,
    'status', 'uploaded',
    'sha256', p_sha256,
    'size_bytes', p_size_bytes,
    'uploaded_at', v_now,
    'is_resubmission', v_is_resubmission
  );
end;
$$;
