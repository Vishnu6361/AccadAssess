-- Migration: 20261107000020_question_builder_and_assignment_rubrics.sql
-- Description: Question Builder, Assignment-Level Rubric, Atomic Publication & Evaluation Triggers
-- Target: Supabase PostgreSQL (Local Migration Specification - DO NOT EXECUTE DIRECTLY AGAINST PRODUCTION)

-- ============================================================================
-- 1. EXTEND RUBRIC VERSIONS TABLE FOR ASSIGNMENT-LEVEL RUBRICS
-- ============================================================================

-- Add assessment_id and frozen_at to rubric_versions if not exists
alter table if exists public.rubric_versions
  add column if not exists assessment_id uuid references public.assessments(id) on delete cascade,
  add column if not exists frozen_at timestamptz null;

-- Make question_id nullable so rubric_versions can attach directly to assessments
alter table if exists public.rubric_versions
  alter column question_id drop not null;

-- Ensure questions table supports manual questions without required question-level marks
alter table if exists public.questions
  alter column max_marks drop not null,
  alter column max_marks set default 50;

-- Add index on assessment_id
create index if not exists idx_rubric_versions_assessment 
  on public.rubric_versions(assessment_id, version);

-- Ensure exactly one parent (either assessment_id or question_id)
alter table if exists public.rubric_versions
  drop constraint if exists ck_rubric_versions_exactly_one_parent;

alter table if exists public.rubric_versions
  add constraint ck_rubric_versions_exactly_one_parent
  check (num_nonnulls(assessment_id, question_id) = 1);

-- ============================================================================
-- 2. ENSURE UNIQUE CONSTRAINTS FOR EVALUATIONS AND PUBLICATIONS
-- ============================================================================

alter table if exists public.result_publications
  drop constraint if exists uq_result_publications_assessment;

alter table if exists public.result_publications
  add constraint uq_result_publications_assessment unique (assessment_id);

alter table if exists public.evaluations
  drop constraint if exists uq_evaluations_submission;

alter table if exists public.evaluations
  add constraint uq_evaluations_submission unique (submission_id);

-- ============================================================================
-- 3. SECURITY DEFINER RPC: ATOMIC DRAFT ASSESSMENT SAVE
-- ============================================================================

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
  p_rubric jsonb default null
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
  v_class_subject_id uuid;
  v_is_hod boolean;
  v_is_assigned_teacher boolean;
  v_rv_id uuid;
  v_existing_rv record;
  v_q_elem jsonb;
  v_q_id uuid;
  v_q_ids uuid[] := array[]::uuid[];
  v_c_elem jsonb;
  v_c_id uuid;
  v_c_ids uuid[] := array[]::uuid[];
  v_display_orders int[] := array[]::int[];
  v_curr_order int;
  v_has_eval_deps boolean;
  v_existing_crit record;
  v_now timestamptz := now();
