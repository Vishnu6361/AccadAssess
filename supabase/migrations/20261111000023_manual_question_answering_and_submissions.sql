-- ==============================================================================
-- Migration: 20261111000023_manual_question_answering_and_submissions.sql
-- Description: Supports manual question answering, text-only and hybrid submissions,
--              student draft saving, version history preservation, and deadline enforcement.
-- ==============================================================================

-- 1. Extend submission_versions table for text answers and optional file uploads
alter table if exists public.submission_versions
  add column if not exists answers jsonb not null default '[]'::jsonb;

-- Allow storage_path, original_name, mime_type, sha256 to be nullable for text-only submissions
alter table if exists public.submission_versions
  alter column storage_path drop not null,
  alter column original_name drop not null,
  alter column mime_type drop not null,
  alter column sha256 drop not null;

-- Update size_bytes check constraint to allow 0 bytes for text-only submissions
alter table if exists public.submission_versions
  drop constraint if exists submission_versions_size_bytes_check;

alter table if exists public.submission_versions
  add constraint submission_versions_size_bytes_check
  check (size_bytes >= 0 and size_bytes <= 26214400);

alter table if exists public.submission_versions
  alter column size_bytes set default 0;

-- 2. Create student_submission_drafts table for autosaving and explicit draft saves
-- Dedicated table guarantees drafts never pollute submissions count or academic records
create table if not exists public.student_submission_drafts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_student_submission_draft unique (assessment_id, student_id)
);

create index if not exists idx_student_submission_drafts_lookup
  on public.student_submission_drafts(assessment_id, student_id);

-- Enable RLS on student_submission_drafts
alter table public.student_submission_drafts enable row level security;

-- RLS Policies: Students can only view and manage their own drafts
drop policy if exists "Students can view own drafts" on public.student_submission_drafts;
create policy "Students can view own drafts"
  on public.student_submission_drafts for select
  using (auth.uid() = student_id);

drop policy if exists "Students can insert own drafts" on public.student_submission_drafts;
create policy "Students can insert own drafts"
  on public.student_submission_drafts for insert
  with check (auth.uid() = student_id);

drop policy if exists "Students can update own drafts" on public.student_submission_drafts;
create policy "Students can update own drafts"
  on public.student_submission_drafts for update
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

drop policy if exists "Students can delete own drafts" on public.student_submission_drafts;
create policy "Students can delete own drafts"
  on public.student_submission_drafts for delete
  using (auth.uid() = student_id);

grant all on public.student_submission_drafts to authenticated, service_role;

