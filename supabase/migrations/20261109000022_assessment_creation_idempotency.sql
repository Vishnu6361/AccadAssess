-- ==============================================================================
-- Migration: 20261109000022_assessment_creation_idempotency.sql
-- Description: Enforce assignment creation idempotency to permanently prevent
--              duplicate draft assignments caused by rapid repeated clicks or
--              network retries.
-- ==============================================================================

-- 1. Add idempotency_key column to assessments table
alter table public.assessments
  add column if not exists idempotency_key text;

-- 2. Create partial unique index on (created_by, idempotency_key)
--    Using a partial index where idempotency_key IS NOT NULL ensures:
--    a) Existing historical assessments with NULL idempotency_key are unaffected.
--    b) Multiple distinct creations by the same teacher require distinct keys.
--    c) Rapid repeated requests with the same idempotency key are rejected or deduplicated at DB level.
create unique index if not exists idx_assessments_created_by_idempotency_key
  on public.assessments (created_by, idempotency_key)
  where idempotency_key is not null;

-- 3. Replace public.save_draft_assessment_atomic with idempotency support
-- Drop the 16-parameter overload from migration 20 before creating the 17-parameter version
drop function if exists public.save_draft_assessment_atomic(uuid, uuid, text, text, timestamptz, boolean, timestamptz, text, numeric, text, text, bigint, text, uuid, jsonb, jsonb);

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
  p_idempotency_key text default null
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
        max_marks = 50,
        updated_at = v_now
    where id = v_assessment_id;
  else
    begin
      insert into public.assessments (
        id, class_subject_id, title, instructions, deadline_at,
        status, created_by, version, max_marks,
        allow_late, extension_deadline_at, late_penalty_mode, late_penalty_marks,
        document_storage_key, document_filename, document_size_bytes, document_mime_type,
        idempotency_key,
        created_at, updated_at
      ) values (
        v_assessment_id, v_class_subject_id, p_title, p_instructions, p_deadline_at,
        'draft', v_caller_id, 1, 50,
        p_allow_late, p_extension_deadline_at, p_late_penalty_mode, p_late_penalty_marks,
        p_document_storage_key, p_document_filename, p_document_size_bytes, p_document_mime_type,
        p_idempotency_key,
        v_now, v_now
      );
    exception when unique_violation then
      -- If concurrent transaction created the assessment with the same idempotency_key, return it
      if p_idempotency_key is not null then
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
            'idempotent_replay', true
          );
        end if;
      end if;
      raise;
    end;
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

revoke all on function public.save_draft_assessment_atomic(uuid, uuid, text, text, timestamptz, boolean, timestamptz, text, numeric, text, text, bigint, text, uuid, jsonb, jsonb, text) from public;
grant execute on function public.save_draft_assessment_atomic(uuid, uuid, text, text, timestamptz, boolean, timestamptz, text, numeric, text, text, bigint, text, uuid, jsonb, jsonb, text) to authenticated, service_role;