begin
  -- Step 1: Trusted Caller Verification
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
        max_marks = 50,
        updated_at = v_now
    where id = v_assessment_id;
  else
    insert into public.assessments (
      id, class_subject_id, title, instructions, deadline_at,
      status, created_by, version, max_marks,
      allow_late, extension_deadline_at, late_penalty_mode, late_penalty_marks,
      document_storage_key, document_filename, document_size_bytes, document_mime_type,
      created_at, updated_at
    ) values (
      v_assessment_id, v_class_subject_id, p_title, p_instructions, p_deadline_at,
      'draft', v_caller_id, 1, 50,
      p_allow_late, p_extension_deadline_at, p_late_penalty_mode, p_late_penalty_marks,
      p_document_storage_key, p_document_filename, p_document_size_bytes, p_document_mime_type,
      v_now, v_now
    );
  end if;

  -- Step 4: Reconcile Manual Questions
  if p_questions is not null and jsonb_array_length(p_questions) > 0 then
    for v_q_elem in select * from jsonb_array_elements(p_questions) loop
      v_q_id := (v_q_elem->>'id')::uuid;

      if v_q_id is not null then
        -- Validate question belongs to this assessment
        if not exists (select 1 from public.questions where id = v_q_id and assessment_id = v_assessment_id) then
          raise exception 'Question ID % does not belong to assessment %', v_q_id, v_assessment_id
            using errcode = 'P0003';
        end if;

        update public.questions
        set prompt = v_q_elem->>'prompt',
            display_order = (v_q_elem->>'display_order')::int,
            max_marks = coalesce((v_q_elem->>'max_marks')::numeric, 50)
        where id = v_q_id;

        v_q_ids := array_append(v_q_ids, v_q_id);
      else
        v_q_id := gen_random_uuid();
        insert into public.questions (
          id, assessment_id, prompt, display_order, max_marks
        ) values (
          v_q_id, v_assessment_id, v_q_elem->>'prompt',
          (v_q_elem->>'display_order')::int,
          coalesce((v_q_elem->>'max_marks')::numeric, 50)
        );
        v_q_ids := array_append(v_q_ids, v_q_id);
      end if;
    end loop;

    -- Delete omitted questions only if no student submissions reference them
    delete from public.questions
    where assessment_id = v_assessment_id
      and id <> all(v_q_ids)
      and not exists (
        select 1 from public.submissions s where s.question_id = questions.id
      );
  else
    -- If no questions provided, delete non-referenced questions
    delete from public.questions
    where assessment_id = v_assessment_id
      and not exists (
        select 1 from public.submissions s where s.question_id = questions.id
      );
  end if;

  -- Step 5: Reconcile Assignment-Level Rubric
  if p_rubric is not null and (p_rubric->>'title') is not null then
    select id, frozen_at into v_existing_rv
    from public.rubric_versions
    where assessment_id = v_assessment_id
    for update;

    if found then
      if v_existing_rv.frozen_at is not null then
        raise exception 'Cannot modify rubric for assessment %: rubric is frozen', v_assessment_id
          using errcode = '42501';
      end if;
      v_rv_id := v_existing_rv.id;
      update public.rubric_versions
      set title = p_rubric->>'title'
      where id = v_rv_id;
    else
      v_rv_id := gen_random_uuid();
      insert into public.rubric_versions (
        id, assessment_id, question_id, version, title, created_by, created_at
      ) values (
        v_rv_id, v_assessment_id, null, 1, p_rubric->>'title', v_caller_id, v_now
      );
    end if;

    -- Reconcile Rubric Criteria
    if p_rubric->'criteria' is not null and jsonb_array_length(p_rubric->'criteria') > 0 then
      -- First validate display orders for duplicates and non-positive values
      for v_c_elem in select * from jsonb_array_elements(p_rubric->'criteria') loop
        v_curr_order := (v_c_elem->>'display_order')::int;
        if v_curr_order is null or v_curr_order < 1 then
          raise exception 'Invalid display_order %: display orders must be positive integers', v_curr_order
            using errcode = '22003';
        end if;
        if v_curr_order = any(v_display_orders) then
          raise exception 'Duplicate display_order % found in rubric criteria', v_curr_order
            using errcode = '23505';
        end if;
        v_display_orders := array_append(v_display_orders, v_curr_order);
      end loop;

      -- Process each criterion
      for v_c_elem in select * from jsonb_array_elements(p_rubric->'criteria') loop
        v_c_id := (v_c_elem->>'id')::uuid;

        if v_c_id is not null then
          select id, title, description, max_marks, display_order
          into v_existing_crit
          from public.rubric_criteria
          where id = v_c_id and rubric_version_id = v_rv_id;

          if not found then
            raise exception 'Criterion ID % does not belong to rubric %', v_c_id, v_rv_id
              using errcode = 'P0003';
          end if;

          -- Check if evaluated before modifying
          select exists (
            select 1 from public.evaluation_criterion_scores where criterion_id = v_c_id
          ) into v_has_eval_deps;

          if v_has_eval_deps then
            -- Verify immutable fields have not changed
            if v_existing_crit.title <> (v_c_elem->>'title')
               or nullif(trim(v_existing_crit.description), '') is distinct from nullif(trim(v_c_elem->>'description'), '')
               or v_existing_crit.max_marks <> (v_c_elem->>'max_marks')::numeric
               or v_existing_crit.display_order <> (v_c_elem->>'display_order')::int then
              raise exception 'Cannot modify evaluated criterion %: historical evaluations reference this record', v_c_id
                using errcode = '42501';
            end if;
          else
            update public.rubric_criteria
            set title = v_c_elem->>'title',
                description = coalesce(v_c_elem->>'description', ''),
                max_marks = (v_c_elem->>'max_marks')::numeric,
                display_order = (v_c_elem->>'display_order')::int
            where id = v_c_id;
          end if;

          v_c_ids := array_append(v_c_ids, v_c_id);
        else
          v_c_id := gen_random_uuid();
          insert into public.rubric_criteria (
            id, rubric_version_id, title, description, max_marks, display_order, created_at
          ) values (
            v_c_id, v_rv_id, v_c_elem->>'title',
            coalesce(v_c_elem->>'description', ''),
            (v_c_elem->>'max_marks')::numeric,
            (v_c_elem->>'display_order')::int,
            v_now
          );
          v_c_ids := array_append(v_c_ids, v_c_id);
        end if;
      end loop;

      -- Delete omitted criteria only if no evaluations reference them
      delete from public.rubric_criteria
      where rubric_version_id = v_rv_id
        and id <> all(v_c_ids)
        and not exists (
          select 1 from public.evaluation_criterion_scores ecs where ecs.criterion_id = rubric_criteria.id
        );
    end if;
  end if;

  return jsonb_build_object(
    'assessment_id', v_assessment_id,
    'status', 'draft',
    'max_marks', 50
  );
