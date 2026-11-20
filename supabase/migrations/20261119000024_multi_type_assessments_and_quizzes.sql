-- ==============================================================================
-- Migration: 20261119000024_multi_type_assessments_and_quizzes.sql
-- Description: Multi-Type Assessment System: File-Based, Manual Questions, and Quiz (MCQ)
--              Supports individual or combined assessment types (7 combinations).
--              Preserves all existing data, rubrics, submissions, and evaluation workflows.
-- ==============================================================================

-- 1. Extend assessments table with assessment_types and instruction_files
alter table if exists public.assessments
  add column if not exists assessment_types text[] not null default array['file_based']::text[],
  add column if not exists instruction_files jsonb not null default '[]'::jsonb;

-- Ensure assessment_types contains only valid types and has at least one type
alter table if exists public.assessments
  drop constraint if exists ck_assessments_assessment_types;

alter table if exists public.assessments
  add constraint ck_assessments_assessment_types
  check (
    assessment_types <@ array['file_based', 'manual_questions', 'quiz']::text[]
    and array_length(assessment_types, 1) >= 1
  );

-- Backfill existing historical assessments to preserve backward compatibility
update public.assessments
set assessment_types = case
  when document_storage_key is not null and exists (select 1 from public.questions q where q.assessment_id = assessments.id)
    then array['file_based', 'manual_questions']::text[]
  when document_storage_key is not null
    then array['file_based']::text[]
  when exists (select 1 from public.questions q where q.assessment_id = assessments.id)
    then array['manual_questions']::text[]
  else array['file_based']::text[]
end
where assessment_types is null or assessment_types = '{}'::text[];

-- 2. Create quiz_questions table for MCQ assessment component
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  display_order int not null default 1,
  question_text text not null,
  marks numeric not null default 1 check (marks > 0),
  options jsonb not null,
  correct_option_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_quiz_question_options check (
    jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4
  )
);

create index if not exists idx_quiz_questions_assessment
  on public.quiz_questions(assessment_id, display_order);

-- Enable RLS on quiz_questions
alter table public.quiz_questions enable row level security;

-- Teachers & HOD can view and manage quiz questions for authorized subjects
drop policy if exists "Teachers can view own quiz questions" on public.quiz_questions;
create policy "Teachers can view own quiz questions"
  on public.quiz_questions for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'hod' and ur.active = true
    )
    or exists (
      select 1 from public.assessments a
      join public.class_subjects cs on cs.id = a.class_subject_id
      where a.id = quiz_questions.assessment_id
        and cs.subject_teacher_id = auth.uid()
        and cs.active = true
    )
  );

drop policy if exists "Teachers can insert quiz questions" on public.quiz_questions;
create policy "Teachers can insert quiz questions"
  on public.quiz_questions for insert
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'hod' and ur.active = true
    )
    or exists (
      select 1 from public.assessments a
      join public.class_subjects cs on cs.id = a.class_subject_id
      where a.id = quiz_questions.assessment_id
        and cs.subject_teacher_id = auth.uid()
        and cs.active = true
    )
  );

drop policy if exists "Teachers can update quiz questions" on public.quiz_questions;
create policy "Teachers can update quiz questions"
  on public.quiz_questions for update
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'hod' and ur.active = true
    )
    or exists (
      select 1 from public.assessments a
      join public.class_subjects cs on cs.id = a.class_subject_id
      where a.id = quiz_questions.assessment_id
        and cs.subject_teacher_id = auth.uid()
        and cs.active = true
    )
  );

drop policy if exists "Teachers can delete quiz questions" on public.quiz_questions;
create policy "Teachers can delete quiz questions"
  on public.quiz_questions for delete
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'hod' and ur.active = true
    )
    or exists (
      select 1 from public.assessments a
      join public.class_subjects cs on cs.id = a.class_subject_id
      where a.id = quiz_questions.assessment_id
        and cs.subject_teacher_id = auth.uid()
        and cs.active = true
    )
  );

grant all on public.quiz_questions to authenticated, service_role;

