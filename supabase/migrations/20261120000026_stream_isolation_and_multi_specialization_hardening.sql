-- Migration: 20261120000026_stream_isolation_and_multi_specialization_hardening.sql
-- Description: Harden student stream isolation, multi-specialization handling, core subject eligibility, and RLS policies.
-- Safe forward-only migration updating publish_assessment RPC and student RLS policies without touching table schemas or academic records.

-- ============================================================================
-- 1. Hardened Assessments RLS Policy with Stream Isolation
-- ============================================================================

drop policy if exists "Students can view assigned published assessments" on public.assessments;

create policy "Students can view assigned published assessments"
  on public.assessments for select
  to authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.class_subjects cs
      inner join public.enrollments e on e.class_id = cs.class_id
      where cs.id = public.assessments.class_subject_id
        and e.student_id = auth.uid()
        and e.status = 'active'
        and (
          -- Core subject: no specialization in subjects table and no mapping in subject_specializations
          (
            not exists (
              select 1 from public.subjects s
              where s.id = cs.subject_id and s.specialization_id is not null
            )
            and not exists (
              select 1 from public.subject_specializations ss
              where ss.subject_id = cs.subject_id
            )
          )
          -- Specialized subject: student must have an active specialization matching ANY mapped stream
          or (
            e.specialization_id is not null
            and (
              exists (
                select 1 from public.subjects s
                where s.id = cs.subject_id and s.specialization_id = e.specialization_id
              )
              or exists (
                select 1 from public.subject_specializations ss
                where ss.subject_id = cs.subject_id and ss.specialization_id = e.specialization_id
              )
            )
          )
        )
    )
    and (
      publishing_audience = 'all'
      or exists (
        select 1 from public.assessment_student_targets ast
        where ast.assessment_id = public.assessments.id
          and ast.student_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- 2. Hardened Submissions RLS Policy with Stream Isolation
-- ============================================================================

drop policy if exists "Students can insert own submissions before deadline" on public.submissions;

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
        and (a.deadline_at > now() or (a.allow_late = true and a.extension_deadline_at is not null and a.extension_deadline_at > now()))
        and e.student_id = auth.uid()
        and e.status = 'active'
        and (
          -- Core subject: no specialization in subjects table and no mapping in subject_specializations
          (
            not exists (
              select 1 from public.subjects s
              where s.id = cs.subject_id and s.specialization_id is not null
            )
            and not exists (
              select 1 from public.subject_specializations ss
              where ss.subject_id = cs.subject_id
            )
          )
          -- Specialized subject: student must have an active specialization matching ANY mapped stream
          or (
            e.specialization_id is not null
            and (
              exists (
                select 1 from public.subjects s
                where s.id = cs.subject_id and s.specialization_id = e.specialization_id
              )
              or exists (
                select 1 from public.subject_specializations ss
                where ss.subject_id = cs.subject_id and ss.specialization_id = e.specialization_id
              )
            )
          )
        )
        and (
          a.publishing_audience = 'all'
          or exists (
            select 1 from public.assessment_student_targets ast
            where ast.assessment_id = a.id
              and ast.student_id = auth.uid()
          )
        )
    )
  );

-- ============================================================================
-- 3. Hardened Questions RLS Policy with Stream Isolation & Targeting
-- ============================================================================

drop policy if exists "Users can view questions of readable assessments" on public.questions;

create policy "Users can view questions of readable assessments"
  on public.questions for select
  to authenticated
  using (
    exists (
      select 1 from public.assessments a
      where a.id = public.questions.assessment_id
        and (
          -- Student read access: must be assigned published assessment with stream & targeting match
          (
            a.status = 'published'
            and exists (
              select 1 from public.class_subjects cs
              inner join public.enrollments e on e.class_id = cs.class_id
              where cs.id = a.class_subject_id
                and e.student_id = auth.uid()
                and e.status = 'active'
                and (
                  -- Core subject
                  (
                    not exists (
                      select 1 from public.subjects s
                      where s.id = cs.subject_id and s.specialization_id is not null
                    )
                    and not exists (
                      select 1 from public.subject_specializations ss
                      where ss.subject_id = cs.subject_id
                    )
                  )
                  -- Or matching specialization
                  or (
                    e.specialization_id is not null
                    and (
                      exists (
                        select 1 from public.subjects s
                        where s.id = cs.subject_id and s.specialization_id = e.specialization_id
                      )
                      or exists (
                        select 1 from public.subject_specializations ss
                        where ss.subject_id = cs.subject_id and ss.specialization_id = e.specialization_id
                      )
                    )
                  )
                )
            )
            and (
              a.publishing_audience = 'all'
              or exists (
                select 1 from public.assessment_student_targets ast
                where ast.assessment_id = a.id
                  and ast.student_id = auth.uid()
              )
            )
          )
          -- Subject teacher access
          or exists (
            select 1 from public.class_subjects cs
            where cs.id = a.class_subject_id and cs.subject_teacher_id = auth.uid() and cs.active = true
          )
          -- HOD access
          or exists (
            select 1 from public.user_roles ur
            where ur.user_id = auth.uid() and ur.role = 'hod' and ur.active = true
          )
        )
    )
  );

