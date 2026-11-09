-- ==============================================================================
-- Migration: 20261107000021_permanent_assessment_deletion.sql
-- Description: Supports permanent assignment deletion by authorized subject teachers
--              with password confirmation, staged storage cleanup, and cascade purging.
-- ==============================================================================

-- 1. Add 'deletion_pending' status to assessment_status enum
alter type public.assessment_status add value if not exists 'deletion_pending';

-- 2. Persistent Single-Use Registry for High-Privilege Re-Authentication Tokens
create table if not exists public.consumed_reauth_tokens (
  jti text primary key,
  purpose text not null default 'assignment_deletion',
  target_id text,
  consumed_by uuid,
  consumed_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_consumed_reauth_tokens_expires_at
  on public.consumed_reauth_tokens (expires_at);

-- Privilege hardening: strictly internal to backend / service_role
revoke all on public.consumed_reauth_tokens from anon, authenticated, public;
grant all on public.consumed_reauth_tokens to service_role;

-- 3. Synchronize Deletion Trigger Guards
-- Ensures published evaluations and criterion scores are protected during normal operations,
-- but permits deletion only when transaction setting 'app.allow_assessment_deletion' is 'true'
-- AND the parent assessment is actively in 'deletion_pending' status.
create or replace function public.guard_evaluation_criterion_score_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_eval_status text;
  v_assessment_status text;
begin
  select status into v_eval_status
  from public.evaluations
  where id = old.evaluation_id
  for update;

  if v_eval_status = 'published' then
    if current_setting('app.allow_assessment_deletion', true) = 'true' then
      select a.status::text into v_assessment_status
      from public.evaluations e
      inner join public.submissions s on s.id = e.submission_id
      inner join public.assessments a on a.id = s.assessment_id
      where e.id = old.evaluation_id;

      if v_assessment_status is distinct from 'deletion_pending' then
        raise exception 'Cannot delete criterion score from a published evaluation' using errcode = '42501';
      end if;
    else
      raise exception 'Cannot delete criterion score from a published evaluation' using errcode = '42501';
    end if;
  end if;

  return old;
end;
$$;

create or replace function public.guard_evaluation_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assessment_status text;
begin
  if old.status = 'published' then
    if current_setting('app.allow_assessment_deletion', true) = 'true' then
      select a.status::text into v_assessment_status
      from public.submissions s
      inner join public.assessments a on a.id = s.assessment_id
      where s.id = old.submission_id;

      if v_assessment_status is distinct from 'deletion_pending' then
        raise exception 'Cannot delete a published evaluation record' using errcode = '42501';
      end if;
    else
      raise exception 'Cannot delete a published evaluation record' using errcode = '42501';
    end if;
  end if;
  return old;
end;
$$;

-- 4. Atomic procedure to mark assessment as deletion-pending (locking further activity)
create or replace function public.mark_assessment_deletion_pending(
  p_assessment_id uuid,
  p_caller_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_assessment record;
  v_is_hod boolean := false;
  v_is_assigned_faculty boolean := false;
  v_auth_uid uuid := auth.uid();
begin
  -- Impersonation safeguard: If auth.uid() is set, caller must match
  if v_auth_uid is not null and v_auth_uid <> p_caller_id then
    raise exception 'FORBIDDEN: Authenticated caller cannot act on behalf of another user';
  end if;

  -- 1. Lock the assessment row
  select * into v_assessment
  from public.assessments
  where id = p_assessment_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: Assessment % not found', p_assessment_id;
  end if;

  -- 2. Authorization check: caller must be HOD or active assigned subject teacher
  select exists (
    select 1 from public.user_roles
    where user_id = p_caller_id and role = 'hod' and active = true
  ) into v_is_hod;

  select exists (
    select 1 from public.class_subjects cs
    where cs.id = v_assessment.class_subject_id
      and cs.subject_teacher_id = p_caller_id
      and cs.active = true
  ) into v_is_assigned_faculty;

  if not v_is_hod and not v_is_assigned_faculty then
    raise exception 'FORBIDDEN: Only the authorized subject teacher or HOD can initiate assessment deletion';
  end if;

  -- 3. Transition status to deletion_pending
  update public.assessments
  set status = 'deletion_pending',
      updated_at = now()
  where id = p_assessment_id;

  return jsonb_build_object(
    'success', true,
    'assessment_id', p_assessment_id,
    'status', 'deletion_pending'
  );
end;
$$;

-- 5. Atomic deletion of assessment database records (executed after storage cleanup)
create or replace function public.delete_assessment_atomic(
  p_assessment_id uuid,
  p_caller_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_assessment record;
  v_is_hod boolean := false;
  v_is_assigned_faculty boolean := false;
  v_auth_uid uuid := auth.uid();
  v_submissions_count int := 0;
  v_evaluations_count int := 0;
  v_questions_count int := 0;
  v_rubrics_count int := 0;
  v_publications_count int := 0;
begin
  -- Impersonation safeguard: If auth.uid() is set, caller must match
  if v_auth_uid is not null and v_auth_uid <> p_caller_id then
    raise exception 'FORBIDDEN: Authenticated caller cannot act on behalf of another user';
  end if;

  -- 1. Lock the assessment row
  select * into v_assessment
  from public.assessments
  where id = p_assessment_id
  for update;

  if not found then
    -- Idempotent: already deleted
    return jsonb_build_object(
      'success', true,
      'already_deleted', true,
      'assessment_id', p_assessment_id
    );
  end if;

  -- 2. State invariant: assessment must be in deletion_pending status
  if v_assessment.status::text <> 'deletion_pending' then
    raise exception 'FORBIDDEN: Assessment % must be in deletion_pending status before permanent deletion', p_assessment_id;
  end if;

  -- 3. Authorization check: caller must be HOD or active assigned subject teacher
  select exists (
    select 1 from public.user_roles
    where user_id = p_caller_id and role = 'hod' and active = true
  ) into v_is_hod;

  select exists (
    select 1 from public.class_subjects cs
    where cs.id = v_assessment.class_subject_id
      and cs.subject_teacher_id = p_caller_id
      and cs.active = true
  ) into v_is_assigned_faculty;

  if not v_is_hod and not v_is_assigned_faculty then
    raise exception 'FORBIDDEN: Only the authorized subject teacher or HOD can permanently delete this assessment';
  end if;

  -- 4. Enable transaction-scoped bypass for published evaluation deletion guards
  perform set_config('app.allow_assessment_deletion', 'true', true);

  -- 5. Collect counts for audit summary
  select count(*) into v_submissions_count from public.submissions where assessment_id = p_assessment_id;
  select count(*) into v_evaluations_count from public.evaluations where submission_id in (
    select id from public.submissions where assessment_id = p_assessment_id
  );
  select count(*) into v_questions_count from public.questions where assessment_id = p_assessment_id;
  select count(*) into v_rubrics_count from public.rubric_versions where assessment_id = p_assessment_id or question_id in (
    select id from public.questions where assessment_id = p_assessment_id
  );
  select count(*) into v_publications_count from public.result_publications where assessment_id = p_assessment_id;

  -- 6. Delete dependent records in strict foreign-key order

  -- A. Result publications
  delete from public.result_publications where assessment_id = p_assessment_id;

  -- B. Evaluation criterion scores & evaluations
  delete from public.evaluation_criterion_scores
  where evaluation_id in (
    select e.id from public.evaluations e
    inner join public.submissions s on s.id = e.submission_id
    where s.assessment_id = p_assessment_id
  );

  delete from public.evaluations
  where submission_id in (
    select id from public.submissions where assessment_id = p_assessment_id
  );

  -- C. Submission versions & submissions
  -- Break circular FK if active_version_id is set
  update public.submissions set active_version_id = null where assessment_id = p_assessment_id;

  delete from public.submission_versions
  where submission_id in (
    select id from public.submissions where assessment_id = p_assessment_id
  );

  delete from public.submissions where assessment_id = p_assessment_id;

  -- D. Rubrics (levels -> criteria -> versions)
  delete from public.rubric_levels where criterion_id in (
    select rc.id from public.rubric_criteria rc
    inner join public.rubric_versions rv on rv.id = rc.rubric_version_id
    left join public.questions q on q.id = rv.question_id
    where rv.assessment_id = p_assessment_id or q.assessment_id = p_assessment_id
  );

  delete from public.rubric_criteria where rubric_version_id in (
    select rv.id from public.rubric_versions rv
    left join public.questions q on q.id = rv.question_id
    where rv.assessment_id = p_assessment_id or q.assessment_id = p_assessment_id
  );

  delete from public.rubric_versions where assessment_id = p_assessment_id or question_id in (
    select id from public.questions where assessment_id = p_assessment_id
  );

  -- E. Questions
  delete from public.questions where assessment_id = p_assessment_id;

  -- F. The assessment itself
  delete from public.assessments where id = p_assessment_id;

  return jsonb_build_object(
    'success', true,
    'assessment_id', p_assessment_id,
    'deleted_counts', jsonb_build_object(
      'submissions', v_submissions_count,
      'evaluations', v_evaluations_count,
      'questions', v_questions_count,
      'rubric_versions', v_rubrics_count,
      'publications', v_publications_count
    )
  );
end;
$$;

-- Grant execution to authenticated users (role checks enforced inside function)
grant execute on function public.mark_assessment_deletion_pending(uuid, uuid) to authenticated;
grant execute on function public.delete_assessment_atomic(uuid, uuid) to authenticated;