end;
$$;

revoke all on function public.save_draft_assessment_atomic from public;
grant execute on function public.save_draft_assessment_atomic to authenticated, service_role;

-- ============================================================================
-- 4. SECURITY DEFINER RPC: PUBLISH ASSESSMENT WITH 50-MARK VALIDATION
-- ============================================================================

drop function if exists public.publish_assessment(uuid);
drop function if exists public.publish_assessment(uuid, uuid);

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
  v_rv record;
  v_rubric_sum numeric := 0;
  v_criteria_count int := 0;
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
  select id, class_subject_id, status, deadline_at
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

  -- Lock and validate rubric version
  select id, frozen_at
  into v_rv
  from public.rubric_versions
  where assessment_id = p_assessment_id
  for update;

  if not found then
    raise exception 'Cannot publish assessment %: An assignment-level rubric must be configured before publication',
      p_assessment_id using errcode = 'P0003';
  end if;

  -- Validate criteria count and exact 50 mark total
  select count(*), coalesce(sum(max_marks), 0)
  into v_criteria_count, v_rubric_sum
  from public.rubric_criteria
  where rubric_version_id = v_rv.id;

  if v_criteria_count = 0 then
    raise exception 'Cannot publish assessment %: Rubric contains zero criteria', p_assessment_id
      using errcode = 'P0003';
  end if;

  if v_rubric_sum <> 50.00 then
    raise exception 'Cannot publish assessment %: Rubric criteria sum (%) must equal exactly 50.00 marks',
      p_assessment_id, v_rubric_sum using errcode = '22003';
  end if;

  -- Freeze rubric
  update public.rubric_versions
  set frozen_at = v_now
  where id = v_rv.id;

  -- Publish assessment
  update public.assessments
  set status = 'published',
      published_at = v_now,
      published_by = v_publisher_id,
      max_marks = 50,
      updated_at = v_now
  where id = p_assessment_id;

  return jsonb_build_object(
    'id', p_assessment_id,
    'status', 'published',
    'published_at', v_now,
    'published_by', v_publisher_id,
    'max_marks', 50
  );
end;
$$;

revoke all on function public.publish_assessment(uuid, uuid) from public;
grant execute on function public.publish_assessment(uuid, uuid) to authenticated, service_role;