-- 3. Update create_submission_atomic RPC with text answers, optional files, and authoritative server-time deadline verification
create or replace function public.create_submission_atomic(
  p_assessment_id uuid,
  p_student_id uuid,
  p_submission_id uuid,
  p_version_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha256 text,
  p_files jsonb,
  p_submitted_at timestamptz,
  p_late_status text,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_server_now timestamptz := now();
  v_assessment_status text;
  v_deadline_at timestamptz;
  v_allow_late boolean;
  v_extension_deadline_at timestamptz;
  v_submission_id uuid;
  v_version_number int;
  v_is_resubmission boolean;
  v_active_version_id uuid;
  v_actual_late_status text;
begin
  -- Caller verification: authenticated caller must match p_student_id
  if v_auth_uid is not null and v_auth_uid <> p_student_id then
    raise exception 'Caller % cannot submit on behalf of student %', v_auth_uid, p_student_id
      using errcode = '42501';
  end if;

  -- Level 1 Lock on assessments (FOR SHARE allows concurrent submissions, blocks publication FOR UPDATE)
  select status, deadline_at, allow_late, extension_deadline_at
  into v_assessment_status, v_deadline_at, v_allow_late, v_extension_deadline_at
  from public.assessments
  where id = p_assessment_id
  for share;

  if not found then
    raise exception 'Assessment % not found', p_assessment_id using errcode = 'P0002';
  end if;

  -- Prevent submission if results have already been published
  if exists (select 1 from public.result_publications where assessment_id = p_assessment_id) then
    raise exception 'Submissions are closed: Results have already been published for this assessment'
      using errcode = 'P0008';
  end if;

  -- Prevent submission if assessment is not open
  if v_assessment_status <> 'published' then
    raise exception 'Submissions are closed: Assessment is not open for submission'
      using errcode = 'P0009';
  end if;

  -- Level 2 Lock on submission header
  select id into v_submission_id
  from public.submissions
  where assessment_id = p_assessment_id
    and student_id = p_student_id
  for update;

  if not found then
    v_is_resubmission := false;
    v_submission_id := coalesce(p_submission_id, gen_random_uuid());

    -- Authoritative PostgreSQL server-time deadline verification for first-time submission
    if v_server_now > v_deadline_at then
      if not v_allow_late then
        raise exception 'Submission rejected: The deadline for this assessment has passed'
          using errcode = 'P0010';
      end if;
      if v_extension_deadline_at is not null and v_server_now > v_extension_deadline_at then
        raise exception 'Submission rejected: The extended deadline for late submissions has passed'
          using errcode = 'P0011';
      end if;
      v_actual_late_status := 'late';
    else
      v_actual_late_status := 'on_time';
    end if;

    insert into public.submissions (
      id, assessment_id, question_id, student_id,
      status, first_submitted_at, updated_at, late_status
    ) values (
      v_submission_id, p_assessment_id, null, p_student_id,
      'uploaded', v_server_now, v_server_now, v_actual_late_status
    );
  else
    v_is_resubmission := true;

    -- Strict editing rule: resubmissions and modifications permitted ONLY before original deadline
    -- Uses PostgreSQL server clock (v_server_now) to reject post-deadline edits even during extension window
    if v_server_now > v_deadline_at then
      raise exception 'Submitted assignments cannot be modified after the original deadline has passed'
        using errcode = 'P0012';
    end if;

    v_actual_late_status := 'on_time';

    update public.submissions
    set updated_at = v_server_now,
        late_status = v_actual_late_status
    where id = v_submission_id;
  end if;

  select coalesce(max(version), 0) + 1 into v_version_number
  from public.submission_versions
  where submission_id = v_submission_id;

  v_active_version_id := coalesce(p_version_id, gen_random_uuid());

  insert into public.submission_versions (
    id, submission_id, version, storage_path, original_name,
    mime_type, size_bytes, sha256, uploaded_at, files, late_status, answers
  ) values (
    v_active_version_id,
    v_submission_id,
    v_version_number,
    p_storage_path,
    p_original_name,
    p_mime_type,
    coalesce(p_size_bytes, 0),
    p_sha256,
    v_server_now,
    coalesce(p_files, '[]'::jsonb),
    v_actual_late_status,
    coalesce(p_answers, '[]'::jsonb)
  );

  update public.submissions
  set active_version_id = v_active_version_id
  where id = v_submission_id;

  -- Clean up draft answers upon confirmed submission
  delete from public.student_submission_drafts
  where assessment_id = p_assessment_id
    and student_id = p_student_id;

  return jsonb_build_object(
    'submission_id', v_submission_id,
    'version_id', v_active_version_id,
    'version_number', v_version_number,
    'is_resubmission', v_is_resubmission
  );
end;
$$;

-- Provide backward-compatible 12-parameter wrapper if needed
create or replace function public.create_submission_atomic(
  p_assessment_id uuid,
  p_student_id uuid,
  p_submission_id uuid,
  p_version_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha256 text,
  p_files jsonb,
  p_submitted_at timestamptz,
  p_late_status text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.create_submission_atomic(
    p_assessment_id,
    p_student_id,
    p_submission_id,
    p_version_id,
    p_storage_path,
    p_original_name,
    p_mime_type,
    p_size_bytes,
    p_sha256,
    p_files,
    p_submitted_at,
    p_late_status,
    '[]'::jsonb
  );
$$;

revoke all on function public.create_submission_atomic(uuid, uuid, uuid, uuid, text, text, text, bigint, text, jsonb, timestamptz, text, jsonb) from public;
grant execute on function public.create_submission_atomic(uuid, uuid, uuid, uuid, text, text, text, bigint, text, jsonb, timestamptz, text, jsonb) to authenticated, service_role;

revoke all on function public.create_submission_atomic(uuid, uuid, uuid, uuid, text, text, text, bigint, text, jsonb, timestamptz, text) from public;
grant execute on function public.create_submission_atomic(uuid, uuid, uuid, uuid, text, text, text, bigint, text, jsonb, timestamptz, text) to authenticated, service_role;