-- ============================================================================
-- 4. Hardened publish_assessment RPC with Multi-Specialization Support
-- ============================================================================

create or replace function public.publish_assessment(
  p_assessment_id uuid,
  p_published_by uuid default null,
  p_audience text default 'all',
  p_student_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_publisher_id uuid;
  v_ass record;
  v_is_hod boolean;
  v_is_assigned_teacher boolean;
  v_types text[];
  v_has_file boolean;
  v_has_manual boolean;
  v_has_quiz boolean;
  v_rv record;
  v_rubric_sum numeric := 0;
  v_criteria_count int := 0;
  v_manual_q_count int := 0;
  v_quiz_q_count int := 0;
  v_now timestamptz := now();
  v_valid_students_count int := 0;
  v_invalid_count int := 0;
  v_cs record;
  v_has_specializations boolean := false;
begin
  -- Caller verification: If caller is authenticated, force v_publisher_id to auth.uid() to prevent impersonation
  if v_auth_uid is not null then
    v_publisher_id := v_auth_uid;
  else
    v_publisher_id := p_published_by;
  end if;

  if v_publisher_id is null then
    raise exception 'Unauthenticated execution rejected' using errcode = '42501';
  end if;

  -- Validate audience parameter
  if p_audience is null or p_audience not in ('all', 'selected') then
    raise exception 'Invalid publishing audience: %. Must be "all" or "selected"', p_audience using errcode = '22023';
  end if;

  -- Lock assessment row
  select id, class_subject_id, status, deadline_at, assessment_types
  into v_ass
  from public.assessments
  where id = p_assessment_id
  for update;

  if not found then
    raise exception 'Assessment % not found', p_assessment_id using errcode = 'P0002';
  end if;

  if v_ass.status <> 'draft' then
    raise exception 'Assessment % is already % (only draft assessments may be published)',
      p_assessment_id, v_ass.status using errcode = '42501';
  end if;

  -- Verify authorization: Caller must be HOD or assigned subject teacher
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_publisher_id and ur.role = 'hod' and ur.active = true
  ) into v_is_hod;

  if not v_is_hod then
    select exists (
      select 1 from public.class_subjects cs
      where cs.id = v_ass.class_subject_id
        and cs.subject_teacher_id = v_publisher_id
        and cs.active = true
    ) into v_is_assigned_teacher;

    if not v_is_assigned_teacher then
      raise exception 'User % is not authorized to publish assessment %', v_publisher_id, p_assessment_id
        using errcode = '42501';
    end if;
  end if;

  -- Get class_subject details for student validation
  select cs.id, cs.class_id, cs.subject_id, s.specialization_id as subject_spec_id
  into v_cs
  from public.class_subjects cs
  inner join public.subjects s on s.id = cs.subject_id
  where cs.id = v_ass.class_subject_id;

  -- Determine if the subject has any specialization mappings (direct in subjects or join via subject_specializations)
  select exists (
    select 1 from public.subjects s where s.id = v_cs.subject_id and s.specialization_id is not null
    union
    select 1 from public.subject_specializations ss where ss.subject_id = v_cs.subject_id
  ) into v_has_specializations;

  -- Audience validation: If selected, validate p_student_ids
  if p_audience = 'selected' then
    if p_student_ids is null or cardinality(p_student_ids) = 0 then
      raise exception 'Cannot publish assessment %: At least one student must be selected when publishing to specific students',
        p_assessment_id using errcode = 'P0003';
    end if;

    -- Check that every student in p_student_ids has active enrollment in v_cs.class_id and belongs to an eligible specialization
    select count(distinct e.student_id)
    into v_valid_students_count
    from public.enrollments e
    where e.class_id = v_cs.class_id
      and e.status = 'active'
      and e.student_id = any(p_student_ids)
      and (
        -- For core subjects (no specialization mappings in either table), all actively enrolled class students are eligible
        (not v_has_specializations)
        -- For specialized subjects, student must have an active specialization that matches ANY mapped stream
        or (
          e.specialization_id is not null
          and (
            (v_cs.subject_spec_id is not null and e.specialization_id = v_cs.subject_spec_id)
            or exists (
              select 1 from public.subject_specializations ss
              where ss.subject_id = v_cs.subject_id and ss.specialization_id = e.specialization_id
            )
          )
        )
      );

    -- Check for distinct count in input (handles duplicates safely)
    select count(distinct s_id)
    into v_invalid_count
    from unnest(p_student_ids) as s_id;

    if v_valid_students_count <> v_invalid_count then
      raise exception 'Cannot publish assessment %: One or more selected students are not eligible for this class and subject stream',
        p_assessment_id using errcode = '42501';
    end if;
  end if;

  v_types := coalesce(v_ass.assessment_types, array['file_based']::text[]);
  v_has_file := 'file_based' = any(v_types);
  v_has_manual := 'manual_questions' = any(v_types);
  v_has_quiz := 'quiz' = any(v_types);

  -- Rule 1: Quiz validation
  if v_has_quiz then
    select count(*) into v_quiz_q_count
    from public.quiz_questions
    where assessment_id = p_assessment_id;

    if v_quiz_q_count = 0 then
      raise exception 'Cannot publish assessment %: At least one quiz question must be configured for a Quiz assessment',
        p_assessment_id using errcode = 'P0003';
    end if;
  end if;

  -- Rule 2: Manual Questions validation
  if v_has_manual then
    select count(*) into v_manual_q_count
    from public.questions
    where assessment_id = p_assessment_id;

    if v_manual_q_count = 0 then
      raise exception 'Cannot publish assessment %: At least one question must be added for a Manual Question assessment',
        p_assessment_id using errcode = 'P0003';
    end if;
  end if;

  -- Rule 3: Rubric validation
  if v_has_file or v_has_manual then
    select id, frozen_at
    into v_rv
    from public.rubric_versions
    where assessment_id = p_assessment_id
    for update;

    if not found then
      raise exception 'Cannot publish assessment %: An evaluation rubric must be configured before publication',
        p_assessment_id using errcode = 'P0003';
    end if;

    select count(*), coalesce(sum(max_marks), 0)
    into v_criteria_count, v_rubric_sum
    from public.rubric_criteria
    where rubric_version_id = v_rv.id;

    if v_criteria_count = 0 then
      raise exception 'Cannot publish assessment %: Rubric contains zero criteria',
        p_assessment_id using errcode = 'P0004';
    end if;

    if abs(v_rubric_sum - 50.00) > 0.001 then
      raise exception 'Cannot publish assessment %: Rubric criteria sum (%) does not equal required 50.00 marks',
        p_assessment_id, v_rubric_sum using errcode = 'P0005';
    end if;

    -- Freeze rubric
    update public.rubric_versions
    set frozen_at = v_now
    where id = v_rv.id;
  end if;

  -- Atomically insert targeted students if audience is 'selected'
  delete from public.assessment_student_targets where assessment_id = p_assessment_id;

  if p_audience = 'selected' then
    insert into public.assessment_student_targets (assessment_id, student_id, assigned_at)
    select distinct p_assessment_id, s_id, v_now
    from unnest(p_student_ids) as s_id;
  end if;

  -- Transition status to published
  update public.assessments
  set status = 'published',
      publishing_audience = p_audience,
      published_at = v_now,
      published_by = v_publisher_id,
      updated_at = v_now
  where id = p_assessment_id;

  return jsonb_build_object(
    'assessment_id', p_assessment_id,
    'status', 'published',
    'publishing_audience', p_audience,
    'assigned_student_count', case when p_audience = 'selected' then cardinality(p_student_ids) else null end,
    'published_at', v_now,
    'published_by', v_publisher_id,
    'assessment_types', v_types
  );
end;
$$;

-- Revoke default public, anon, and authenticated execution to enforce backend-only execution via service_role
revoke all on function public.publish_assessment(uuid, uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.publish_assessment(uuid, uuid, text, uuid[]) to service_role;