-- ============================================================================
-- 5. SECURITY DEFINER RPC: ATOMIC SUBMISSION CREATION
-- ============================================================================

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
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_assessment_status text;
  v_submission_id uuid;
  v_version_number int;
  v_is_resubmission boolean;
begin
  -- Caller verification: authenticated caller must match p_student_id
  if v_auth_uid is not null and v_auth_uid <> p_student_id then
    raise exception 'Caller % cannot submit on behalf of student %', v_auth_uid, p_student_id
      using errcode = '42501';
  end if;

  -- Level 1 Lock on assessments (FOR SHARE allows concurrent submissions, blocks publication FOR UPDATE)
  select status into v_assessment_status
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
    v_submission_id := coalesce(p_submission_id, gen_random_uuid());
    insert into public.submissions (
      id, assessment_id, question_id, student_id,
      status, first_submitted_at, updated_at, late_status
    ) values (
      v_submission_id, p_assessment_id, null, p_student_id,
      'uploaded', p_submitted_at, p_submitted_at, p_late_status
    );
    v_is_resubmission := false;
  else
    update public.submissions
    set updated_at = p_submitted_at,
        late_status = p_late_status
    where id = v_submission_id;
    v_is_resubmission := true;
  end if;

  select coalesce(max(version), 0) + 1 into v_version_number
  from public.submission_versions
  where submission_id = v_submission_id;

  insert into public.submission_versions (
    id, submission_id, version, storage_path, original_name,
    mime_type, size_bytes, sha256, uploaded_at, files, late_status
  ) values (
    coalesce(p_version_id, gen_random_uuid()),
    v_submission_id,
    v_version_number,
    p_storage_path,
    p_original_name,
    p_mime_type,
    p_size_bytes,
    p_sha256,
    p_submitted_at,
    p_files,
    p_late_status
  );

  update public.submissions
  set active_version_id = coalesce(p_version_id, gen_random_uuid())
  where id = v_submission_id;

  return jsonb_build_object(
    'submission_id', v_submission_id,
    'version_id', p_version_id,
    'version_number', v_version_number,
    'is_resubmission', v_is_resubmission
  );
end;
$$;

revoke all on function public.create_submission_atomic from public;
grant execute on function public.create_submission_atomic to authenticated, service_role;

-- ============================================================================
-- 6. SECURITY DEFINER RPC: ATOMIC EVALUATION AND GRADING
-- ============================================================================