-- 3. Security Definer RPC for Student Quiz Questions (Omits correct_option_id)
-- Guarantees answer keys are NEVER exposed to students over network/API
create or replace function public.get_student_quiz_questions(p_assessment_id uuid)
returns table (
  id uuid,
  assessment_id uuid,
  display_order int,
  question_text text,
  marks numeric,
  options jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ass_status text;
begin
  select status into v_ass_status from public.assessments where assessments.id = p_assessment_id;
  if not found then
    raise exception 'Assessment % not found', p_assessment_id using errcode = 'P0002';
  end if;

  if v_ass_status not in ('published', 'closed') then
    raise exception 'Quiz questions cannot be accessed: assessment is not published' using errcode = '42501';
  end if;

  return query
    select
      qq.id,
      qq.assessment_id,
      qq.display_order,
      qq.question_text,
      qq.marks,
      qq.options
    from public.quiz_questions qq
    where qq.assessment_id = p_assessment_id
    order by qq.display_order asc;
end;
$$;

grant execute on function public.get_student_quiz_questions(uuid) to authenticated, service_role;

-- 4. Extend submission_versions and student_submission_drafts for quiz answers & section statuses
alter table if exists public.submission_versions
  add column if not exists quiz_answers jsonb not null default '[]'::jsonb,
  add column if not exists quiz_score numeric null,
  add column if not exists quiz_total_marks numeric null,
  add column if not exists section_statuses jsonb not null default '{}'::jsonb;

alter table if exists public.student_submission_drafts
  add column if not exists quiz_answers jsonb not null default '[]'::jsonb,
  add column if not exists section_statuses jsonb not null default '{}'::jsonb;

-- 5. Extend evaluations for quiz score tracking and teacher-confirmed final marks
alter table if exists public.evaluations
  add column if not exists quiz_score numeric null,
  add column if not exists teacher_confirmed_marks numeric null;

-- 6. Server-side authoritative quiz calculation function
create or replace function public.calculate_quiz_score(
  p_assessment_id uuid,
  p_quiz_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_q record;
  v_student_ans jsonb;
  v_selected_id text;
  v_total_marks numeric := 0;
  v_earned_score numeric := 0;
  v_correct_count int := 0;
  v_total_questions int := 0;
  v_details jsonb := '[]'::jsonb;
  v_is_correct boolean;
begin
  for v_q in (
    select id, display_order, marks, correct_option_id
    from public.quiz_questions
    where assessment_id = p_assessment_id
    order by display_order asc
  ) loop
    v_total_questions := v_total_questions + 1;
    v_total_marks := v_total_marks + v_q.marks;

    -- Find student's answer for this question
    v_selected_id := null;
    if p_quiz_answers is not null and jsonb_array_length(p_quiz_answers) > 0 then
      select elem->>'selected_option_id' into v_selected_id
      from jsonb_array_elements(p_quiz_answers) as elem
      where (elem->>'question_id')::uuid = v_q.id
      limit 1;
    end if;

    v_is_correct := (v_selected_id is not null and v_selected_id = v_q.correct_option_id);
    if v_is_correct then
      v_earned_score := v_earned_score + v_q.marks;
      v_correct_count := v_correct_count + 1;
    end if;

    v_details := v_details || jsonb_build_object(
      'question_id', v_q.id,
      'display_order', v_q.display_order,
      'selected_option_id', v_selected_id,
      'correct_option_id', v_q.correct_option_id,
      'is_correct', v_is_correct,
      'marks', v_q.marks,
      'awarded_marks', case when v_is_correct then v_q.marks else 0 end
    );
  end loop;

  return jsonb_build_object(
    'quiz_score', v_earned_score,
    'quiz_total_marks', v_total_marks,
    'correct_count', v_correct_count,
    'total_questions', v_total_questions,
    'percentage', case when v_total_marks > 0 then round((v_earned_score / v_total_marks) * 100, 2) else 0 end,
    'details', v_details
  );
end;
$$;

grant execute on function public.calculate_quiz_score(uuid, jsonb) to authenticated, service_role;

-- 7. Update publish_assessment RPC to support multi-type assessment rules
create or replace function public.publish_assessment(
  p_assessment_id uuid,
  p_published_by uuid default null
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
begin
  -- Caller verification
  if v_auth_uid is not null then
    v_publisher_id := v_auth_uid;
  else
    v_publisher_id := p_published_by;
  end if;

  if v_publisher_id is null then
    raise exception 'Unauthenticated execution rejected' using errcode = '42501';
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

  -- Verify authorization
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
  -- Required if File-Based or Manual Questions are selected; NOT required if Quiz-only.
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

  -- Transition status to published
  update public.assessments
  set status = 'published',
      published_at = v_now,
      published_by = v_publisher_id,
      updated_at = v_now
  where id = p_assessment_id;

  return jsonb_build_object(
    'assessment_id', p_assessment_id,
    'status', 'published',
    'published_at', v_now,
    'published_by', v_publisher_id,
    'assessment_types', v_types
  );
end;
$$;

grant execute on function public.publish_assessment(uuid, uuid) to authenticated, service_role;

-- 8. Update save_draft_assessment_atomic to support assessment_types, quiz_questions, and instruction_files
drop function if exists public.save_draft_assessment_atomic(uuid, uuid, text, text, timestamptz, boolean, timestamptz, text, numeric, text, text, bigint, text, uuid, jsonb, jsonb);
drop function if exists public.save_draft_assessment_atomic(uuid, uuid, text, text, timestamptz, boolean, timestamptz, text, numeric, text, text, bigint, text, uuid, jsonb, jsonb, text);
drop function if exists public.save_draft_assessment_atomic(uuid, uuid, text, text, timestamptz, boolean, timestamptz, text, numeric, text, text, bigint, text, uuid, jsonb, jsonb, text, text[], jsonb, jsonb);

create or replace function public.save_draft_assessment_atomic(
  p_assessment_id uuid,
  p_class_subject_id uuid,
  p_title text,
  p_instructions text,
  p_deadline_at timestamptz,
  p_allow_late boolean default false,
  p_extension_deadline_at timestamptz default null,
  p_late_penalty_mode text default 'none',
  p_late_penalty_marks numeric default 0,
  p_document_storage_key text default null,
  p_document_filename text default null,
  p_document_size_bytes bigint default null,
  p_document_mime_type text default null,
  p_caller_id uuid default null,
  p_questions jsonb default '[]'::jsonb,
  p_rubric jsonb default null,
  p_idempotency_key text default null,
  p_assessment_types text[] default array['file_based']::text[],
  p_quiz_questions jsonb default '[]'::jsonb,
  p_instruction_files jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_caller_id uuid;
  v_assessment_id uuid;
  v_existing_ass record;
  v_existing_idempotent_id uuid;
  v_class_subject_id uuid;
  v_is_hod boolean;
  v_is_assigned_teacher boolean;
  v_rv_id uuid;
  v_existing_rv record;
  v_q_elem jsonb;
  v_q_id uuid;
  v_q_ids uuid[] := array[]::uuid[];
  v_qq_elem jsonb;
  v_qq_id uuid;
  v_qq_ids uuid[] := array[]::uuid[];
  v_c_elem jsonb;
  v_c_id uuid;
  v_c_ids uuid[] := array[]::uuid[];
  v_display_orders int[] := array[]::int[];
  v_curr_order int;
  v_has_eval_deps boolean;
  v_existing_crit record;
  v_types text[];
  v_now timestamptz := now();
begin
  -- Step 1: Caller Verification
  if v_auth_uid is not null then
    v_caller_id := v_auth_uid;
    if p_caller_id is not null and p_caller_id <> v_auth_uid then
      raise exception 'Caller identity mismatch: cannot execute on behalf of another user'
        using errcode = '42501';
    end if;
  else
    v_caller_id := p_caller_id;
  end if;

  if v_caller_id is null then
    raise exception 'Unauthenticated execution rejected' using errcode = '42501';
  end if;

  v_types := coalesce(p_assessment_types, array['file_based']::text[]);

  -- Step 1.1: Idempotency Fast-Path Check for New Creations
  if p_assessment_id is null and p_idempotency_key is not null then
    select id into v_existing_idempotent_id
    from public.assessments
    where created_by = v_caller_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if v_existing_idempotent_id is not null then
      return jsonb_build_object(
        'assessment_id', v_existing_idempotent_id,
        'status', 'draft',
        'max_marks', 50,
        'assessment_types', v_types,
        'idempotent_replay', true
      );
    end if;
  end if;

  -- Step 2: Assessment Lock & Authorization Check
  if p_assessment_id is not null then
    select id, class_subject_id, status, created_by
    into v_existing_ass
    from public.assessments
    where id = p_assessment_id
    for update;

    if not found then
      raise exception 'Assessment % not found', p_assessment_id using errcode = 'P0002';
    end if;

    if v_existing_ass.status <> 'draft' then
      raise exception 'Cannot modify assessment %: status is % (only draft assessments may be edited)',
        p_assessment_id, v_existing_ass.status using errcode = '42501';
    end if;

    v_assessment_id := v_existing_ass.id;
    v_class_subject_id := v_existing_ass.class_subject_id;
  else
    v_assessment_id := gen_random_uuid();
    v_class_subject_id := p_class_subject_id;
  end if;

  -- Verify caller has HOD role or is assigned teacher for the class subject
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_caller_id
      and ur.role = 'hod'
      and ur.active = true
  ) into v_is_hod;

  if not v_is_hod then
    select exists (
      select 1 from public.class_subjects cs
      where cs.id = v_class_subject_id
        and cs.subject_teacher_id = v_caller_id
        and cs.active = true
    ) into v_is_assigned_teacher;

    if not v_is_assigned_teacher then
      raise exception 'User % is not authorized to author assessments for class subject %',
        v_caller_id, v_class_subject_id using errcode = '42501';
    end if;
  end if;

  -- Step 3: Insert or Update Assessment (Draft only, default 50 marks)
  if p_assessment_id is not null then
    update public.assessments
    set title = p_title,
        instructions = p_instructions,
        deadline_at = p_deadline_at,
        allow_late = p_allow_late,
        extension_deadline_at = p_extension_deadline_at,
        late_penalty_mode = p_late_penalty_mode,
        late_penalty_marks = p_late_penalty_marks,
        document_storage_key = coalesce(p_document_storage_key, document_storage_key),
        document_filename = coalesce(p_document_filename, document_filename),
        document_size_bytes = coalesce(p_document_size_bytes, document_size_bytes),
        document_mime_type = coalesce(p_document_mime_type, document_mime_type),
        instruction_files = coalesce(p_instruction_files, instruction_files),
        assessment_types = v_types,
        max_marks = 50,
        idempotency_key = coalesce(p_idempotency_key, idempotency_key),
        updated_at = v_now
    where id = v_assessment_id;
  else
    insert into public.assessments (
      id, class_subject_id, title, instructions, deadline_at,
      status, created_by, version, max_marks,
      allow_late, extension_deadline_at, late_penalty_mode, late_penalty_marks,
      document_storage_key, document_filename, document_size_bytes, document_mime_type,
      instruction_files, assessment_types, idempotency_key,
      created_at, updated_at
    ) values (
      v_assessment_id, v_class_subject_id, p_title, p_instructions, p_deadline_at,
      'draft', v_caller_id, 1, 50,
      p_allow_late, p_extension_deadline_at, p_late_penalty_mode, p_late_penalty_marks,
      p_document_storage_key, p_document_filename, p_document_size_bytes, p_document_mime_type,
      coalesce(p_instruction_files, '[]'::jsonb), v_types, p_idempotency_key,
      v_now, v_now
    );
  end if;

  -- Step 4: Reconcile Manual Questions
  if p_questions is not null then
    for v_q_elem in select * from jsonb_array_elements(p_questions) loop
      v_q_id := (v_q_elem->>'id')::uuid;

      if v_q_id is not null then
        if exists (select 1 from public.questions where id = v_q_id and assessment_id = v_assessment_id) then
          update public.questions
          set prompt = v_q_elem->>'prompt',
              display_order = (v_q_elem->>'display_order')::int,
              max_marks = coalesce((v_q_elem->>'max_marks')::numeric, 50)
          where id = v_q_id;
          v_q_ids := array_append(v_q_ids, v_q_id);
        else
          insert into public.questions (id, assessment_id, prompt, display_order, max_marks, created_at)
          values (
            v_q_id,
            v_assessment_id,
            v_q_elem->>'prompt',
            (v_q_elem->>'display_order')::int,
            coalesce((v_q_elem->>'max_marks')::numeric, 50),
            v_now
          );
          v_q_ids := array_append(v_q_ids, v_q_id);
        end if;
      else
        insert into public.questions (assessment_id, prompt, display_order, max_marks, created_at)
        values (
          v_assessment_id,
          v_q_elem->>'prompt',
          (v_q_elem->>'display_order')::int,
          coalesce((v_q_elem->>'max_marks')::numeric, 50),
          v_now
        )
        returning id into v_q_id;
        v_q_ids := array_append(v_q_ids, v_q_id);
      end if;
    end loop;

    -- Remove questions not in incoming list
    if array_length(v_q_ids, 1) > 0 then
      delete from public.questions
      where assessment_id = v_assessment_id
        and not (id = any(v_q_ids));
    else
      delete from public.questions
      where assessment_id = v_assessment_id;
    end if;
  end if;

  -- Step 5: Reconcile Quiz Questions (MCQ)
  if p_quiz_questions is not null then
    for v_qq_elem in select * from jsonb_array_elements(p_quiz_questions) loop
      v_qq_id := (v_qq_elem->>'id')::uuid;

      if v_qq_id is not null then
        if exists (select 1 from public.quiz_questions where id = v_qq_id and assessment_id = v_assessment_id) then
          update public.quiz_questions
          set question_text = v_qq_elem->>'question_text',
              display_order = (v_qq_elem->>'display_order')::int,
              marks = coalesce((v_qq_elem->>'marks')::numeric, 1),
              options = (v_qq_elem->'options'),
              correct_option_id = v_qq_elem->>'correct_option_id',
              updated_at = v_now
          where id = v_qq_id;
          v_qq_ids := array_append(v_qq_ids, v_qq_id);
        else
          insert into public.quiz_questions (
            id, assessment_id, display_order, question_text, marks, options, correct_option_id, created_at, updated_at
          ) values (
            v_qq_id,
            v_assessment_id,
            (v_qq_elem->>'display_order')::int,
            v_qq_elem->>'question_text',
            coalesce((v_qq_elem->>'marks')::numeric, 1),
            v_qq_elem->'options',
            v_qq_elem->>'correct_option_id',
            v_now,
            v_now
          );
          v_qq_ids := array_append(v_qq_ids, v_qq_id);
        end if;
      else
        insert into public.quiz_questions (
          assessment_id, display_order, question_text, marks, options, correct_option_id, created_at, updated_at
        ) values (
          v_assessment_id,
          (v_qq_elem->>'display_order')::int,
          v_qq_elem->>'question_text',
          coalesce((v_qq_elem->>'marks')::numeric, 1),
          v_qq_elem->'options',
          v_qq_elem->>'correct_option_id',
          v_now,
          v_now
        ) returning id into v_qq_id;
        v_qq_ids := array_append(v_qq_ids, v_qq_id);
      end if;
    end loop;

    -- Remove quiz questions not in incoming list
    if array_length(v_qq_ids, 1) > 0 then
      delete from public.quiz_questions
      where assessment_id = v_assessment_id
        and not (id = any(v_qq_ids));
    else
      delete from public.quiz_questions
      where assessment_id = v_assessment_id;
    end if;
  end if;

  -- Step 6: Reconcile Assignment-Level Rubric
  if p_rubric is not null then
    select id into v_rv_id
    from public.rubric_versions
    where assessment_id = v_assessment_id;

    if v_rv_id is null then
      insert into public.rubric_versions (
        assessment_id, version, title, created_by, created_at
      ) values (
        v_assessment_id,
        1,
        coalesce(p_rubric->>'title', 'Assignment Evaluation Rubric'),
        v_caller_id,
        v_now
      ) returning id into v_rv_id;
    else
      update public.rubric_versions
      set title = coalesce(p_rubric->>'title', title)
      where id = v_rv_id;
    end if;

    if p_rubric->'criteria' is not null and jsonb_array_length(p_rubric->'criteria') > 0 then
      for v_c_elem in select * from jsonb_array_elements(p_rubric->'criteria') loop
        v_c_id := (v_c_elem->>'id')::uuid;

        if v_c_id is not null then
          if exists (select 1 from public.rubric_criteria where id = v_c_id and rubric_version_id = v_rv_id) then
            update public.rubric_criteria
            set title = coalesce(v_c_elem->>'title', v_c_elem->>'criterion_title', title),
                description = coalesce(v_c_elem->>'description', ''),
                max_marks = (v_c_elem->>'max_marks')::numeric,
                display_order = (v_c_elem->>'display_order')::int
            where id = v_c_id;
            v_c_ids := array_append(v_c_ids, v_c_id);
          else
            insert into public.rubric_criteria (id, rubric_version_id, title, description, max_marks, display_order)
            values (
              v_c_id,
              v_rv_id,
              coalesce(v_c_elem->>'title', v_c_elem->>'criterion_title', 'Criterion'),
              coalesce(v_c_elem->>'description', ''),
              (v_c_elem->>'max_marks')::numeric,
              (v_c_elem->>'display_order')::int
            );
            v_c_ids := array_append(v_c_ids, v_c_id);
          end if;
        else
          insert into public.rubric_criteria (rubric_version_id, title, description, max_marks, display_order)
          values (
            v_rv_id,
            coalesce(v_c_elem->>'title', v_c_elem->>'criterion_title', 'Criterion'),
            coalesce(v_c_elem->>'description', ''),
            (v_c_elem->>'max_marks')::numeric,
            (v_c_elem->>'display_order')::int
          ) returning id into v_c_id;
          v_c_ids := array_append(v_c_ids, v_c_id);
        end if;
      end loop;

      if array_length(v_c_ids, 1) > 0 then
        delete from public.rubric_criteria
        where rubric_version_id = v_rv_id
          and not (id = any(v_c_ids));
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'assessment_id', v_assessment_id,
    'status', 'draft',
    'max_marks', 50,
    'assessment_types', v_types
  );
end;
$$;

grant execute on function public.save_draft_assessment_atomic(uuid, uuid, text, text, timestamptz, boolean, timestamptz, text, numeric, text, text, bigint, text, uuid, jsonb, jsonb, text, text[], jsonb, jsonb) to authenticated, service_role;

-- 9. Update create_submission_atomic to evaluate quiz answers server-side
drop function if exists public.create_submission_atomic(uuid, uuid, uuid, uuid, text, text, text, bigint, text, jsonb, timestamptz, text);
drop function if exists public.create_submission_atomic(uuid, uuid, uuid, uuid, text, text, text, bigint, text, jsonb, timestamptz, text, jsonb);
drop function if exists public.create_submission_atomic(uuid, uuid, uuid, uuid, text, text, text, bigint, text, jsonb, timestamptz, text, jsonb, jsonb, jsonb);

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
  p_answers jsonb,
  p_quiz_answers jsonb default '[]'::jsonb,
  p_section_statuses jsonb default '{}'::jsonb
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
  v_quiz_result jsonb := null;
  v_quiz_score numeric := null;
  v_quiz_total_marks numeric := null;
begin
  -- Caller verification: authenticated caller must match p_student_id
  if v_auth_uid is not null and v_auth_uid <> p_student_id then
    raise exception 'Caller % cannot submit on behalf of student %', v_auth_uid, p_student_id
      using errcode = '42501';
  end if;

  -- Level 1 Lock on assessments
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

    -- Server-time deadline verification
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

    if v_server_now > v_deadline_at then
      raise exception 'Submitted assignments cannot be modified after the original deadline has passed'
        using errcode = 'P0012';
    end if;

    v_actual_late_status := 'on_time';

    update public.submissions
    set updated_at = v_server_now,
        late_status = v_actual_late_status,
        status = 'uploaded'
    where id = v_submission_id;
  end if;

  -- Level 3: Version Number Assignment
  select coalesce(max(version), 0) + 1
  into v_version_number
  from public.submission_versions
  where submission_id = v_submission_id;

  v_active_version_id := coalesce(p_version_id, gen_random_uuid());

  -- Calculate server-side quiz score if quiz answers provided
  if p_quiz_answers is not null and jsonb_array_length(p_quiz_answers) > 0 then
    v_quiz_result := public.calculate_quiz_score(p_assessment_id, p_quiz_answers);
    v_quiz_score := (v_quiz_result->>'quiz_score')::numeric;
    v_quiz_total_marks := (v_quiz_result->>'quiz_total_marks')::numeric;
  end if;

  insert into public.submission_versions (
    id, submission_id, version,
    storage_path, original_name, mime_type, size_bytes, sha256,
    files, answers, quiz_answers, quiz_score, quiz_total_marks, section_statuses,
    created_at
  ) values (
    v_active_version_id,
    v_submission_id,
    v_version_number,
    p_storage_path,
    p_original_name,
    p_mime_type,
    p_size_bytes,
    p_sha256,
    coalesce(p_files, '[]'::jsonb),
    coalesce(p_answers, '[]'::jsonb),
    coalesce(p_quiz_answers, '[]'::jsonb),
    v_quiz_score,
    v_quiz_total_marks,
    coalesce(p_section_statuses, '{}'::jsonb),
    v_server_now
  );

  update public.submissions
  set active_version_id = v_active_version_id
  where id = v_submission_id;

  -- Remove student draft upon successful submission
  delete from public.student_submission_drafts
  where assessment_id = p_assessment_id and student_id = p_student_id;

  return jsonb_build_object(
    'submission_id', v_submission_id,
    'version_id', v_active_version_id,
    'version_number', v_version_number,
    'late_status', v_actual_late_status,
    'submitted_at', v_server_now,
    'is_resubmission', v_is_resubmission,
    'quiz_score', v_quiz_score,
    'quiz_total_marks', v_quiz_total_marks
  );
end;
$$;

grant execute on function public.create_submission_atomic(uuid, uuid, uuid, uuid, text, text, text, bigint, text, jsonb, timestamptz, text, jsonb, jsonb, jsonb) to authenticated, service_role;