create or replace function public.save_evaluation_atomic(
  p_submission_id uuid,
  p_submission_version_id uuid,
  p_evaluator_id uuid,
  p_status text,
  p_raw_score numeric(6,2),
  p_late_penalty_deducted numeric(6,2),
  p_total_score numeric(6,2),
  p_general_feedback text,
  p_criterion_scores jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_assessment_id uuid;
  v_class_subject_id uuid;
  v_existing_eval record;
  v_evaluation_id uuid;
  v_is_hod boolean;
  v_is_authorized_teacher boolean;
begin
  -- Caller verification: authenticated caller must match p_evaluator_id
  if v_auth_uid is not null and v_auth_uid <> p_evaluator_id then
    raise exception 'Caller % cannot record evaluations on behalf of %', v_auth_uid, p_evaluator_id
      using errcode = '42501';
  end if;

  -- Status check: evaluations can only be created or saved as draft or completed (direct publication prohibited)
  if p_status not in ('draft', 'completed') then
    raise exception 'Invalid evaluation status %: Evaluations can only be saved as draft or completed. Direct publication is prohibited', p_status
      using errcode = '42501';
  end if;

  select s.assessment_id, a.class_subject_id
  into v_assessment_id, v_class_subject_id
  from public.submissions s
  inner join public.assessments a on a.id = s.assessment_id
  where s.id = p_submission_id;

  if not found then
    raise exception 'Submission % not found', p_submission_id using errcode = 'P0002';
  end if;

  -- Level 1 Lock on assessments (FOR SHARE blocks publication FOR UPDATE)
  perform 1
  from public.assessments
  where id = v_assessment_id
  for share;

  -- Prevent grading if results have already been published
  if exists (select 1 from public.result_publications where assessment_id = v_assessment_id) then
    raise exception 'Cannot grade assignment: Results have already been published for this assessment'
      using errcode = '42501';
  end if;

  -- Authorization check
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_evaluator_id and ur.role = 'hod' and ur.active = true
  ) into v_is_hod;

  if not v_is_hod then
    select exists (
      select 1 from public.class_subjects cs
      where cs.id = v_class_subject_id
        and cs.subject_teacher_id = p_evaluator_id
        and cs.active = true
    ) into v_is_authorized_teacher;

    if not v_is_authorized_teacher then
      raise exception 'Evaluator % is not authorized to grade assessment %', p_evaluator_id, v_assessment_id
        using errcode = '42501';
    end if;
  end if;

  -- Level 2 Lock on evaluation
  select id, status into v_existing_eval
  from public.evaluations
  where submission_id = p_submission_id
  for update;

  if found then
    if v_existing_eval.status = 'published' then
      raise exception 'Cannot modify a published evaluation' using errcode = '42501';
    end if;

    update public.evaluations
    set status = p_status,
        raw_score = p_raw_score,
        late_penalty_deducted = p_late_penalty_deducted,
        total_score = p_total_score,
        general_feedback = p_general_feedback,
        updated_at = now()
    where id = v_existing_eval.id
    returning id into v_evaluation_id;
  else
    v_evaluation_id := gen_random_uuid();
    insert into public.evaluations (
      id, submission_id, submission_version_id, evaluator_id,
      status, raw_score, late_penalty_deducted, total_score,
      general_feedback, created_at, updated_at
    ) values (
      v_evaluation_id, p_submission_id, p_submission_version_id, p_evaluator_id,
      p_status, p_raw_score, p_late_penalty_deducted, p_total_score,
      p_general_feedback, now(), now()
    );
  end if;

  -- Level 3 Criterion-score atomic replacement in the exact same transaction
  delete from public.evaluation_criterion_scores
  where evaluation_id = v_evaluation_id;

  if p_criterion_scores is not null and jsonb_array_length(p_criterion_scores) > 0 then
    insert into public.evaluation_criterion_scores (
      id, evaluation_id, criterion_id, selected_level_id, score, feedback, created_at
    )
    select
      coalesce((elem->>'id')::uuid, gen_random_uuid()),
      v_evaluation_id,
      (elem->>'criterion_id')::uuid,
      (elem->>'selected_level_id')::uuid,
      (elem->>'score')::numeric(6,2),
      elem->>'feedback',
      now()
    from jsonb_array_elements(p_criterion_scores) as elem;
  end if;

  return jsonb_build_object(
    'id', v_evaluation_id,
    'submission_id', p_submission_id,
    'status', p_status,
    'raw_score', p_raw_score,
    'late_penalty_deducted', p_late_penalty_deducted,
    'total_score', p_total_score
  );
end;
$$;

revoke all on function public.save_evaluation_atomic from public;
grant execute on function public.save_evaluation_atomic to authenticated, service_role;

-- ============================================================================
-- 7. SECURITY DEFINER RPC: ATOMIC RESULT PUBLICATION
-- ============================================================================

create or replace function public.publish_evaluation_results(
  p_assessment_id uuid,
  p_published_by uuid,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_assessment_rec record;
  v_is_hod boolean;
  v_is_authorized_teacher boolean;
  v_already_published boolean;
  v_sub_count int;
  v_incomplete_count int;
  v_publication_id uuid;
  v_published_at timestamptz := now();
  v_published_count int := 0;
begin
  -- Step 1: Level 1 Lock on assessment row (FOR UPDATE exclusive)
  select id, class_subject_id into v_assessment_rec
  from public.assessments
  where id = p_assessment_id
  for update;

  if not found then
    raise exception 'Assessment % not found', p_assessment_id using errcode = 'P0002';
  end if;

  -- Step 2: Validate Caller Authorization
  if v_caller_id is not null then
    if v_caller_id <> p_published_by then
      raise exception 'Caller % cannot publish results on behalf of user %', v_caller_id, p_published_by
        using errcode = '42501';
    end if;

    select exists (
      select 1 from public.user_roles ur
      where ur.user_id = v_caller_id and ur.role = 'hod' and ur.active = true
    ) into v_is_hod;

    if not v_is_hod then
      select exists (
        select 1 from public.class_subjects cs
        where cs.id = v_assessment_rec.class_subject_id
          and cs.subject_teacher_id = v_caller_id
          and cs.active = true
      ) into v_is_authorized_teacher;

      if not v_is_authorized_teacher then
        raise exception 'User % is not authorized to publish results for assessment %', v_caller_id, p_assessment_id
          using errcode = '42501';
      end if;
    end if;
  else
    select exists (
      select 1 from public.user_roles ur
      where ur.user_id = p_published_by and ur.role = 'hod' and ur.active = true
    ) into v_is_hod;

    if not v_is_hod then
      select exists (
        select 1 from public.class_subjects cs
        where cs.id = v_assessment_rec.class_subject_id
          and cs.subject_teacher_id = p_published_by
          and cs.active = true
      ) into v_is_authorized_teacher;

      if not v_is_authorized_teacher then
        raise exception 'Publisher % is not authorized to publish results for assessment %', p_published_by, p_assessment_id
          using errcode = '42501';
      end if;
    end if;
  end if;

  -- Step 3: Prevent duplicate publication
  select exists (
    select 1 from public.result_publications
    where assessment_id = p_assessment_id
  ) into v_already_published;

  if v_already_published then
    raise exception 'Grades for assessment % have already been published', p_assessment_id
      using errcode = 'P0004';
  end if;

  -- Step 4: Verify student submissions exist
  select count(*) into v_sub_count
  from public.submissions
  where assessment_id = p_assessment_id;

  if v_sub_count = 0 then
    raise exception 'Cannot publish grades: No student submissions exist for assessment %', p_assessment_id
      using errcode = 'P0005';
  end if;

  -- Step 5: NOT EXISTS check (aborts transaction if even 1 submission lacks completed evaluation)
  select count(*) into v_incomplete_count
  from public.submissions s
  where s.assessment_id = p_assessment_id
    and not exists (
      select 1
      from public.evaluations e
      where e.submission_id = s.id
        and e.status = 'completed'
    );

  if v_incomplete_count > 0 then
    raise exception 'Cannot publish grades: % submitted assignment(s) are awaiting completed evaluation', v_incomplete_count
      using errcode = 'P0006';
  end if;

  -- Step 6: Level 2 Lock on all completed evaluations in deterministic ascending order
  perform e.id
  from public.evaluations e
  inner join public.submissions s on s.id = e.submission_id
  where s.assessment_id = p_assessment_id
    and e.status = 'completed'
  order by e.id asc
  for update of e;

  -- Step 7: Transition evaluations to published status
  update public.evaluations e
  set status = 'published',
      updated_at = v_published_at
  from public.submissions s
  where e.submission_id = s.id
    and s.assessment_id = p_assessment_id
    and e.status = 'completed';

  get diagnostics v_published_count = row_count;

  -- Step 8: Insert result publication record
  insert into public.result_publications (
    id, assessment_id, published_by, published_at, remarks
  ) values (
    gen_random_uuid(), p_assessment_id, p_published_by, v_published_at, p_remarks
  )
  returning id into v_publication_id;

  return jsonb_build_object(
    'publication', jsonb_build_object(
      'id', v_publication_id,
      'assessment_id', p_assessment_id,
      'published_by', p_published_by,
      'published_at', v_published_at,
      'remarks', p_remarks
    ),
    'published_count', v_published_count
  );
end;
$$;

revoke all on function public.publish_evaluation_results from public;
grant execute on function public.publish_evaluation_results to authenticated, service_role;

-- ============================================================================
-- 8. TRIGGER DEFINITIONS
-- ============================================================================

create or replace function public.guard_evaluation_criterion_score()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_status text;
  v_new_status text;
  v_crit_rec record;
  v_eval_assessment_id uuid;
begin
  if tg_op = 'UPDATE' then
    if old.evaluation_id <= new.evaluation_id then
      select status into v_old_status from public.evaluations where id = old.evaluation_id for update;
      if old.evaluation_id <> new.evaluation_id then
        select status into v_new_status from public.evaluations where id = new.evaluation_id for update;
      else
        v_new_status := v_old_status;
      end if;
    else
      select status into v_new_status from public.evaluations where id = new.evaluation_id for update;
      select status into v_old_status from public.evaluations where id = old.evaluation_id for update;
    end if;

    if v_old_status = 'published' or v_new_status = 'published' then
      raise exception 'Cannot modify criterion score for a published evaluation' using errcode = '42501';
    end if;
  elsif tg_op = 'INSERT' then
    select status into v_new_status from public.evaluations where id = new.evaluation_id for update;
    if v_new_status = 'published' then
      raise exception 'Cannot insert criterion score into a published evaluation' using errcode = '42501';
    end if;
  end if;

  select s.assessment_id into v_eval_assessment_id
  from public.evaluations e
  inner join public.submissions s on s.id = e.submission_id
  where e.id = new.evaluation_id;

  select rc.id, rc.max_marks into v_crit_rec
  from public.rubric_criteria rc
  inner join public.rubric_versions rv on rv.id = rc.rubric_version_id
  where rc.id = new.criterion_id
    and rv.assessment_id = v_eval_assessment_id;

  if not found then
    raise exception 'Criterion % does not belong to the assessment rubric for evaluation %',
      new.criterion_id, new.evaluation_id using errcode = 'P0003';
  end if;

  if new.score < 0 or new.score > v_crit_rec.max_marks then
    raise exception 'Score % is out of bounds for criterion % (max: %)',
      new.score, new.criterion_id, v_crit_rec.max_marks using errcode = '22003';
  end if;

  return new;
end;
$$;

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
    -- Protected: Only permit deletion during controlled permanent deletion
    -- when transaction setting is true AND parent assessment is in deletion_pending status
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
    -- Protected: Only permit deletion during controlled permanent deletion
    -- when transaction setting is true AND parent assessment is in deletion_pending status
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

drop trigger if exists trg_guard_evaluation_criterion_score on public.evaluation_criterion_scores;
create trigger trg_guard_evaluation_criterion_score
before insert or update on public.evaluation_criterion_scores
for each row execute function public.guard_evaluation_criterion_score();

drop trigger if exists trg_guard_evaluation_criterion_score_delete on public.evaluation_criterion_scores;
create trigger trg_guard_evaluation_criterion_score_delete
before delete on public.evaluation_criterion_scores
for each row execute function public.guard_evaluation_criterion_score_delete();

drop trigger if exists trg_guard_evaluation_delete on public.evaluations;
create trigger trg_guard_evaluation_delete
before delete on public.evaluations
for each row execute function public.guard_evaluation_delete();

-- ============================================================================
-- 9. PRIVILEGE HARDENING & RLS POLICY CLEANUP
-- ============================================================================

-- Restrict direct client writes on questions, rubric_versions, rubric_criteria
revoke insert, update, delete on public.questions from authenticated, anon, public;
revoke insert, update, delete on public.rubric_versions from authenticated, anon, public;
revoke insert, update, delete on public.rubric_criteria from authenticated, anon, public;

-- Restrict status-tampering on assessments
revoke update, insert on public.assessments from authenticated, anon, public;

grant insert (
  id, class_subject_id, title, instructions, deadline_at, status, created_by, version,
  document_storage_key, document_filename, document_size_bytes, document_mime_type,
  max_files, allow_late, extension_deadline_at, late_penalty_mode, late_penalty_marks,
  max_marks, created_at, updated_at
) on public.assessments to authenticated;

grant update (
  title, instructions, deadline_at, max_files, allow_late, extension_deadline_at,
  late_penalty_mode, late_penalty_marks, document_storage_key, document_filename,
  document_size_bytes, document_mime_type, updated_at
) on public.assessments to authenticated;

